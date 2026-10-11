import { describe, it, expect, beforeEach } from 'vitest';
import { PosService, posServer } from '../src/features/pos/services/posService';
import { PosCartItem, Tender, CustomerLoyalty } from '../src/features/pos/types';
import { toQapik } from '../src/shared/utils/money';

describe('POS Module Unit Tests', () => {
  let sampleItems: PosCartItem[];

  beforeEach(() => {
    // Reset server shifts and terminal state
    posServer.shifts.clear();
    posServer.idempotentRequests.clear();
    posServer.receipts.clear();
    posServer.seedDefaultShift();
    PosService.setTerminalConfig({ isConfigured: false });

    sampleItems = [
      {
        id: 'line-1',
        productId: 'prod-001',
        productName: 'Klassik Pambıq Köynək Regular Fit',
        sku: 'TH-M-SH-101',
        barcode: '4760012390112',
        variantId: 'var-101-1',
        size: 'M',
        color: 'Ağ',
        unitPriceQapik: toQapik(14990), // 149.90 AZN
        originalUnitPriceQapik: toQapik(14990),
        quantity: 2,
        lineDiscountType: 'none',
        lineDiscountValue: 0,
        lineDiscountAmountQapik: toQapik(0),
        lineTotalQapik: toQapik(29980), // 299.80 AZN
        taxRatePercent: 18,
        taxAmountQapik: toQapik(4573),
        serverStockAvailable: 10,
      },
      {
        id: 'line-2',
        productId: 'prod-002',
        productName: 'Kətan Şalvar Slim Fit',
        sku: 'MD-M-TR-204',
        barcode: '4760012390129',
        variantId: 'var-204-1',
        size: 'L',
        color: 'Bej',
        unitPriceQapik: toQapik(18900), // 189.00 AZN
        originalUnitPriceQapik: toQapik(18900),
        quantity: 1,
        lineDiscountType: 'none',
        lineDiscountValue: 0,
        lineDiscountAmountQapik: toQapik(0),
        lineTotalQapik: toQapik(18900),
        taxRatePercent: 18,
        taxAmountQapik: toQapik(2883),
        serverStockAvailable: 5,
      },
    ];
  });

  describe('1. Cart Totals, Integer Qəpik & Tax Rounding', () => {
    it('computes exact subtotal, tax and grand total with zero floating-point error', () => {
      const totals = PosService.calculateTotals(sampleItems);

      // 2 * 149.90 + 1 * 189.00 = 299.80 + 189.00 = 488.80 AZN = 48880 Qapik
      expect(totals.subtotalQapik).toBe(48880);
      expect(totals.totalDiscountQapik).toBe(0);
      expect(totals.grandTotalQapik).toBe(48880);
      expect(totals.itemCount).toBe(3);

      // Tax (18% ƏDV included in retail price = 48880 * 18 / 118 = 7456.27 -> 7456 Qapik)
      expect(totals.taxQapik).toBe(Math.round((48880 * 18) / 118));
      expect(totals.taxableSubtotalQapik).toBe(48880 - totals.taxQapik);
    });

    it('calculates percentage receipt discount and line discount accurately', () => {
      // 10% receipt discount
      const totals = PosService.calculateTotals(sampleItems, 'percent', 10);
      // 48880 * 10% = 4888 Qapik discount
      expect(totals.receiptDiscountQapik).toBe(4888);
      expect(totals.grandTotalQapik).toBe(48880 - 4888);
      expect(totals.grandTotalQapik).toBe(43992);
    });

    it('handles fixed amount discounts safely without negative grand totals', () => {
      // 500 AZN discount on 488.80 AZN basket
      const totals = PosService.calculateTotals(sampleItems, 'fixed', 50000);
      expect(totals.receiptDiscountQapik).toBe(48880);
      expect(totals.grandTotalQapik).toBe(0);
    });
  });

  describe('2. Promotion & Stacking Rules (Server Authoritative)', () => {
    it('automatically applies 10% multi-buy campaign when 3+ items are in cart', async () => {
      const promotions = await PosService.evaluatePromotions(sampleItems);
      expect(promotions.length).toBe(1);
      expect(promotions[0].id).toBe('promo-multibuy-10');
      // Subtotal 48880 * 10% = 4888 Qapik
      expect(promotions[0].discountQapik).toBe(4888);
    });

    it('stacks campaign with promo code YAY2026', async () => {
      const promotions = await PosService.evaluatePromotions(sampleItems, undefined, 'YAY2026');
      expect(promotions.length).toBe(2);

      const multibuy = promotions.find((p) => p.id === 'promo-multibuy-10');
      const promoCode = promotions.find((p) => p.code === 'YAY2026');

      expect(multibuy).toBeDefined();
      expect(promoCode).toBeDefined();
      expect(promoCode?.discountQapik).toBe(1500); // 15.00 AZN fixed
    });

    it('applies loyalty tier perks and redeems customer loyalty points safely', async () => {
      const vipCustomer: CustomerLoyalty = {
        id: 'cust-vip-1',
        name: 'VIP Alıcı',
        phone: '+994 50 111 22 33',
        cardNumber: 'BH-VIP-99',
        tier: 'vip',
        pointsAvailable: 3000, // 30.00 AZN
        marketingConsent: true,
      };

      const promotions = await PosService.evaluatePromotions(
        sampleItems,
        vipCustomer,
        undefined,
        true // redeem points
      );

      // Expect multi-buy + VIP 5% + loyalty points redemption
      const vipPromo = promotions.find((p) => p.id === 'promo-vip-5');
      const loyaltyPromo = promotions.find((p) => p.id === 'promo-loyalty-points');

      expect(vipPromo).toBeDefined();
      expect(loyaltyPromo).toBeDefined();
      expect(loyaltyPromo?.discountQapik).toBe(3000); // 30.00 AZN redeemed
    });
  });

  describe('3. Payment & Tender Validation', () => {
    it('rejects sale completion when tender sum does not match grand total', async () => {
      const shift = Array.from(posServer.shifts.values())[0];

      const partialTenders: Tender[] = [
        { type: 'cash', amountQapik: toQapik(20000) }, // 200 AZN vs 488.80 AZN due
      ];

      await expect(
        PosService.processSale({
          shiftId: shift.id,
          branchId: shift.branchId,
          registerId: shift.registerId,
          cashierId: shift.cashierId,
          cashierName: shift.cashierName,
          items: sampleItems,
          tenders: partialTenders,
          receiptDiscountType: 'none',
          receiptDiscountValue: 0,
          idempotencyKey: 'idemp-test-01',
          redeemPoints: false,
        })
      ).rejects.toThrow(/Ödəniş məbləği yekun məbləğə uyğun deyil/);
    });

    it('blocks unconfigured card terminal payments without manual approval reference', async () => {
      const shift = Array.from(posServer.shifts.values())[0];
      PosService.setTerminalConfig({ isConfigured: false });

      // Need total 44000 (after 10% multi-buy discount on 48880 = 43992 Qapik)
      const totals = PosService.calculateTotals(
        sampleItems,
        'none',
        0,
        await PosService.evaluatePromotions(sampleItems)
      );

      const tenders: Tender[] = [
        { type: 'card', amountQapik: totals.grandTotalQapik }, // Missing referenceNumber
      ];

      await expect(
        PosService.processSale({
          shiftId: shift.id,
          branchId: shift.branchId,
          registerId: shift.registerId,
          cashierId: shift.cashierId,
          cashierName: shift.cashierName,
          items: sampleItems,
          tenders,
          receiptDiscountType: 'none',
          receiptDiscountValue: 0,
          idempotencyKey: 'idemp-test-card-err',
          redeemPoints: false,
        })
      ).rejects.toThrow('Ödəniş terminalı konfiqurasiya olunmayıb');
    });

    it('allows split tenders across cash and external card with valid reference', async () => {
      const shift = Array.from(posServer.shifts.values())[0];
      const initialSalesCount = shift.salesCount;

      const promotions = await PosService.evaluatePromotions(sampleItems);
      const totals = PosService.calculateTotals(sampleItems, 'none', 0, promotions);

      const splitCash = toQapik(20000); // 200.00 AZN
      const splitCard = toQapik(totals.grandTotalQapik - splitCash);

      const splitTenders: Tender[] = [
        { type: 'cash', amountQapik: splitCash },
        { type: 'card', amountQapik: splitCard, referenceNumber: 'RRN-998811' },
      ];

      const receipt = await PosService.processSale({
        shiftId: shift.id,
        branchId: shift.branchId,
        registerId: shift.registerId,
        cashierId: shift.cashierId,
        cashierName: shift.cashierName,
        items: sampleItems,
        tenders: splitTenders,
        receiptDiscountType: 'none',
        receiptDiscountValue: 0,
        idempotencyKey: 'idemp-test-split-ok',
        redeemPoints: false,
      });

      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('completed');
      expect(receipt.tenders.length).toBe(2);
      expect(shift.salesCount).toBe(initialSalesCount + 1);
    });
  });

  describe('4. Idempotency Key Lifecycle (Double-Click Protection)', () => {
    it('returns original receipt and prevents duplicate sales when idempotency key is repeated', async () => {
      const shift = Array.from(posServer.shifts.values())[0];
      const initialSalesCount = shift.salesCount;
      const initialTotalSales = shift.totalSalesQapik;

      const promotions = await PosService.evaluatePromotions(sampleItems);
      const totals = PosService.calculateTotals(sampleItems, 'none', 0, promotions);

      const tenders: Tender[] = [{ type: 'cash', amountQapik: totals.grandTotalQapik }];
      const sharedKey = 'idemp-double-click-test-key-123';

      // First submission
      const receipt1 = await PosService.processSale({
        shiftId: shift.id,
        branchId: shift.branchId,
        registerId: shift.registerId,
        cashierId: shift.cashierId,
        cashierName: shift.cashierName,
        items: sampleItems,
        tenders,
        receiptDiscountType: 'none',
        receiptDiscountValue: 0,
        idempotencyKey: sharedKey,
        redeemPoints: false,
      });

      expect(shift.salesCount).toBe(initialSalesCount + 1);
      expect(shift.totalSalesQapik).toBe(initialTotalSales + totals.grandTotalQapik);

      // Rapid second submission with same idempotency key (simulating double click or network retry)
      const receipt2 = await PosService.processSale({
        shiftId: shift.id,
        branchId: shift.branchId,
        registerId: shift.registerId,
        cashierId: shift.cashierId,
        cashierName: shift.cashierName,
        items: sampleItems,
        tenders,
        receiptDiscountType: 'none',
        receiptDiscountValue: 0,
        idempotencyKey: sharedKey,
        redeemPoints: false,
      });

      // Assert identical receipt returned
      expect(receipt2.id).toBe(receipt1.id);
      expect(receipt2.receiptNumber).toBe(receipt1.receiptNumber);

      // Crucial: shift counters must NOT increment again!
      expect(shift.salesCount).toBe(initialSalesCount + 1);
      expect(shift.totalSalesQapik).toBe(initialTotalSales + totals.grandTotalQapik);
    });
  });

  describe('5. Register Shift Operations, Variance, Reprint & Void', () => {
    it('requires variance explanation when closing cash difference exceeds tolerance', async () => {
      const shift = Array.from(posServer.shifts.values())[0];
      const expected = shift.expectedCashQapik;

      // Report cash off by 20.00 AZN (2000 Qapik) without reason
      const faultyCount = expected - 2000;

      await expect(
        PosService.closeShift({
          shiftId: shift.id,
          countedCashQapik: toQapik(faultyCount),
          denominations: {},
          varianceReason: '', // missing required reason
        })
      ).rejects.toThrow(/Kassa fərqi icazə verilən limitdən çoxdur/);

      // Successfully close with required explanation
      const zReport = await PosService.closeShift({
        shiftId: shift.id,
        countedCashQapik: toQapik(faultyCount),
        denominations: {},
        varianceReason: 'Müştəriyə artıq qalıq qaytarılmışdır',
        managerPin: '9999',
      });

      expect(zReport).toBeDefined();
      expect(shift.status).toBe('closed');
      expect(zReport.varianceReason).toBe('Müştəriyə artıq qalıq qaytarılmışdır');
    });

    it('marks reprinted receipts with SURƏT and logs reprint audit reason', async () => {
      const shift = Array.from(posServer.shifts.values())[0];
      const promotions = await PosService.evaluatePromotions(sampleItems);
      const grandTotal = PosService.calculateTotals(sampleItems, 'none', 0, promotions).grandTotalQapik;
      const tenders: Tender[] = [
        {
          type: 'cash',
          amountQapik: grandTotal,
        },
      ];

      const receipt = await PosService.processSale({
        shiftId: shift.id,
        branchId: shift.branchId,
        registerId: shift.registerId,
        cashierId: shift.cashierId,
        cashierName: shift.cashierName,
        items: sampleItems,
        tenders,
        receiptDiscountType: 'none',
        receiptDiscountValue: 0,
        idempotencyKey: 'idemp-reprint-test',
        redeemPoints: false,
      });

      expect(receipt.reprintCount).toBe(0);

      const reprinted = await PosService.reprintReceipt(
        receipt.id,
        'Müştəri təkrar çek tələb etdi'
      );
      expect(reprinted.reprintCount).toBe(1);
      expect(reprinted.lastReprintReason).toBe('Müştəri təkrar çek tələb etdi');
    });

    it('voids current-shift receipts only with manager authorization and reverses totals', async () => {
      const shift = Array.from(posServer.shifts.values())[0];
      const promotions = await PosService.evaluatePromotions(sampleItems);
      const grandTotal = PosService.calculateTotals(sampleItems, 'none', 0, promotions).grandTotalQapik;
      const tenders: Tender[] = [{ type: 'cash', amountQapik: grandTotal }];

      const receipt = await PosService.processSale({
        shiftId: shift.id,
        branchId: shift.branchId,
        registerId: shift.registerId,
        cashierId: shift.cashierId,
        cashierName: shift.cashierName,
        items: sampleItems,
        tenders,
        receiptDiscountType: 'none',
        receiptDiscountValue: 0,
        idempotencyKey: 'idemp-void-test',
        redeemPoints: false,
      });

      const shiftTotalBeforeVoid = shift.totalSalesQapik;

      // Fail with wrong PIN
      await expect(
        PosService.voidSale(receipt.id, '0000', 'Müştəri imtinası')
      ).rejects.toThrow(/Menecer PIN kodu yanlışdır/);

      // Succeed with manager PIN (9999)
      const voidedReceipt = await PosService.voidSale(receipt.id, '9999', 'Müştəri imtinası');
      expect(voidedReceipt.status).toBe('voided');
      expect(voidedReceipt.voidReason).toBe('Müştəri imtinası');

      // Total sales reversed in shift (completed sales are never deleted, only reversed)
      expect(shift.totalSalesQapik).toBe(shiftTotalBeforeVoid - grandTotal);
    });
  });

  describe('6. Suspended Sales (Park & Recall)', () => {
    it('parks and recalls a cart for a branch', async () => {
      const suspended = await PosService.suspendSale({
        label: 'Masa 4 Səbəti',
        branchId: 'branch-2',
        cashierId: 'usr-004',
        cashierName: 'Aytən Həsənova',
        items: sampleItems,
        receiptDiscountType: 'none',
        receiptDiscountValue: 0,
      });

      expect(suspended.id).toBeDefined();

      const list = await PosService.getSuspendedSales('branch-2');
      expect(list.some((s) => s.id === suspended.id)).toBe(true);

      const recalled = await PosService.recallSuspendedSale(suspended.id);
      expect(recalled).toBeDefined();
      expect(recalled?.items.length).toBe(sampleItems.length);

      const listAfter = await PosService.getSuspendedSales('branch-2');
      expect(listAfter.some((s) => s.id === suspended.id)).toBe(false);
    });
  });
});
