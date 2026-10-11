import { Qapik, toQapik, addMoney, subtractMoney } from '../../../shared/utils/money';
import { SEEDED_CATALOG_PRODUCTS } from '../../catalog/data/taxonomyData';
import {
  PosShift,
  PosRegister,
  PosCartItem,
  CartTotals,
  CartPromotion,
  CustomerLoyalty,
  SuspendedCart,
  Receipt,
  PaymentTerminalConfig,
  ServerValidationResult,
  ProcessSaleRequest,
  XReportData,
  ZReportData,
  LineDiscountType,
  CashTransaction,
} from '../types';

// Mock active registers per branch
const INITIAL_REGISTERS: PosRegister[] = [
  { id: 'reg-01', branchId: 'branch-1', name: 'Kassa 1 (Əsas)', code: 'BH01-K1', isActive: true },
  { id: 'reg-02', branchId: 'branch-1', name: 'Kassa 2 (Ekspres)', code: 'BH01-K2', isActive: true },
  { id: 'reg-03', branchId: 'branch-2', name: 'Kassa 1 (Gənclik)', code: 'BH02-K1', isActive: true },
  { id: 'reg-04', branchId: 'branch-2', name: 'Kassa 2 (Gənclik)', code: 'BH02-K2', isActive: true },
  { id: 'reg-05', branchId: 'branch-3', name: 'Kassa 1 (28 Mall)', code: 'BH03-K1', isActive: true },
  { id: 'reg-06', branchId: 'branch-4', name: 'Kassa 1 (Dəniz Mall)', code: 'BH04-K1', isActive: true },
];

// Mock loyalty customers
const INITIAL_CUSTOMERS: CustomerLoyalty[] = [
  {
    id: 'cust-01',
    name: 'Elvin Məmmədov',
    phone: '+994 50 234 56 78',
    cardNumber: 'BH-GOLD-8891',
    tier: 'gold',
    pointsAvailable: 2450, // 24.50 AZN value
    marketingConsent: true,
  },
  {
    id: 'cust-02',
    name: 'Aysel Quliyeva',
    phone: '+994 55 987 65 43',
    cardNumber: 'BH-VIP-1002',
    tier: 'vip',
    pointsAvailable: 5800, // 58.00 AZN value
    marketingConsent: true,
  },
  {
    id: 'cust-03',
    name: 'Tural Əliyev',
    phone: '+994 70 333 44 55',
    cardNumber: 'BH-SILVER-4032',
    tier: 'silver',
    pointsAvailable: 850, // 8.50 AZN value
    marketingConsent: false,
  },
];

// In-memory server state
class PosServerState {
  shifts: Map<string, PosShift> = new Map();
  registers: PosRegister[] = [...INITIAL_REGISTERS];
  customers: CustomerLoyalty[] = [...INITIAL_CUSTOMERS];
  suspendedSales: Map<string, SuspendedCart> = new Map();
  receipts: Map<string, Receipt> = new Map();
  idempotentRequests: Map<string, Receipt> = new Map(); // idempotencyKey -> Receipt
  
  // Terminal config - By default false to enforce explicit error per prompt requirement:
  // "If no terminal/provider is configured show 'Ödəniş terminalı konfiqurasiya olunmayıb' and block card tender"
  terminalConfig: PaymentTerminalConfig = {
    isConfigured: false,
    providerName: 'Kapital Bank SmartPOS',
    allowManualCardFallback: true,
  };

  // Negative stock policy on server
  negativeStockPolicy: 'allowed' | 'blocked' | 'manager_override' = 'blocked';

  constructor() {
    this.seedDefaultShift();
  }

  seedDefaultShift() {
    const defaultShift: PosShift = {
      id: 'shift-today-01',
      cashierId: 'usr-004',
      cashierName: 'Aytən Həsənova',
      branchId: 'branch-2',
      branchName: 'Gənclik Mall Filialı',
      registerId: 'reg-03',
      registerName: 'Kassa 1 (Gənclik)',
      openedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      status: 'open',
      openingFloatQapik: toQapik(15000), // 150.00 AZN float
      openingDenominations: { '50': 2, '20': 2, '10': 1 },
      cashTransactions: [],
      salesCount: 3,
      totalSalesQapik: toQapik(45980),
      cashSalesQapik: toQapik(22000),
      cardSalesQapik: toQapik(23980),
      otherSalesQapik: toQapik(0),
      returnsCount: 0,
      totalReturnsQapik: toQapik(0),
      expectedCashQapik: toQapik(37000), // 150 + 220 = 370.00 AZN
      receiptSequence: 4,
    };
    this.shifts.set(defaultShift.id, defaultShift);
  }
}

export const posServer = new PosServerState();

export class PosService {
  // Set payment terminal state for testing/config
  static setTerminalConfig(config: Partial<PaymentTerminalConfig>) {
    posServer.terminalConfig = { ...posServer.terminalConfig, ...config };
  }

  static getTerminalConfig(): PaymentTerminalConfig {
    return { ...posServer.terminalConfig };
  }

  static setNegativeStockPolicy(policy: 'allowed' | 'blocked' | 'manager_override') {
    posServer.negativeStockPolicy = policy;
  }

  // Get active shift for a cashier or branch/register
  static async getActiveShift(branchId: string, registerId: string): Promise<PosShift | null> {
    for (const shift of posServer.shifts.values()) {
      if (shift.status === 'open' && shift.branchId === branchId && shift.registerId === registerId) {
        return { ...shift };
      }
    }
    return null;
  }

  static async getRegisters(branchId: string): Promise<PosRegister[]> {
    return posServer.registers.filter((r) => r.branchId === branchId);
  }

  // Open a new shift
  static async openShift(params: {
    cashierId: string;
    cashierName: string;
    branchId: string;
    branchName: string;
    registerId: string;
    registerName: string;
    openingFloatQapik: Qapik;
    denominations: Record<string, number>;
  }): Promise<PosShift> {
    // Check if open shift exists for this register
    for (const s of posServer.shifts.values()) {
      if (s.registerId === params.registerId && s.status === 'open') {
        throw new Error('Bu kassa aparatında artıq açıq növbə mövcuddur!');
      }
    }

    const newShift: PosShift = {
      id: `shift-${Date.now()}`,
      cashierId: params.cashierId,
      cashierName: params.cashierName,
      branchId: params.branchId,
      branchName: params.branchName,
      registerId: params.registerId,
      registerName: params.registerName,
      openedAt: new Date().toISOString(),
      status: 'open',
      openingFloatQapik: params.openingFloatQapik,
      openingDenominations: { ...params.denominations },
      cashTransactions: [],
      salesCount: 0,
      totalSalesQapik: toQapik(0),
      cashSalesQapik: toQapik(0),
      cardSalesQapik: toQapik(0),
      otherSalesQapik: toQapik(0),
      returnsCount: 0,
      totalReturnsQapik: toQapik(0),
      expectedCashQapik: params.openingFloatQapik,
      receiptSequence: 1,
    };

    posServer.shifts.set(newShift.id, newShift);
    return { ...newShift };
  }

  // Close shift (Z-Report)
  static async closeShift(params: {
    shiftId: string;
    countedCashQapik: Qapik;
    denominations: Record<string, number>;
    varianceReason?: string;
    managerPin?: string;
  }): Promise<ZReportData> {
    const shift = posServer.shifts.get(params.shiftId);
    if (!shift) throw new Error('Növbə tapılmadı');
    if (shift.status !== 'open') throw new Error('Növbə artıq bağlanıb');

    const expectedCash = shift.expectedCashQapik;
    const varianceQapik = subtractMoney(params.countedCashQapik, expectedCash);

    // Variance tolerance check: if > 5.00 AZN (500 Qapik) variance, reason is strictly required
    const absVariance = Math.abs(varianceQapik);
    if (absVariance > 500 && (!params.varianceReason || !params.varianceReason.trim())) {
      throw new Error('Kassa fərqi icazə verilən limitdən çoxdur (±5.00 ₼). Səbəb qeyd edilməlidir!');
    }

    // Manager confirmation validation
    const managerApproved = !!(params.managerPin && (params.managerPin === '9999' || params.managerPin === '1234'));

    shift.status = 'closed';
    shift.closedAt = new Date().toISOString();
    shift.countedCashQapik = params.countedCashQapik;
    shift.varianceQapik = varianceQapik;
    shift.varianceReason = params.varianceReason;
    shift.managerPinApproved = managerApproved;
    shift.closingDenominations = { ...params.denominations };

    const zReport: ZReportData = {
      shiftId: shift.id,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      generatedAt: new Date().toISOString(),
      cashierName: shift.cashierName,
      branchName: shift.branchName,
      registerName: shift.registerName,
      openingFloatQapik: shift.openingFloatQapik,
      salesCount: shift.salesCount,
      grossSalesQapik: shift.totalSalesQapik,
      discountsQapik: toQapik(0),
      netSalesQapik: shift.totalSalesQapik,
      taxQapik: toQapik(Math.round(shift.totalSalesQapik * 0.18 / 1.18)),
      cashSalesQapik: shift.cashSalesQapik,
      cardSalesQapik: shift.cardSalesQapik,
      otherSalesQapik: shift.otherSalesQapik,
      cashInQapik: toQapik(
        shift.cashTransactions.filter((c) => c.type === 'cash_in').reduce((s, c) => s + c.amountQapik, 0)
      ),
      cashOutQapik: toQapik(
        shift.cashTransactions.filter((c) => c.type === 'cash_out').reduce((s, c) => s + c.amountQapik, 0)
      ),
      returnsCount: shift.returnsCount,
      returnsTotalQapik: shift.totalReturnsQapik,
      expectedDrawerCashQapik: shift.expectedCashQapik,
      countedCashQapik: params.countedCashQapik,
      varianceQapik: varianceQapik,
      varianceReason: params.varianceReason,
      managerPinApproved: managerApproved,
    };

    return zReport;
  }

  // Mid-shift X-Report
  static async getXReport(shiftId: string): Promise<XReportData> {
    const shift = posServer.shifts.get(shiftId);
    if (!shift) throw new Error('Növbə tapılmadı');

    const cashIn = shift.cashTransactions
      .filter((c) => c.type === 'cash_in')
      .reduce((sum, c) => sum + c.amountQapik, 0);
    const cashOut = shift.cashTransactions
      .filter((c) => c.type === 'cash_out')
      .reduce((sum, c) => sum + c.amountQapik, 0);

    return {
      shiftId: shift.id,
      openedAt: shift.openedAt,
      generatedAt: new Date().toISOString(),
      cashierName: shift.cashierName,
      branchName: shift.branchName,
      registerName: shift.registerName,
      openingFloatQapik: shift.openingFloatQapik,
      salesCount: shift.salesCount,
      grossSalesQapik: shift.totalSalesQapik,
      discountsQapik: toQapik(0),
      netSalesQapik: shift.totalSalesQapik,
      taxQapik: toQapik(Math.round(shift.totalSalesQapik * 0.18 / 1.18)),
      cashSalesQapik: shift.cashSalesQapik,
      cardSalesQapik: shift.cardSalesQapik,
      otherSalesQapik: shift.otherSalesQapik,
      cashInQapik: toQapik(cashIn),
      cashOutQapik: toQapik(cashOut),
      returnsCount: shift.returnsCount,
      returnsTotalQapik: shift.totalReturnsQapik,
      expectedDrawerCashQapik: shift.expectedCashQapik,
    };
  }

  // Cash In / Cash Out
  static async recordCashTransaction(params: {
    shiftId: string;
    type: 'cash_in' | 'cash_out';
    amountQapik: Qapik;
    reason: string;
    cashierId: string;
    cashierName: string;
    attachmentName?: string;
  }): Promise<PosShift> {
    const shift = posServer.shifts.get(params.shiftId);
    if (!shift || shift.status !== 'open') throw new Error('Aktiv açıq növbə tapılmadı');

    if (params.amountQapik <= 0) throw new Error('Məbləğ sıfırdan böyük olmalıdır');
    if (!params.reason.trim()) throw new Error('Səbəb qeyd edilməlidir');

    if (params.type === 'cash_out' && params.amountQapik > shift.expectedCashQapik) {
      throw new Error('Kassada kifayət qədər nağd vəsait yoxdur!');
    }

    const tx: CashTransaction = {
      id: `ctx-${Date.now()}`,
      type: params.type,
      amountQapik: params.amountQapik,
      reason: params.reason,
      cashierId: params.cashierId,
      cashierName: params.cashierName,
      timestamp: new Date().toISOString(),
      attachmentName: params.attachmentName,
    };

    shift.cashTransactions.push(tx);
    if (params.type === 'cash_in') {
      shift.expectedCashQapik = addMoney(shift.expectedCashQapik, params.amountQapik);
    } else {
      shift.expectedCashQapik = subtractMoney(shift.expectedCashQapik, params.amountQapik);
    }

    return { ...shift };
  }

  // Real-time server price and stock validation
  static async validateCart(items: PosCartItem[], _branchId?: string): Promise<ServerValidationResult> {
    const errorMessages: string[] = [];
    let hasPriceChanges = false;
    let hasStockIssues = false;

    const updatedItems = items.map((item) => {
      // Find product in catalog
      const catalogProd = SEEDED_CATALOG_PRODUCTS.find((p) => p.id === item.productId);
      if (!catalogProd) {
        errorMessages.push(`Məhsul sistemdə tapılmadı: ${item.productName}`);
        return item;
      }

      const variant = catalogProd.variants.find((v) => v.id === item.variantId);
      const serverPrice = catalogProd.priceQapik;
      const serverStock = variant?.stockQty ?? catalogProd.stockQty;

      const updated: PosCartItem = {
        ...item,
        serverStockAvailable: serverStock,
      };

      // Check price change
      if (serverPrice !== item.unitPriceQapik) {
        hasPriceChanges = true;
        updated.priceChangedNotice = `Qiymət dəyişib: ${item.unitPriceQapik / 100} ₼ -> ${serverPrice / 100} ₼`;
        updated.unitPriceQapik = serverPrice;
        // Recalculate line total
        updated.lineTotalQapik = toQapik(serverPrice * item.quantity);
      }

      // Check stock
      if (item.quantity > serverStock) {
        if (posServer.negativeStockPolicy === 'blocked') {
          hasStockIssues = true;
          errorMessages.push(
            `Kifayət qədər qalıq yoxdur: ${item.productName} (${item.size}/${item.color}). Mövcud: ${serverStock}, Tələb: ${item.quantity}`
          );
        }
      }

      return updated;
    });

    return {
      isValid: errorMessages.length === 0,
      hasPriceChanges,
      hasStockIssues,
      negativeStockPolicy: posServer.negativeStockPolicy,
      updatedItems,
      errorMessages,
    };
  }

  // Server-authoritative promotion calculation & stacking
  static async evaluatePromotions(
    items: PosCartItem[],
    customer?: CustomerLoyalty,
    promoCode?: string,
    redeemPoints = false
  ): Promise<CartPromotion[]> {
    const promotions: CartPromotion[] = [];
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.lineTotalQapik, 0);

    // Rule 1: Multi-buy Campaign: 3+ items get 10% bundle discount
    if (totalQty >= 3 && subtotal > 0) {
      const discount = toQapik(Math.round(subtotal * 0.1));
      promotions.push({
        id: 'promo-multibuy-10',
        name: '3+ Məhsula 10% Paket Endirimi',
        type: 'campaign',
        discountQapik: discount,
        description: 'Səbətdə 3 və daha çox məhsul olduğu üçün 10% sistem endirimi',
      });
    }

    // Rule 2: Promo codes
    if (promoCode) {
      const codeUpper = promoCode.trim().toUpperCase();
      if (codeUpper === 'YAY2026') {
        const discount = toQapik(1500); // 15.00 AZN
        promotions.push({
          id: 'promo-code-yay2026',
          name: 'YAY2026 Promokodu (-15 ₼)',
          code: 'YAY2026',
          type: 'promo_code',
          discountQapik: discount,
          description: '15.00 ₼ birdəfəlik kupon endirimi',
        });
      } else if (codeUpper === 'SALE20') {
        const discount = toQapik(Math.round(subtotal * 0.2));
        promotions.push({
          id: 'promo-code-sale20',
          name: 'SALE20 Promokodu (-20%)',
          code: 'SALE20',
          type: 'promo_code',
          discountQapik: discount,
          description: 'Səbətə 20% xüsusi promokod endirimi',
        });
      }
    }

    // Rule 3: Customer VIP / Loyalty tier automatic perk
    if (customer) {
      if (customer.tier === 'vip') {
        const vipDiscount = toQapik(Math.round(subtotal * 0.05));
        promotions.push({
          id: 'promo-vip-5',
          name: 'VIP Müştəri Status Endirimi (-5%)',
          type: 'campaign',
          discountQapik: vipDiscount,
          description: 'VIP loyallıq səviyyəsi üzrə əlavə 5% daimi endirim',
        });
      }

      // Rule 4: Loyalty Points Redemption
      if (redeemPoints && customer.pointsAvailable > 0) {
        // 100 points = 1.00 AZN (100 Qapik) -> pointsAvailable = Qapik value
        // Limit points redemption to maximum 50% of basket subtotal
        const maxRedeemableQapik = Math.floor(subtotal / 2);
        const actualRedeemQapik = Math.min(customer.pointsAvailable, maxRedeemableQapik);
        if (actualRedeemQapik > 0) {
          promotions.push({
            id: 'promo-loyalty-points',
            name: `Loyallıq Bonus Xalları (${actualRedeemQapik} xal)`,
            type: 'loyalty_points',
            discountQapik: toQapik(actualRedeemQapik),
            description: `${(actualRedeemQapik / 100).toFixed(2)} ₼ loyallıq xalının silinməsi`,
          });
        }
      }
    }

    return promotions;
  }

  // Calculate cart totals accurately using integer Qapik
  static calculateTotals(
    items: PosCartItem[],
    receiptDiscountType: LineDiscountType = 'none',
    receiptDiscountValue = 0,
    promotions: CartPromotion[] = []
  ): CartTotals {
    const itemCount = items.reduce((s, i) => s + i.quantity, 0);
    const subtotalQapik = toQapik(items.reduce((s, i) => s + i.unitPriceQapik * i.quantity, 0));

    // Line discounts sum
    const lineDiscountsQapik = toQapik(
      items.reduce((s, i) => s + (i.lineDiscountAmountQapik || 0), 0)
    );

    const afterLineDiscounts = Math.max(0, subtotalQapik - lineDiscountsQapik);

    // Receipt level manual discount
    let receiptDiscountQapik = toQapik(0);
    if (receiptDiscountType === 'percent') {
      const pct = Math.min(100, Math.max(0, receiptDiscountValue));
      receiptDiscountQapik = toQapik(Math.round((afterLineDiscounts * pct) / 100));
    } else if (receiptDiscountType === 'fixed') {
      receiptDiscountQapik = toQapik(Math.min(afterLineDiscounts, receiptDiscountValue));
    }

    // Promotions discount
    const promoSum = promotions
      .filter((p) => p.type !== 'loyalty_points')
      .reduce((s, p) => s + p.discountQapik, 0);
    const promotionsDiscountQapik = toQapik(promoSum);

    // Loyalty points discount
    const loyaltyItem = promotions.find((p) => p.type === 'loyalty_points');
    const loyaltyRedeemedQapik = toQapik(loyaltyItem ? loyaltyItem.discountQapik : 0);

    const totalDiscountQapik = toQapik(
      lineDiscountsQapik + receiptDiscountQapik + promotionsDiscountQapik + loyaltyRedeemedQapik
    );

    const grandTotalQapik = toQapik(Math.max(0, subtotalQapik - totalDiscountQapik));

    // In Azerbaijan, standard retail pricing includes 18% VAT (ƏDV)
    // VAT = Gross * 18 / 118
    const taxQapik = toQapik(Math.round((grandTotalQapik * 18) / 118));
    const taxableSubtotalQapik = subtractMoney(grandTotalQapik, taxQapik);

    return {
      subtotalQapik,
      lineDiscountsQapik,
      receiptDiscountQapik,
      promotionsDiscountQapik,
      loyaltyRedeemedQapik,
      totalDiscountQapik,
      taxableSubtotalQapik,
      taxQapik,
      grandTotalQapik,
      itemCount,
    };
  }

  // Process a sale with Idempotency Key protection
  static async processSale(request: ProcessSaleRequest): Promise<Receipt> {
    // 1. Check Idempotency-Key
    if (request.idempotencyKey && posServer.idempotentRequests.has(request.idempotencyKey)) {
      // Reused attempt: return original receipt without duplicate sale creation
      return posServer.idempotentRequests.get(request.idempotencyKey)!;
    }

    // 2. Validate active shift
    const shift = posServer.shifts.get(request.shiftId);
    if (!shift || shift.status !== 'open') {
      throw new Error('Açıq kassa növbəsi olmadan satış icra edilə bilməz!');
    }

    if (!request.items || request.items.length === 0) {
      throw new Error('Səbət boşdur!');
    }

    // 3. Validate card tender against terminal configuration
    for (const tender of request.tenders) {
      if (tender.type === 'card') {
        const terminalConfig = posServer.terminalConfig;
        if (!terminalConfig.isConfigured) {
          // If terminal not configured and manual reference is missing, throw exact error
          if (!tender.referenceNumber || !tender.referenceNumber.trim()) {
            throw new Error(
              'Ödəniş terminalı konfiqurasiya olunmayıb (Xarici terminal təsdiq nömrəsi daxil edilməlidir)'
            );
          }
        }
      }
    }

    // 4. Calculate totals
    const promotions = await this.evaluatePromotions(
      request.items,
      request.customer,
      request.promoCode,
      request.redeemPoints
    );
    const totals = this.calculateTotals(
      request.items,
      request.receiptDiscountType,
      request.receiptDiscountValue,
      promotions
    );

    // 5. Validate tender sum equals grand total
    const totalTendered = request.tenders.reduce((sum, t) => sum + t.amountQapik, 0);
    if (totalTendered !== totals.grandTotalQapik) {
      throw new Error(
        `Ödəniş məbləği yekun məbləğə uyğun deyil! Ödənilən: ${(totalTendered / 100).toFixed(2)} ₼, Tələb olunan: ${(totals.grandTotalQapik / 100).toFixed(2)} ₼`
      );
    }

    // 6. Generate sequential receipt number
    shift.receiptSequence = (shift.receiptSequence || 0) + 1;
    const seqPadded = shift.receiptSequence.toString().padStart(4, '0');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const receiptNumber = `RCP-${shift.registerName.replace(/[^a-zA-Z0-9]/g, '')}-${dateStr}-${seqPadded}`;

    // 7. Update shift counters
    let cashPaid = toQapik(0);
    let cardPaid = toQapik(0);
    let otherPaid = toQapik(0);

    for (const t of request.tenders) {
      if (t.type === 'cash') cashPaid = addMoney(cashPaid, t.amountQapik);
      else if (t.type === 'card') cardPaid = addMoney(cardPaid, t.amountQapik);
      else otherPaid = addMoney(otherPaid, t.amountQapik);
    }

    shift.salesCount += 1;
    shift.totalSalesQapik = addMoney(shift.totalSalesQapik, totals.grandTotalQapik);
    shift.cashSalesQapik = addMoney(shift.cashSalesQapik, cashPaid);
    shift.cardSalesQapik = addMoney(shift.cardSalesQapik, cardPaid);
    shift.otherSalesQapik = addMoney(shift.otherSalesQapik, otherPaid);
    shift.expectedCashQapik = addMoney(shift.expectedCashQapik, cashPaid);

    // 8. Deduct customer points if redeemed
    if (request.redeemPoints && request.customer && totals.loyaltyRedeemedQapik > 0) {
      const cust = posServer.customers.find((c) => c.id === request.customer?.id);
      if (cust) {
        cust.pointsAvailable = Math.max(0, cust.pointsAvailable - totals.loyaltyRedeemedQapik);
      }
    }

    const receipt: Receipt = {
      id: `rcp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      receiptNumber,
      shiftId: shift.id,
      branchId: shift.branchId,
      branchName: shift.branchName,
      registerId: shift.registerId,
      registerName: shift.registerName,
      cashierId: request.cashierId,
      cashierName: request.cashierName,
      customer: request.customer,
      items: [...request.items],
      subtotalQapik: totals.subtotalQapik,
      discountQapik: totals.totalDiscountQapik,
      taxQapik: totals.taxQapik,
      grandTotalQapik: totals.grandTotalQapik,
      tenders: [...request.tenders],
      cashTenderedQapik: request.cashTenderedQapik,
      changeDueQapik: request.changeDueQapik,
      appliedPromotions: promotions,
      createdAt: new Date().toISOString(),
      status: 'completed',
      idempotencyKey: request.idempotencyKey,
      reprintCount: 0,
    };

    posServer.receipts.set(receipt.id, receipt);
    if (request.idempotencyKey) {
      posServer.idempotentRequests.set(request.idempotencyKey, receipt);
    }

    return receipt;
  }

  // Receipt Reprint with Audit
  static async reprintReceipt(receiptId: string, reason: string): Promise<Receipt> {
    const receipt = posServer.receipts.get(receiptId);
    if (!receipt) throw new Error('Çek tapılmadı');
    if (!reason || !reason.trim()) throw new Error('Təkrar çap üçün səbəb mütləqdir!');

    receipt.reprintCount += 1;
    receipt.lastReprintReason = reason;
    receipt.lastReprintAt = new Date().toISOString();

    return { ...receipt };
  }

  // Void Receipt with Manager Approval
  static async voidSale(receiptId: string, managerPin: string, reason: string): Promise<Receipt> {
    const receipt = posServer.receipts.get(receiptId);
    if (!receipt) throw new Error('Çek tapılmadı');
    if (receipt.status === 'voided') throw new Error('Bu çek artıq ləğv edilib');

    // Verify manager PIN
    if (managerPin !== '9999' && managerPin !== '1234') {
      throw new Error('Menecer PIN kodu yanlışdır!');
    }

    if (!reason || !reason.trim()) {
      throw new Error('Çekin ləğv edilməsi üçün səbəb qeyd edilməlidir!');
    }

    // Find shift and reverse totals (Completed sales are NEVER deleted, only reversed)
    const shift = posServer.shifts.get(receipt.shiftId);
    if (shift) {
      shift.returnsCount += 1;
      shift.totalReturnsQapik = addMoney(shift.totalReturnsQapik, receipt.grandTotalQapik);
      shift.totalSalesQapik = subtractMoney(shift.totalSalesQapik, receipt.grandTotalQapik);

      for (const t of receipt.tenders) {
        if (t.type === 'cash') {
          shift.cashSalesQapik = subtractMoney(shift.cashSalesQapik, t.amountQapik);
          shift.expectedCashQapik = subtractMoney(shift.expectedCashQapik, t.amountQapik);
        } else if (t.type === 'card') {
          shift.cardSalesQapik = subtractMoney(shift.cardSalesQapik, t.amountQapik);
        } else {
          shift.otherSalesQapik = subtractMoney(shift.otherSalesQapik, t.amountQapik);
        }
      }
    }

    receipt.status = 'voided';
    receipt.voidReason = reason;
    receipt.voidedBy = 'Menecer Təsdiqi';
    receipt.voidedAt = new Date().toISOString();

    return { ...receipt };
  }

  // Lookup receipt by number or barcode (for reprint, return, or void)
  static async lookupReceipt(query: string): Promise<Receipt | null> {
    const clean = query.trim().toUpperCase();
    for (const r of posServer.receipts.values()) {
      if (r.receiptNumber.toUpperCase() === clean || r.id === query) {
        return { ...r };
      }
    }
    return null;
  }

  // List recent receipts for active shift
  static async getShiftReceipts(shiftId: string): Promise<Receipt[]> {
    return Array.from(posServer.receipts.values())
      .filter((r) => r.shiftId === shiftId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Customer Search & Quick-Create
  static async searchCustomers(query: string): Promise<CustomerLoyalty[]> {
    const q = query.toLowerCase().trim();
    if (!q) return posServer.customers.slice(0, 10);
    return posServer.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.cardNumber.toLowerCase().includes(q)
    );
  }

  static async createCustomer(params: {
    name: string;
    phone: string;
    marketingConsent: boolean;
  }): Promise<CustomerLoyalty> {
    const newCust: CustomerLoyalty = {
      id: `cust-${Date.now()}`,
      name: params.name,
      phone: params.phone,
      cardNumber: `BH-${Math.floor(1000 + Math.random() * 9000)}`,
      tier: 'standard',
      pointsAvailable: 100, // 1.00 AZN welcome bonus
      marketingConsent: params.marketingConsent,
    };
    posServer.customers.push(newCust);
    return newCust;
  }

  // Suspended Sales (Parked Carts)
  static async suspendSale(cart: {
    label: string;
    branchId: string;
    cashierId: string;
    cashierName: string;
    items: PosCartItem[];
    customer?: CustomerLoyalty;
    notes?: string;
    receiptDiscountType: LineDiscountType;
    receiptDiscountValue: number;
  }): Promise<SuspendedCart> {
    const suspended: SuspendedCart = {
      id: `susp-${Date.now()}`,
      label: cart.label || `Səbət #${posServer.suspendedSales.size + 1}`,
      branchId: cart.branchId,
      cashierId: cart.cashierId,
      cashierName: cart.cashierName,
      savedAt: new Date().toISOString(),
      items: [...cart.items],
      customer: cart.customer,
      notes: cart.notes,
      receiptDiscountType: cart.receiptDiscountType,
      receiptDiscountValue: cart.receiptDiscountValue,
    };
    posServer.suspendedSales.set(suspended.id, suspended);
    return suspended;
  }

  static async getSuspendedSales(branchId: string): Promise<SuspendedCart[]> {
    return Array.from(posServer.suspendedSales.values())
      .filter((s) => s.branchId === branchId)
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }

  static async recallSuspendedSale(id: string): Promise<SuspendedCart | null> {
    const cart = posServer.suspendedSales.get(id);
    if (!cart) return null;
    posServer.suspendedSales.delete(id);
    return cart;
  }
}
