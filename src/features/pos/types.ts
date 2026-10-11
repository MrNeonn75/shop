import { Qapik } from '../../shared/utils/money';

export interface DenominationItem {
  valueAzn: number; // e.g. 200, 100, 50, 20, 10, 5, 1, 0.50, 0.20, 0.10, 0.05, 0.03, 0.01
  label: string; // e.g. '200 ₼', '50 qəp'
  type: 'note' | 'coin';
  count: number;
}

export const AZN_DENOMINATIONS_TEMPLATE: Omit<DenominationItem, 'count'>[] = [
  { valueAzn: 200, label: '200 ₼', type: 'note' },
  { valueAzn: 100, label: '100 ₼', type: 'note' },
  { valueAzn: 50, label: '50 ₼', type: 'note' },
  { valueAzn: 20, label: '20 ₼', type: 'note' },
  { valueAzn: 10, label: '10 ₼', type: 'note' },
  { valueAzn: 5, label: '5 ₼', type: 'note' },
  { valueAzn: 1, label: '1 ₼', type: 'note' },
  { valueAzn: 0.5, label: '50 qəp', type: 'coin' },
  { valueAzn: 0.2, label: '20 qəp', type: 'coin' },
  { valueAzn: 0.1, label: '10 qəp', type: 'coin' },
  { valueAzn: 0.05, label: '5 qəp', type: 'coin' },
  { valueAzn: 0.03, label: '3 qəp', type: 'coin' },
  { valueAzn: 0.01, label: '1 qəp', type: 'coin' },
];

export interface CashTransaction {
  id: string;
  type: 'cash_in' | 'cash_out';
  amountQapik: Qapik;
  reason: string;
  cashierId: string;
  cashierName: string;
  timestamp: string;
  attachmentName?: string;
}

export interface PosShift {
  id: string;
  cashierId: string;
  cashierName: string;
  branchId: string;
  branchName: string;
  registerId: string;
  registerName: string;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  openingFloatQapik: Qapik;
  openingDenominations: Record<string, number>; // valueKey -> count
  cashTransactions: CashTransaction[];
  salesCount: number;
  totalSalesQapik: Qapik;
  cashSalesQapik: Qapik;
  cardSalesQapik: Qapik;
  otherSalesQapik: Qapik;
  returnsCount: number;
  totalReturnsQapik: Qapik;
  expectedCashQapik: Qapik;
  countedCashQapik?: Qapik;
  varianceQapik?: Qapik;
  varianceReason?: string;
  managerPinApproved?: boolean;
  closingDenominations?: Record<string, number>;
  receiptSequence: number;
}

export interface PosRegister {
  id: string;
  branchId: string;
  name: string;
  code: string;
  isActive: boolean;
  currentShiftId?: string;
}

export interface CustomerLoyalty {
  id: string;
  name: string;
  phone: string;
  cardNumber: string;
  tier: 'standard' | 'silver' | 'gold' | 'vip';
  pointsAvailable: number; // 1 point = 0.01 AZN (1 Qapik) or 1 AZN = 100 points
  marketingConsent: boolean;
}

export type LineDiscountType = 'none' | 'percent' | 'fixed';

export interface PosCartItem {
  id: string; // unique line ID
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  variantId: string;
  size: string;
  color: string;
  unitPriceQapik: Qapik;
  originalUnitPriceQapik: Qapik;
  quantity: number;
  lineDiscountType: LineDiscountType;
  lineDiscountValue: number; // percent (0-100) or fixed AZN in Qapik
  lineDiscountAmountQapik: Qapik;
  lineTotalQapik: Qapik;
  taxRatePercent: number; // e.g. 18 for 18% ƏDV
  taxAmountQapik: Qapik;
  serverStockAvailable: number;
  priceChangedNotice?: string;
}

export interface CartPromotion {
  id: string;
  name: string;
  code?: string;
  type: 'campaign' | 'promo_code' | 'loyalty_points';
  discountQapik: Qapik;
  description: string;
}

export interface CartTotals {
  subtotalQapik: Qapik;
  lineDiscountsQapik: Qapik;
  receiptDiscountQapik: Qapik;
  promotionsDiscountQapik: Qapik;
  loyaltyRedeemedQapik: Qapik;
  totalDiscountQapik: Qapik;
  taxableSubtotalQapik: Qapik;
  taxQapik: Qapik; // 18% ƏDV (standard Azerbaijani tax)
  grandTotalQapik: Qapik;
  itemCount: number;
}

export interface SuspendedCart {
  id: string;
  label: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  savedAt: string;
  items: PosCartItem[];
  customer?: CustomerLoyalty;
  notes?: string;
  receiptDiscountType: LineDiscountType;
  receiptDiscountValue: number;
}

export type TenderType = 'cash' | 'card' | 'store_credit' | 'gift_card';

export interface Tender {
  type: TenderType;
  amountQapik: Qapik;
  referenceNumber?: string; // Required for manual card or external terminal
  notes?: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string; // e.g. RCP-BH02-20261011-0042
  shiftId: string;
  branchId: string;
  branchName: string;
  registerId: string;
  registerName: string;
  cashierId: string;
  cashierName: string;
  customer?: CustomerLoyalty;
  items: PosCartItem[];
  subtotalQapik: Qapik;
  discountQapik: Qapik;
  taxQapik: Qapik;
  grandTotalQapik: Qapik;
  tenders: Tender[];
  cashTenderedQapik?: Qapik;
  changeDueQapik?: Qapik;
  appliedPromotions: CartPromotion[];
  createdAt: string;
  status: 'completed' | 'voided' | 'returned';
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
  idempotencyKey: string;
  reprintCount: number;
  lastReprintReason?: string;
  lastReprintAt?: string;
}

export interface PaymentTerminalConfig {
  isConfigured: boolean;
  providerName: string;
  allowManualCardFallback: boolean;
}

export interface ServerValidationResult {
  isValid: boolean;
  hasPriceChanges: boolean;
  hasStockIssues: boolean;
  negativeStockPolicy: 'allowed' | 'blocked' | 'manager_override';
  updatedItems: PosCartItem[];
  errorMessages: string[];
}

export interface ProcessSaleRequest {
  shiftId: string;
  branchId: string;
  registerId: string;
  cashierId: string;
  cashierName: string;
  items: PosCartItem[];
  customer?: CustomerLoyalty;
  tenders: Tender[];
  cashTenderedQapik?: Qapik;
  changeDueQapik?: Qapik;
  receiptDiscountType: LineDiscountType;
  receiptDiscountValue: number;
  receiptDiscountReason?: string;
  idempotencyKey: string;
  promoCode?: string;
  redeemPoints: boolean;
}

export interface XReportData {
  shiftId: string;
  openedAt: string;
  generatedAt: string;
  cashierName: string;
  branchName: string;
  registerName: string;
  openingFloatQapik: Qapik;
  salesCount: number;
  grossSalesQapik: Qapik;
  discountsQapik: Qapik;
  netSalesQapik: Qapik;
  taxQapik: Qapik;
  cashSalesQapik: Qapik;
  cardSalesQapik: Qapik;
  otherSalesQapik: Qapik;
  cashInQapik: Qapik;
  cashOutQapik: Qapik;
  returnsCount: number;
  returnsTotalQapik: Qapik;
  expectedDrawerCashQapik: Qapik;
}

export interface ZReportData extends XReportData {
  closedAt: string;
  countedCashQapik: Qapik;
  varianceQapik: Qapik;
  varianceReason?: string;
  managerPinApproved: boolean;
}
