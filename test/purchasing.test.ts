import { describe, it, expect, beforeEach } from 'vitest';
import { calculateThreeWayMatch } from '../src/features/purchasing/utils/threeWayMatch';
import { validateReceiptLines } from '../src/features/purchasing/utils/receiptCalculations';
import { calculatePayablesAging } from '../src/features/purchasing/utils/agingCalculator';
import { detectDuplicateSupplier } from '../src/features/suppliers/schemas/supplierSchema';
import { MockPurchasingAdapter } from '../src/shared/adapters/mock/mockPurchasingAdapter';
import { MockSupplierAdapter } from '../src/shared/adapters/mock/mockSupplierAdapter';
import { Qapik } from '../src/shared/utils/money';
import { PurchaseOrder, GoodsReceipt, SupplierInvoice } from '../src/features/purchasing/types';
import { Supplier } from '../src/features/suppliers/types';

describe('Purchasing and Supplier Management Engine', () => {
  describe('1. Three-Way Match Engine (PO vs GR vs Invoice)', () => {
    const mockPO: PurchaseOrder = {
      id: 'po-test-1',
      poNumber: 'PO-2026-0001',
      supplierId: 'sup-1',
      supplierName: 'Baku Fashion Textile MMC',
      supplierTaxId: '1401234567',
      deliveryWarehouseId: 'wh-1',
      deliveryWarehouseName: 'Mərkəzi Loqistika Anbarı',
      branchId: 'branch-1',
      branchName: '28 May Flaman Filialı',
      orderDate: '2026-10-01',
      expectedDeliveryDate: '2026-10-20',
      paymentTerms: 'net30',
      currency: 'AZN',
      status: 'received',
      subtotal: 245000 as Qapik,
      discountAmount: 0 as Qapik,
      taxAmount: 44100 as Qapik,
      totalAmount: 289100 as Qapik,
      notes: '',
      linkedDocs: {},
      createdBy: 'user-1',
      createdByName: 'Sistem Admini',
      isDemo: true,
      items: [
        {
          id: 'poi-1',
          productId: 'prod-1',
          productName: 'Kişi Pambıq Köynək (Klassik)',
          sku: 'TSH-M-001-L-WH',
          barcode: '4760012345678',
          size: 'L',
          color: 'Ağ',
          orderedQty: 100,
          previouslyReceivedQty: 100,
          outstandingQty: 0,
          unitCost: 2450 as Qapik,
          discountPercent: 0,
          taxRatePercent: 18,
          lineTotal: 245000 as Qapik,
        },
      ],
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    };

    const mockGR: GoodsReceipt = {
      id: 'gr-test-1',
      grNumber: 'GR-2026-0001',
      poId: 'po-test-1',
      poNumber: 'PO-2026-0001',
      supplierId: 'sup-1',
      supplierName: 'Baku Fashion Textile MMC',
      warehouseId: 'wh-1',
      warehouseName: 'Mərkəzi Loqistika Anbarı',
      receivedDate: '2026-10-05',
      receivedBy: 'user-1',
      receivedByName: 'Kamran Əliyev',
      idempotencyKey: 'idem-gr-1',
      linkedDocs: {},
      isDemo: true,
      status: 'confirmed',
      totalOrderedQty: 100,
      totalReceivedQty: 100,
      totalDamagedQty: 0,
      totalRejectedQty: 0,
      totalAmount: 245000 as Qapik,
      stockDocumentId: 'doc-123',
      items: [
        {
          id: 'gri-1',
          poItemId: 'poi-1',
          productId: 'prod-1',
          productName: 'Kişi Pambıq Köynək (Klassik)',
          sku: 'TSH-M-001-L-WH',
          barcode: '4760012345678',
          size: 'L',
          color: 'Ağ',
          orderedQty: 100,
          previouslyReceivedQty: 0,
          receivedNowQty: 100,
          rejectedQty: 0,
          damagedQty: 0,
          unitCost: 2450 as Qapik,
        },
      ],
      createdAt: '2026-10-05T12:00:00Z',
    };

    it('identifies an exact three-way match with zero discrepancies', () => {
      const mockInvoice: SupplierInvoice = {
        id: 'inv-test-1',
        invoiceNumber: 'INV-2026-0001',
        supplierInvoiceRef: 'FAK-123456',
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        supplierTaxId: '1401234567',
        poId: 'po-test-1',
        poNumber: 'PO-2026-0001',
        grId: 'gr-test-1',
        grNumber: 'GR-2026-0001',
        invoiceDate: '2026-10-06',
        dueDate: '2026-11-05',
        status: 'approved_for_payment',
        subtotal: 245000 as Qapik,
        taxAmount: 44100 as Qapik,
        totalAmount: 289100 as Qapik,
        paidAmount: 0 as Qapik,
        outstandingAmount: 289100 as Qapik,
        currency: 'AZN',
        lines: [
          {
            id: 'invl-1',
            productId: 'prod-1',
            productName: 'Kişi Pambıq Köynək (Klassik)',
            sku: 'TSH-M-001-L-WH',
            size: 'L',
            color: 'Ağ',
            invoicedQty: 100,
            unitCost: 2450 as Qapik,
            taxRatePercent: 18,
            lineTotal: 245000 as Qapik,
          },
        ],
        createdAt: '2026-10-06T10:00:00Z',
      };

      const result = calculateThreeWayMatch(mockInvoice, mockPO, mockGR, {
        qtyTolerancePercent: 0,
        priceTolerancePercent: 0,
      });

      expect(result.overallStatus).toBe('exact_match');
      expect(result.hasMismatch).toBe(false);
      expect(result.canApproveForPayment).toBe(true);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].qtyDiff).toBe(0);
      expect(result.lines[0].priceDiff).toBe(0);
      expect(result.lines[0].status).toBe('exact_match');
    });

    it('approves invoice when discrepancy is within configured tolerance', () => {
      const mockInvoiceWithSmallDiff: SupplierInvoice = {
        id: 'inv-test-2',
        invoiceNumber: 'INV-2026-0002',
        supplierInvoiceRef: 'FAK-123457',
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        supplierTaxId: '1401234567',
        poId: 'po-test-1',
        poNumber: 'PO-2026-0001',
        grId: 'gr-test-1',
        grNumber: 'GR-2026-0001',
        invoiceDate: '2026-10-06',
        dueDate: '2026-11-05',
        status: 'approved_for_payment',
        subtotal: 247450 as Qapik,
        taxAmount: 44541 as Qapik,
        totalAmount: 291991 as Qapik,
        paidAmount: 0 as Qapik,
        outstandingAmount: 291991 as Qapik,
        currency: 'AZN',
        lines: [
          {
            id: 'invl-1',
            productId: 'prod-1',
            productName: 'Kişi Pambıq Köynək (Klassik)',
            sku: 'TSH-M-001-L-WH',
            size: 'L',
            color: 'Ağ',
            invoicedQty: 101, // 1% over
            unitCost: 2450 as Qapik,
            taxRatePercent: 18,
            lineTotal: 247450 as Qapik,
          },
        ],
        createdAt: '2026-10-06T10:00:00Z',
      };

      // 2% tolerance allowed
      const result = calculateThreeWayMatch(mockInvoiceWithSmallDiff, mockPO, mockGR, {
        qtyTolerancePercent: 2,
        priceTolerancePercent: 2,
      });

      expect(result.overallStatus).toBe('tolerance_match');
      expect(result.hasMismatch).toBe(false);
      expect(result.canApproveForPayment).toBe(true);
    });

    it('flags quantity mismatch and blocks auto-approval when tolerance exceeded', () => {
      const mockInvoiceQtyMismatch: SupplierInvoice = {
        id: 'inv-test-3',
        invoiceNumber: 'INV-2026-0003',
        supplierInvoiceRef: 'FAK-123458',
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        supplierTaxId: '1401234567',
        poId: 'po-test-1',
        poNumber: 'PO-2026-0001',
        grId: 'gr-test-1',
        grNumber: 'GR-2026-0001',
        invoiceDate: '2026-10-06',
        dueDate: '2026-11-05',
        status: 'mismatch_hold',
        subtotal: 294000 as Qapik,
        taxAmount: 52920 as Qapik,
        totalAmount: 346920 as Qapik,
        paidAmount: 0 as Qapik,
        outstandingAmount: 346920 as Qapik,
        currency: 'AZN',
        lines: [
          {
            id: 'invl-1',
            productId: 'prod-1',
            productName: 'Kişi Pambıq Köynək (Klassik)',
            sku: 'TSH-M-001-L-WH',
            size: 'L',
            color: 'Ağ',
            invoicedQty: 120, // 20 units more than received
            unitCost: 2450 as Qapik,
            taxRatePercent: 18,
            lineTotal: 294000 as Qapik,
          },
        ],
        createdAt: '2026-10-06T10:00:00Z',
      };

      const result = calculateThreeWayMatch(mockInvoiceQtyMismatch, mockPO, mockGR, {
        qtyTolerancePercent: 5,
        priceTolerancePercent: 5,
      });

      expect(result.overallStatus).toBe('qty_mismatch');
      expect(result.hasMismatch).toBe(true);
      expect(result.canApproveForPayment).toBe(false);
      expect(result.lines[0].status).toBe('qty_mismatch');
      expect(result.lines[0].qtyDiff).toBe(20);
    });

    it('flags price mismatch when invoice unit cost differs from PO contract rate', () => {
      const mockInvoicePriceMismatch: SupplierInvoice = {
        id: 'inv-test-4',
        invoiceNumber: 'INV-2026-0004',
        supplierInvoiceRef: 'FAK-123459',
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        supplierTaxId: '1401234567',
        poId: 'po-test-1',
        poNumber: 'PO-2026-0001',
        grId: 'gr-test-1',
        grNumber: 'GR-2026-0001',
        invoiceDate: '2026-10-06',
        dueDate: '2026-11-05',
        status: 'mismatch_hold',
        subtotal: 280000 as Qapik,
        taxAmount: 50400 as Qapik,
        totalAmount: 330400 as Qapik,
        paidAmount: 0 as Qapik,
        outstandingAmount: 330400 as Qapik,
        currency: 'AZN',
        lines: [
          {
            id: 'invl-1',
            productId: 'prod-1',
            productName: 'Kişi Pambıq Köynək (Klassik)',
            sku: 'TSH-M-001-L-WH',
            size: 'L',
            color: 'Ağ',
            invoicedQty: 100,
            unitCost: 2800 as Qapik, // 28.00 AZN instead of agreed 24.50 AZN
            taxRatePercent: 18,
            lineTotal: 280000 as Qapik,
          },
        ],
        createdAt: '2026-10-06T10:00:00Z',
      };

      const result = calculateThreeWayMatch(mockInvoicePriceMismatch, mockPO, mockGR, {
        qtyTolerancePercent: 1,
        priceTolerancePercent: 1,
      });

      expect(result.overallStatus).toBe('price_mismatch');
      expect(result.hasMismatch).toBe(true);
      expect(result.canApproveForPayment).toBe(false);
      expect(result.lines[0].status).toBe('price_mismatch');
      expect(result.lines[0].priceDiff).toBe(350); // 3.50 AZN higher per unit
    });

    it('flags missing Goods Receipt when invoice has no corresponding warehouse intake', () => {
      const mockInvoiceNoGR: SupplierInvoice = {
        id: 'inv-test-5',
        invoiceNumber: 'INV-2026-0005',
        supplierInvoiceRef: 'FAK-123460',
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        supplierTaxId: '1401234567',
        poId: 'po-test-1',
        poNumber: 'PO-2026-0001',
        invoiceDate: '2026-10-06',
        dueDate: '2026-11-05',
        status: 'mismatch_hold',
        subtotal: 245000 as Qapik,
        taxAmount: 44100 as Qapik,
        totalAmount: 289100 as Qapik,
        paidAmount: 0 as Qapik,
        outstandingAmount: 289100 as Qapik,
        currency: 'AZN',
        lines: [
          {
            id: 'invl-1',
            productId: 'prod-1',
            productName: 'Kişi Pambıq Köynək (Klassik)',
            sku: 'TSH-M-001-L-WH',
            size: 'L',
            color: 'Ağ',
            invoicedQty: 100,
            unitCost: 2450 as Qapik,
            taxRatePercent: 18,
            lineTotal: 245000 as Qapik,
          },
        ],
        createdAt: '2026-10-06T10:00:00Z',
      };

      const result = calculateThreeWayMatch(mockInvoiceNoGR, mockPO, null);
      expect(result.flagMissingGR).toBe(true);
      expect(result.hasMismatch).toBe(true);
      expect(result.canApproveForPayment).toBe(false);
    });
  });

  describe('2. Goods Receipt Line Validation Engine', () => {
    it('validates a normal partial goods receipt successfully', () => {
      const lines = [
        {
          poItemId: 'poi-1',
          sku: 'TSH-M-001',
          productName: 'Kişi Köynək',
          size: 'M',
          color: 'Ağ',
          orderedQty: 50,
          previouslyReceivedQty: 0,
          receivedNowQty: 25,
          rejectedQty: 0,
          damagedQty: 0,
        },
      ];

      const result = validateReceiptLines(lines);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('blocks over-receipt when exceeding PO ordered quantity beyond tolerance limit', () => {
      const lines = [
        {
          poItemId: 'poi-1',
          sku: 'TSH-M-001',
          productName: 'Kişi Köynək',
          size: 'M',
          color: 'Ağ',
          orderedQty: 50,
          previouslyReceivedQty: 30,
          receivedNowQty: 30, // Total 60, ordered 50 (tolerance 0%)
          rejectedQty: 0,
          damagedQty: 0,
        },
      ];

      const result = validateReceiptLines(lines, 0);
      expect(result.isValid).toBe(false);
      expect(result.errors['poi-1']).toContain('icazə verilən maksimum saydan çoxdur');
    });

    it('allows slight over-receipt when within tolerance percentage', () => {
      const lines = [
        {
          poItemId: 'poi-1',
          sku: 'TSH-M-001',
          productName: 'Kişi Köynək',
          size: 'M',
          color: 'Ağ',
          orderedQty: 100,
          previouslyReceivedQty: 0,
          receivedNowQty: 105, // 5% over
          rejectedQty: 0,
          damagedQty: 0,
        },
      ];

      const result = validateReceiptLines(lines, 5); // 5% tolerance
      expect(result.isValid).toBe(true);
    });

    it('requires reason code when rejecting or documenting damaged stock', () => {
      const linesWithoutReason = [
        {
          poItemId: 'poi-1',
          sku: 'TSH-M-001',
          productName: 'Kişi Köynək',
          size: 'M',
          color: 'Ağ',
          orderedQty: 50,
          previouslyReceivedQty: 0,
          receivedNowQty: 40,
          rejectedQty: 5,
          damagedQty: 5,
          reasonCode: undefined,
        },
      ];

      const result = validateReceiptLines(linesWithoutReason);
      expect(result.isValid).toBe(false);
      expect(result.errors['poi-1']).toContain('səbəb qeyd edilməlidir');
    });
  });

  describe('3. Payables Aging Calculator (0–30, 31–60, 61–90, 90+ days)', () => {
    it('groups unpaid supplier invoices into correct aging buckets', () => {
      const today = new Date('2026-10-15T00:00:00Z');

      const invoices: SupplierInvoice[] = [
        // 10 days past due -> 0-30 days bucket
        {
          id: 'inv-1',
          invoiceNumber: 'INV-1',
          supplierInvoiceRef: 'REF-1',
          supplierId: 'sup-1',
          supplierName: 'Supplier 1',
          supplierTaxId: '1234567890',
          invoiceDate: '2026-09-01',
          dueDate: '2026-10-05',
          status: 'approved_for_payment',
          subtotal: 10000 as Qapik,
          taxAmount: 1800 as Qapik,
          totalAmount: 11800 as Qapik,
          paidAmount: 0 as Qapik,
          outstandingAmount: 11800 as Qapik,
          currency: 'AZN',
          lines: [],
          createdAt: '2026-09-01T00:00:00Z',
        },
        // 40 days past due -> 31-60 days bucket
        {
          id: 'inv-2',
          invoiceNumber: 'INV-2',
          supplierInvoiceRef: 'REF-2',
          supplierId: 'sup-1',
          supplierName: 'Supplier 1',
          supplierTaxId: '1234567890',
          invoiceDate: '2026-08-01',
          dueDate: '2026-09-05',
          status: 'approved_for_payment',
          subtotal: 20000 as Qapik,
          taxAmount: 3600 as Qapik,
          totalAmount: 23600 as Qapik,
          paidAmount: 0 as Qapik,
          outstandingAmount: 23600 as Qapik,
          currency: 'AZN',
          lines: [],
          createdAt: '2026-08-01T00:00:00Z',
        },
        // 75 days past due -> 61-90 days bucket
        {
          id: 'inv-3',
          invoiceNumber: 'INV-3',
          supplierInvoiceRef: 'REF-3',
          supplierId: 'sup-1',
          supplierName: 'Supplier 1',
          supplierTaxId: '1234567890',
          invoiceDate: '2026-07-01',
          dueDate: '2026-08-01',
          status: 'approved_for_payment',
          subtotal: 30000 as Qapik,
          taxAmount: 5400 as Qapik,
          totalAmount: 35400 as Qapik,
          paidAmount: 0 as Qapik,
          outstandingAmount: 35400 as Qapik,
          currency: 'AZN',
          lines: [],
          createdAt: '2026-07-01T00:00:00Z',
        },
        // 120 days past due -> 90+ days bucket
        {
          id: 'inv-4',
          invoiceNumber: 'INV-4',
          supplierInvoiceRef: 'REF-4',
          supplierId: 'sup-1',
          supplierName: 'Supplier 1',
          supplierTaxId: '1234567890',
          invoiceDate: '2026-05-01',
          dueDate: '2026-06-15',
          status: 'approved_for_payment',
          subtotal: 40000 as Qapik,
          taxAmount: 7200 as Qapik,
          totalAmount: 47200 as Qapik,
          paidAmount: 0 as Qapik,
          outstandingAmount: 47200 as Qapik,
          currency: 'AZN',
          lines: [],
          createdAt: '2026-05-01T00:00:00Z',
        },
      ];

      const buckets = calculatePayablesAging(invoices, today);
      expect(buckets).toHaveLength(1);
      const b = buckets[0];
      expect(b.current0To30).toBe(11800);
      expect(b.days31To60).toBe(23600);
      expect(b.days61To90).toBe(35400);
      expect(b.days90Plus).toBe(47200);
      expect(b.totalPayable).toBe(11800 + 23600 + 35400 + 47200);
    });
  });

  describe('4. Duplicate Supplier Detection', () => {
    const existingSuppliers: Supplier[] = [
      {
        id: 'sup-1',
        name: 'Baku Fashion Textile MMC',
        legalName: 'Baku Fashion Textile Məhdud Məsuliyyətli Cəmiyyəti',
        taxId: '1401234567',
        status: 'active',
        contactPerson: 'Rauf Əhmədov',
        phone: '+994 12 440 12 34',
        email: 'sales@bakufashion.az',
        address: 'Nizami r-nu, Heydər Əliyev pr. 105',
        city: 'Bakı',
        country: 'Azərbaycan',
        paymentTerms: 'net30',
        currency: 'AZN',
        payableBalance: 1250000 as Qapik,
        leadTimeDays: 7,
        createdAt: '2026-01-10T08:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        isDemo: true,
      },
    ];

    it('detects duplicate by exact or normalized taxId (VÖEN)', () => {
      const dup = detectDuplicateSupplier(existingSuppliers, {
        taxId: '1401234567',
        name: 'Yeni Qeydiyyat',
      });
      expect(dup.hasDuplicate).toBe(true);
      expect(dup.field).toBe('taxId');
      expect(dup.message).toContain('1401234567 VÖEN nömrəsi ilə təchizatçı artıq mövcuddur');
    });

    it('detects duplicate by normalized company name', () => {
      const dup = detectDuplicateSupplier(existingSuppliers, {
        taxId: '9999999999',
        name: 'baku fashion textile mmc',
      });
      expect(dup.hasDuplicate).toBe(true);
      expect(dup.field).toBe('name');
      expect(dup.message).toContain('adlı təchizatçı artıq mövcuddur');
    });

    it('returns false for unique non-duplicate supplier', () => {
      const dup = detectDuplicateSupplier(existingSuppliers, {
        taxId: '9876543210',
        name: 'Qafqaz İpək Fabriki ASC',
      });
      expect(dup.hasDuplicate).toBe(false);
    });
  });

  describe('5. Mock Purchasing Adapter & Architecture Rules', () => {
    let purchasingAdapter: MockPurchasingAdapter;
    let supplierAdapter: MockSupplierAdapter;

    beforeEach(() => {
      purchasingAdapter = new MockPurchasingAdapter();
      supplierAdapter = new MockSupplierAdapter();
    });

    it('provides demo suppliers with payment terms and balance', async () => {
      const res = await supplierAdapter.getSuppliers();
      expect(res.items.length).toBeGreaterThanOrEqual(4);
      expect(res.items[0].taxId).toBeDefined();
      expect(res.items[0].paymentTerms).toBeDefined();
    });

    it('protects against duplicate goods receipt submission via idempotency key', async () => {
      const orders = await purchasingAdapter.getPurchaseOrders();
      const po = orders[0];

      const receiptPayload = {
        poId: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        warehouseId: po.deliveryWarehouseId,
        warehouseName: po.deliveryWarehouseName,
        receivedDate: '2026-10-11',
        items: po.items.map((i) => ({
          id: `gri-${i.id}`,
          poItemId: i.id,
          productId: i.productId,
          productName: i.productName,
          sku: i.sku,
          barcode: i.barcode,
          size: i.size,
          color: i.color,
          orderedQty: i.orderedQty,
          previouslyReceivedQty: 0,
          receivedNowQty: 10,
          rejectedQty: 0,
          damagedQty: 0,
          unitCost: i.unitCost,
        })),
      };

      const idempotencyKey = 'idemp-test-gr-unique-123';

      // First call
      const firstResult = await purchasingAdapter.createGoodsReceipt(receiptPayload, idempotencyKey);
      expect(firstResult.grNumber).toBeDefined();

      // Second call with identical key
      const secondResult = await purchasingAdapter.createGoodsReceipt(receiptPayload, idempotencyKey);
      expect(secondResult.id).toBe(firstResult.id);
      expect(secondResult.grNumber).toBe(firstResult.grNumber);
    });

    it('updates stock ledger solely by confirming a Goods Receipt document', async () => {
      const orders = await purchasingAdapter.getPurchaseOrders();
      const po = orders.find((o) => o.status === 'approved' || o.status === 'sent') || orders[0];

      const gr = await purchasingAdapter.createGoodsReceipt(
        {
          poId: po.id,
          poNumber: po.poNumber,
          supplierId: po.supplierId,
          supplierName: po.supplierName,
          warehouseId: po.deliveryWarehouseId,
          warehouseName: po.deliveryWarehouseName,
          receivedDate: '2026-10-11',
          items: [
            {
              id: 'gri-test-line',
              poItemId: po.items[0].id,
              productId: po.items[0].productId,
              productName: po.items[0].productName,
              sku: po.items[0].sku,
              barcode: po.items[0].barcode,
              size: po.items[0].size,
              color: po.items[0].color,
              orderedQty: po.items[0].orderedQty,
              previouslyReceivedQty: 0,
              receivedNowQty: 15,
              rejectedQty: 0,
              damagedQty: 0,
              unitCost: po.items[0].unitCost,
            },
          ],
        },
        'idemp-stock-doc-test'
      );

      expect(gr.stockDocumentId).toBeDefined();
      expect(gr.status).toBe('confirmed');
    });

    it('enforces manager approval requirement for supplier payments exceeding 10,000 AZN', async () => {
      // 12,000 AZN = 1,200,000 Qəpik (> 1,000,000 Qəpik threshold)
      const highAmountPayment = await purchasingAdapter.createSupplierPayment({
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        paymentDate: '2026-10-11',
        paymentMethod: 'bank_transfer',
        bankAccountName: 'PAŞA Bank ASC',
        referenceNumber: 'PAŞA-TR-998811',
        amount: 1200000 as Qapik,
      });

      expect(highAmountPayment.requiresApproval).toBe(true);
      expect(highAmountPayment.status).toBe('pending_approval');

      // Approve high amount payment
      const approvedPayment = await purchasingAdapter.approveSupplierPayment(highAmountPayment.id);
      expect(approvedPayment.status).toBe('posted');
      expect(approvedPayment.approvedBy).toBeDefined();
    });
  });
});

