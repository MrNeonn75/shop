import {
  PurchaseRequest,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  GoodsReceipt,
  GoodsReceiptItem,
  SupplierInvoice,
  SupplierInvoiceLine,
  SupplierInvoiceStatus,
  SupplierPayment,
  PaymentInvoiceAllocation,
  SuggestedReorderItem,
  ThreeWayMatchResult,
  PurchaseReturn,
  CreditNote,
  PayablesAgingBucket,
  PurchasingFilterParams,
} from '../../../features/purchasing/types';
import { PurchasingRepository, InventoryRepository } from '../types';
import { Qapik } from '../../utils/money';
import { calculateThreeWayMatch } from '../../../features/purchasing/utils/threeWayMatch';
import { calculatePayablesAging } from '../../../features/purchasing/utils/agingCalculator';
import { validateReceiptLines } from '../../../features/purchasing/utils/receiptCalculations';

export const INITIAL_MOCK_REQUESTS: PurchaseRequest[] = [
  {
    id: 'pr-1',
    requestNumber: 'PR-2026-0001',
    branchId: 'branch-1',
    branchName: '28 May Flaman Filialı',
    warehouseId: 'wh-1',
    warehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
    neededByDate: '2026-04-15',
    reason: 'Yaz-Yay kolleksiyası üçün kişi köynəkləri və şalvar ehtiyatının artırılması',
    status: 'pending_approval',
    approvalLevelRequired: 2,
    totalEstimatedAmount: 245000 as Qapik, // 2,450.00 AZN
    items: [
      {
        id: 'pri-1',
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-001',
        barcode: '4760012345678',
        size: 'L',
        color: 'Ağ',
        requestedQty: 50,
        estimatedUnitCost: 2450 as Qapik,
        lineTotal: 122500 as Qapik,
        currentStock: 8,
        minStockLevel: 25,
        suggestedQty: 50,
        isSuggestionApplied: true,
      },
      {
        id: 'pri-2',
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-002',
        barcode: '4760012345679',
        size: 'M',
        color: 'Göy',
        requestedQty: 50,
        estimatedUnitCost: 2450 as Qapik,
        lineTotal: 122500 as Qapik,
        currentStock: 5,
        minStockLevel: 25,
        suggestedQty: 50,
        isSuggestionApplied: true,
      },
    ],
    approvalLogs: [
      {
        id: 'apl-1',
        stage: 'Tələbnamə yaradıldı',
        decision: 'approved',
        decidedBy: 'user-3',
        userName: 'Rəşad Qasımov',
        roleName: 'Filial Meneceri',
        timestamp: '2026-04-02T10:30:00Z',
      },
    ],
    linkedDocs: {},
    createdBy: 'user-3',
    createdByName: 'Rəşad Qasımov (Filial Meneceri)',
    createdAt: '2026-04-02T10:30:00Z',
    updatedAt: '2026-04-02T10:30:00Z',
    isDemo: true,
  },
  {
    id: 'pr-2',
    requestNumber: 'PR-2026-0002',
    branchId: 'branch-2',
    branchName: 'Gənclik Mall Filialı',
    warehouseId: 'wh-1',
    warehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
    neededByDate: '2026-04-10',
    reason: 'Qadın ipək koftaların vitrin bitməsi səbəbilə təcili sifarişi',
    status: 'approved',
    approvalLevelRequired: 1,
    totalEstimatedAmount: 76000 as Qapik, // 760.00 AZN
    items: [
      {
        id: 'pri-3',
        productId: 'prod-2',
        productName: 'Qadın Zərif İpək Kofta',
        sku: 'BLZ-W-002',
        barcode: '4760023456789',
        size: 'S',
        color: 'Çəhrayı',
        requestedQty: 20,
        estimatedUnitCost: 3800 as Qapik,
        lineTotal: 76000 as Qapik,
        currentStock: 2,
        minStockLevel: 10,
        suggestedQty: 20,
        isSuggestionApplied: true,
      },
    ],
    approvalLogs: [
      {
        id: 'apl-2',
        stage: 'Rəhbərlik təsdiqi',
        decision: 'approved',
        decidedBy: 'user-2',
        userName: 'Kamran Əliyev',
        roleName: 'Baş Menecer',
        reason: 'Təsdiq edildi, PO yaradıla bilər',
        timestamp: '2026-04-01T15:00:00Z',
      },
    ],
    linkedDocs: {
      orderId: 'po-1',
      orderNumber: 'PO-2026-0001',
    },
    createdBy: 'user-2',
    createdByName: 'Kamran Əliyev (Baş Menecer)',
    createdAt: '2026-04-01T14:00:00Z',
    updatedAt: '2026-04-01T15:00:00Z',
    isDemo: true,
  },
];

export const INITIAL_MOCK_ORDERS: PurchaseOrder[] = [
  {
    id: 'po-1',
    poNumber: 'PO-2026-0001',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    supplierTaxId: '1401234567',
    deliveryWarehouseId: 'wh-1',
    deliveryWarehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
    branchId: 'branch-1',
    branchName: '28 May Flaman Filialı',
    orderDate: '2026-04-01',
    expectedDeliveryDate: '2026-04-08',
    paymentTerms: 'net30',
    currency: 'AZN',
    status: 'approved',
    items: [
      {
        id: 'poi-1',
        productId: 'prod-2',
        productName: 'Qadın Zərif İpək Kofta',
        sku: 'BLZ-W-002',
        barcode: '4760023456789',
        size: 'S',
        color: 'Çəhrayı',
        orderedQty: 20,
        previouslyReceivedQty: 0,
        outstandingQty: 20,
        unitCost: 3800 as Qapik,
        discountPercent: 0,
        taxRatePercent: 18,
        lineTotal: 76000 as Qapik,
      },
    ],
    subtotal: 76000 as Qapik,
    discountAmount: 0 as Qapik,
    taxAmount: 13680 as Qapik, // 18% ƏDV
    totalAmount: 89680 as Qapik,
    notes: 'Qablaşdırma xüsusi qoruyucu qutularda olmalıdır.',
    linkedDocs: {
      requestId: 'pr-2',
      requestNumber: 'PR-2026-0002',
    },
    createdBy: 'user-2',
    createdByName: 'Kamran Əliyev (Baş Menecer)',
    createdAt: '2026-04-01T16:00:00Z',
    updatedAt: '2026-04-01T16:00:00Z',
    isDemo: true,
  },
  {
    id: 'po-2',
    poNumber: 'PO-2026-0002',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    supplierTaxId: '1401234567',
    deliveryWarehouseId: 'wh-1',
    deliveryWarehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
    branchId: 'branch-1',
    branchName: '28 May Flaman Filialı',
    orderDate: '2026-03-20',
    expectedDeliveryDate: '2026-03-26',
    paymentTerms: 'net30',
    currency: 'AZN',
    status: 'partially_received',
    items: [
      {
        id: 'poi-2',
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-001',
        barcode: '4760012345678',
        size: 'L',
        color: 'Ağ',
        orderedQty: 100,
        previouslyReceivedQty: 60, // 60 received, 40 outstanding
        outstandingQty: 40,
        unitCost: 2450 as Qapik,
        discountPercent: 0,
        taxRatePercent: 18,
        lineTotal: 245000 as Qapik,
      },
    ],
    subtotal: 245000 as Qapik,
    discountAmount: 0 as Qapik,
    taxAmount: 44100 as Qapik,
    totalAmount: 289100 as Qapik,
    notes: 'Qismən təhvil verildi (1-ci partiya: 60 ədəd)',
    linkedDocs: {
      receiptId: 'gr-1',
      receiptNumber: 'GR-2026-0001',
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
    },
    createdBy: 'user-2',
    createdByName: 'Kamran Əliyev (Baş Menecer)',
    createdAt: '2026-03-20T11:00:00Z',
    updatedAt: '2026-03-25T14:00:00Z',
    isDemo: true,
  },
];

export const INITIAL_MOCK_RECEIPTS: GoodsReceipt[] = [
  {
    id: 'gr-1',
    grNumber: 'GR-2026-0001',
    poId: 'po-2',
    poNumber: 'PO-2026-0002',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    warehouseId: 'wh-1',
    warehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
    receivedDate: '2026-03-25',
    status: 'confirmed',
    idempotencyKey: 'idemp-gr-2026-0001',
    items: [
      {
        id: 'gri-1',
        poItemId: 'poi-2',
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-001',
        barcode: '4760012345678',
        size: 'L',
        color: 'Ağ',
        orderedQty: 100,
        previouslyReceivedQty: 0,
        receivedNowQty: 60,
        rejectedQty: 0,
        damagedQty: 0,
        unitCost: 2450 as Qapik,
      },
    ],
    totalOrderedQty: 100,
    totalReceivedQty: 60,
    totalDamagedQty: 0,
    totalRejectedQty: 0,
    totalAmount: 147000 as Qapik, // 60 * 24.50 = 1,470.00 AZN
    discrepancyNotes: '1-ci partiya təhvil alındı, qalan 40 ədəd növbəti həftə çatdırılacaq.',
    receivedBy: 'user-5',
    receivedByName: 'Əli Həsənov (Anbardar)',
    stockDocumentId: 'doc-gr-001',
    linkedDocs: {
      orderId: 'po-2',
      orderNumber: 'PO-2026-0002',
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
    },
    createdAt: '2026-03-25T13:30:00Z',
    confirmedAt: '2026-03-25T14:00:00Z',
    isDemo: true,
  },
];

export const INITIAL_MOCK_INVOICES: SupplierInvoice[] = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-0001',
    supplierInvoiceRef: 'BFT-QAİMƏ-9921',
    poId: 'po-2',
    poNumber: 'PO-2026-0002',
    grId: 'gr-1',
    grNumber: 'GR-2026-0001',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    supplierTaxId: '1401234567',
    invoiceDate: '2026-03-26',
    dueDate: '2026-04-25',
    status: 'approved_for_payment',
    lines: [
      {
        id: 'invl-1',
        poItemId: 'poi-2',
        grItemId: 'gri-1',
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-001',
        size: 'L',
        color: 'Ağ',
        invoicedQty: 60, // Exactly matches GR receivedQty (60) and PO unit price (24.50)
        unitCost: 2450 as Qapik,
        taxRatePercent: 18,
        lineTotal: 147000 as Qapik,
      },
    ],
    subtotal: 147000 as Qapik,
    taxAmount: 26460 as Qapik,
    totalAmount: 173460 as Qapik,
    paidAmount: 100000 as Qapik,
    outstandingAmount: 73460 as Qapik, // 734.60 AZN remaining
    matchResult: {
      overallStatus: 'exact_match',
      toleranceQtyPercent: 0,
      tolerancePricePercent: 0,
      isApprovedForPayment: true,
      flags: [],
      lines: [
        {
          productId: 'prod-1',
          productName: 'Kişi Pambıq Köynək (Klassik)',
          sku: 'TSH-M-001',
          poQty: 100,
          grQty: 60,
          invQty: 60,
          poUnitCost: 2450 as Qapik,
          invUnitCost: 2450 as Qapik,
          qtyDiff: 0,
          priceDiff: 0 as Qapik,
          priceDiffPercent: 0,
          isQtyMatched: true,
          isPriceMatched: true,
          isWithinTolerance: true,
          status: 'exact_match',
        },
      ],
      checkedAt: '2026-03-26T15:00:00Z',
    },
    linkedDocs: {
      orderId: 'po-2',
      orderNumber: 'PO-2026-0002',
      receiptId: 'gr-1',
      receiptNumber: 'GR-2026-0001',
      paymentId: 'pmt-1',
      paymentNumber: 'PMT-2026-0001',
    },
    createdAt: '2026-03-26T14:00:00Z',
    updatedAt: '2026-03-26T15:30:00Z',
    isDemo: true,
  },
  {
    id: 'inv-2',
    invoiceNumber: 'INV-2026-0002',
    supplierInvoiceRef: 'BFT-QAİMƏ-9950',
    poId: 'po-1',
    poNumber: 'PO-2026-0001',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    supplierTaxId: '1401234567',
    invoiceDate: '2026-04-02',
    dueDate: '2026-05-02',
    status: 'mismatch_hold',
    lines: [
      {
        id: 'invl-2',
        poItemId: 'poi-1',
        productId: 'prod-2',
        productName: 'Qadın Zərif İpək Kofta',
        sku: 'BLZ-W-002',
        size: 'S',
        color: 'Çəhrayı',
        invoicedQty: 25, // Discrepancy: PO ordered only 20, supplier billed 25!
        unitCost: 4200 as Qapik, // Discrepancy: PO agreed 38.00 AZN, supplier billed 42.00 AZN!
        taxRatePercent: 18,
        lineTotal: 105000 as Qapik,
      },
    ],
    subtotal: 105000 as Qapik,
    taxAmount: 18900 as Qapik,
    totalAmount: 123900 as Qapik,
    paidAmount: 0 as Qapik,
    outstandingAmount: 123900 as Qapik,
    matchResult: {
      overallStatus: 'both_mismatch',
      toleranceQtyPercent: 0,
      tolerancePricePercent: 0,
      isApprovedForPayment: false,
      flags: [
        '[BLZ-W-002] Say kənarlaşması: Faktura 25 ədəd, Sifariş 20 ədəd (+5 ədəd artıq yazılıb)',
        '[BLZ-W-002] Qiymət kənarlaşması: Faktura 42.00 ₼, Razılaşdırılmış PO 38.00 ₼ (+%10.5 bahalaşma)',
      ],
      lines: [
        {
          productId: 'prod-2',
          productName: 'Qadın Zərif İpək Kofta',
          sku: 'BLZ-W-002',
          poQty: 20,
          grQty: 0,
          invQty: 25,
          poUnitCost: 3800 as Qapik,
          invUnitCost: 4200 as Qapik,
          qtyDiff: 25,
          priceDiff: 400 as Qapik,
          priceDiffPercent: 10.53,
          isQtyMatched: false,
          isPriceMatched: false,
          isWithinTolerance: false,
          status: 'both_mismatch',
          notes: 'Təchizatçı ilə dəqiqləşdirilməlidir və kredit qeydi tələb edilməlidir.',
        },
      ],
      resolutionNotes: 'Mühasibat tərəfindən saxlanılıb (Hold). Təchizatçıya etiraz məktubu göndərildi.',
      checkedAt: '2026-04-02T16:00:00Z',
    },
    linkedDocs: {
      orderId: 'po-1',
      orderNumber: 'PO-2026-0001',
    },
    createdAt: '2026-04-02T15:30:00Z',
    updatedAt: '2026-04-02T16:00:00Z',
    isDemo: true,
  },
];

export const INITIAL_MOCK_PAYMENTS: SupplierPayment[] = [
  {
    id: 'pmt-1',
    paymentNumber: 'PMT-2026-0001',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    paymentDate: '2026-03-28',
    paymentMethod: 'bank_transfer',
    bankAccountId: 'ba-pasha',
    bankAccountName: 'PAŞA Bank Əsas Cari Hesab',
    referenceNumber: 'PP-20260328-912',
    amount: 100000 as Qapik, // 1,000.00 AZN
    unallocatedAdvance: 0 as Qapik,
    status: 'posted',
    requiresHighAmountApproval: false,
    allocations: [
      {
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        invoiceTotal: 173460 as Qapik,
        previouslyPaid: 0 as Qapik,
        allocatedAmount: 100000 as Qapik,
      },
    ],
    notes: 'Qismən ödəniş icra olundu.',
    linkedDocs: {
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
    },
    createdAt: '2026-03-28T11:00:00Z',
    isDemo: true,
  },
];

export const INITIAL_MOCK_RETURNS: PurchaseReturn[] = [
  {
    id: 'prtn-1',
    returnNumber: 'PRTN-2026-0001',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    warehouseId: 'wh-1',
    warehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-2026-0001',
    reason: 'Kəsik tikiş qüsuru (defekt)',
    status: 'credited',
    items: [
      {
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-001',
        size: 'L',
        color: 'Ağ',
        returnQty: 2,
        unitCost: 2450 as Qapik,
        totalAmount: 4900 as Qapik,
      },
    ],
    totalAmount: 4900 as Qapik,
    stockDocumentId: 'doc-prtn-001',
    creditNoteId: 'cn-1',
    createdAt: '2026-03-29T10:00:00Z',
    isDemo: true,
  },
];

export const INITIAL_MOCK_CREDIT_NOTES: CreditNote[] = [
  {
    id: 'cn-1',
    creditNoteNumber: 'CN-2026-0001',
    supplierId: 'sup-1',
    supplierName: 'Baku Fashion Textile MMC',
    returnId: 'prtn-1',
    invoiceId: 'inv-1',
    amount: 4900 as Qapik, // 49.00 AZN
    reason: 'Defektli məhsulların geri qaytarılması üzrə kredit qeydi',
    status: 'applied',
    createdAt: '2026-03-29T12:00:00Z',
    isDemo: true,
  },
];

export class MockPurchasingAdapter implements PurchasingRepository {
  private requests: PurchaseRequest[] = [...INITIAL_MOCK_REQUESTS];
  private orders: PurchaseOrder[] = [...INITIAL_MOCK_ORDERS];
  private receipts: GoodsReceipt[] = [...INITIAL_MOCK_RECEIPTS];
  private invoices: SupplierInvoice[] = [...INITIAL_MOCK_INVOICES];
  private payments: SupplierPayment[] = [...INITIAL_MOCK_PAYMENTS];
  private returns: PurchaseReturn[] = [...INITIAL_MOCK_RETURNS];
  private creditNotes: CreditNote[] = [...INITIAL_MOCK_CREDIT_NOTES];

  // Processed idempotency keys cache
  private processedIdempotencyKeys = new Map<string, GoodsReceipt>();

  constructor(private inventoryRepo?: InventoryRepository) {}

  // ----------------------------------------------------------------
  // PURCHASE REQUESTS
  // ----------------------------------------------------------------
  async getPurchaseRequests(params?: PurchasingFilterParams): Promise<PurchaseRequest[]> {
    let list = [...this.requests];
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (r) =>
          r.requestNumber.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q) ||
          r.branchName.toLowerCase().includes(q)
      );
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((r) => r.status === params.status);
    }
    return list;
  }

  async getPurchaseRequestById(id: string): Promise<PurchaseRequest | null> {
    const r = this.requests.find((item) => item.id === id);
    return r ? { ...r } : null;
  }

  async createPurchaseRequest(payload: Partial<PurchaseRequest>): Promise<PurchaseRequest> {
    const totalEstimated = (payload.items || []).reduce(
      (sum: Qapik, item) => (sum + item.lineTotal) as Qapik,
      0 as Qapik
    );

    // Approval level based on threshold (<= 1000 AZN -> level 1; <= 10000 AZN -> level 2; > 10000 AZN -> level 3)
    let approvalLevel = 1;
    if (totalEstimated > 1000000) {
      approvalLevel = 3;
    } else if (totalEstimated > 100000) {
      approvalLevel = 2;
    }

    const newRequest: PurchaseRequest = {
      id: `pr-${Date.now()}`,
      requestNumber: `PR-2026-${String(this.requests.length + 1).padStart(4, '0')}`,
      branchId: payload.branchId || 'branch-1',
      branchName: payload.branchName || '28 May Flaman Filialı',
      warehouseId: payload.warehouseId || 'wh-1',
      warehouseName: payload.warehouseName || 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
      neededByDate: payload.neededByDate || new Date().toISOString().slice(0, 10),
      reason: payload.reason || '',
      status: 'pending_approval',
      approvalLevelRequired: approvalLevel,
      totalEstimatedAmount: totalEstimated,
      items: payload.items || [],
      approvalLogs: [
        {
          id: `apl-${Date.now()}`,
          stage: 'Tələbnamə daxil edildi',
          decision: 'approved',
          decidedBy: 'current-user',
          userName: 'Cari İstifadəçi',
          roleName: 'Təşəbbüskar',
          timestamp: new Date().toISOString(),
        },
      ],
      linkedDocs: {},
      createdBy: 'current-user',
      createdByName: 'Cari İstifadəçi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };

    this.requests.unshift(newRequest);
    return { ...newRequest };
  }

  async updatePurchaseRequestStatus(
    id: string,
    decision: 'approved' | 'rejected' | 'returned_for_edit',
    reason?: string
  ): Promise<PurchaseRequest> {
    const idx = this.requests.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Tələbnamə tapılmadı: ${id}`);

    const req = this.requests[idx];
    req.status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'returned_for_edit';
    req.approvalLogs.push({
      id: `apl-${Date.now()}`,
      stage: 'Rəhbərlik baxışı',
      decision,
      decidedBy: 'current-user',
      userName: 'Kamran Əliyev',
      roleName: 'Baş Menecer',
      reason,
      timestamp: new Date().toISOString(),
    });
    req.updatedAt = new Date().toISOString();
    this.requests[idx] = req;
    return { ...req };
  }

  async getSuggestedReorderItems(_warehouseId?: string): Promise<SuggestedReorderItem[]> {
    return [
      {
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-001',
        size: 'L',
        color: 'Ağ',
        currentStock: 4,
        minStockLevel: 25,
        salesVelocityPerWeek: 12,
        suggestedQty: 50,
        estimatedUnitCost: 2450 as Qapik,
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        reason: 'Qalıq (4) minimum həddən (25) aşağıdır. Həftəlik satış sürəti: 12 ədəd.',
      },
      {
        productId: 'prod-2',
        productName: 'Qadın Zərif İpək Kofta',
        sku: 'BLZ-W-002',
        size: 'M',
        color: 'Qara',
        currentStock: 2,
        minStockLevel: 15,
        salesVelocityPerWeek: 8,
        suggestedQty: 30,
        estimatedUnitCost: 3800 as Qapik,
        supplierId: 'sup-1',
        supplierName: 'Baku Fashion Textile MMC',
        reason: 'Qalıq (2) kritik səviyyədədir. Həftəlik satış sürəti: 8 ədəd.',
      },
      {
        productId: 'prod-3',
        productName: 'Kişi Klassik Dəri Ayaqqabı',
        sku: 'SH-OXF-001',
        size: '42',
        color: 'Qara',
        currentStock: 3,
        minStockLevel: 10,
        salesVelocityPerWeek: 5,
        suggestedQty: 20,
        estimatedUnitCost: 5500 as Qapik,
        supplierId: 'sup-2',
        supplierName: 'Anadolu Dəri və Ayaqqabı ASC',
        reason: 'Əsas ölçü (42) tükənmək üzrədir.',
      },
    ];
  }

  // ----------------------------------------------------------------
  // PURCHASE ORDERS
  // ----------------------------------------------------------------
  async getPurchaseOrders(params?: PurchasingFilterParams): Promise<PurchaseOrder[]> {
    let list = [...this.orders];
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (o) =>
          o.poNumber.toLowerCase().includes(q) ||
          o.supplierName.toLowerCase().includes(q) ||
          o.deliveryWarehouseName.toLowerCase().includes(q)
      );
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((o) => o.status === params.status);
    }
    if (params?.supplierId) {
      list = list.filter((o) => o.supplierId === params.supplierId);
    }
    return list;
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
    const o = this.orders.find((item) => item.id === id);
    return o ? { ...o } : null;
  }

  async createPurchaseOrder(payload: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const items = payload.items || [];
    const subtotal = items.reduce((sum: Qapik, it) => (sum + it.lineTotal) as Qapik, 0 as Qapik);
    const taxAmount = Math.round(subtotal * 0.18) as Qapik;
    const totalAmount = (subtotal + taxAmount) as Qapik;

    const newPO: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-${String(this.orders.length + 1).padStart(4, '0')}`,
      supplierId: payload.supplierId || 'sup-1',
      supplierName: payload.supplierName || 'Baku Fashion Textile MMC',
      supplierTaxId: payload.supplierTaxId || '1401234567',
      deliveryWarehouseId: payload.deliveryWarehouseId || 'wh-1',
      deliveryWarehouseName: payload.deliveryWarehouseName || 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
      branchId: payload.branchId || 'branch-1',
      branchName: payload.branchName || '28 May Flaman Filialı',
      orderDate: payload.orderDate || new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: payload.expectedDeliveryDate || new Date().toISOString().slice(0, 10),
      paymentTerms: payload.paymentTerms || 'net30',
      currency: payload.currency || 'AZN',
      status: 'approved',
      items: items.map((it) => ({
        ...it,
        previouslyReceivedQty: 0,
        outstandingQty: it.orderedQty,
      })),
      subtotal,
      discountAmount: 0 as Qapik,
      taxAmount,
      totalAmount,
      notes: payload.notes,
      linkedDocs: payload.linkedDocs || {},
      createdBy: 'current-user',
      createdByName: 'Kamran Əliyev (Baş Menecer)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };

    this.orders.unshift(newPO);
    return { ...newPO };
  }

  async updatePurchaseOrderStatus(
    id: string,
    status: PurchaseOrderStatus,
    notes?: string
  ): Promise<PurchaseOrder> {
    const idx = this.orders.findIndex((o) => o.id === id);
    if (idx === -1) throw new Error(`Sifariş tapılmadı: ${id}`);
    const po = this.orders[idx];
    po.status = status;
    if (notes) po.notes = (po.notes ? `${po.notes} | ` : '') + notes;
    po.updatedAt = new Date().toISOString();
    this.orders[idx] = po;
    return { ...po };
  }

  async sendPurchaseOrderEmail(
    _id: string,
    _toEmail?: string
  ): Promise<{ success: boolean; message: string }> {
    // Check if email provider is configured. In our demo ERP, external provider is not connected yet!
    // Prompt requirement: "Print/PDF and email-send only if an email provider is configured (otherwise show 'Konfiqurasiya olunmayıb')"
    return {
      success: false,
      message: 'Konfiqurasiya olunmayıb: E-poçt provayderi (SMTP/SendGrid) sistem parametrlərində aktivləşdirilməyib.',
    };
  }

  // ----------------------------------------------------------------
  // GOODS RECEIPT
  // ----------------------------------------------------------------
  async getGoodsReceipts(params?: PurchasingFilterParams): Promise<GoodsReceipt[]> {
    let list = [...this.receipts];
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (r) =>
          r.grNumber.toLowerCase().includes(q) ||
          r.poNumber.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q)
      );
    }
    return list;
  }

  async getGoodsReceiptById(id: string): Promise<GoodsReceipt | null> {
    const r = this.receipts.find((item) => item.id === id);
    return r ? { ...r } : null;
  }

  async createGoodsReceipt(
    payload: Partial<GoodsReceipt>,
    idempotencyKey: string
  ): Promise<GoodsReceipt> {
    // Duplicate submit protection: Check if idempotency key was already processed
    if (this.processedIdempotencyKeys.has(idempotencyKey)) {
      return { ...this.processedIdempotencyKeys.get(idempotencyKey)! };
    }

    const items = payload.items || [];
    const valResult = validateReceiptLines(
      items.map((i: GoodsReceiptItem) => ({
        poItemId: i.poItemId,
        sku: i.sku,
        productName: i.productName,
        size: i.size,
        color: i.color,
        orderedQty: i.orderedQty,
        previouslyReceivedQty: i.previouslyReceivedQty,
        receivedNowQty: i.receivedNowQty,
        rejectedQty: i.rejectedQty,
        damagedQty: i.damagedQty,
        reasonCode: i.reasonCode,
        notes: i.notes,
      }))
    );

    if (!valResult.isValid) {
      const errMsgs = Object.values(valResult.errors).join('; ');
      throw new Error(`Qəbul zamanı xəta: ${errMsgs}`);
    }

    const totalOrdered = items.reduce((s: number, it: GoodsReceiptItem) => s + it.orderedQty, 0);
    const totalReceived = items.reduce((s: number, it: GoodsReceiptItem) => s + it.receivedNowQty, 0);
    const totalDamaged = items.reduce((s: number, it: GoodsReceiptItem) => s + it.damagedQty, 0);
    const totalRejected = items.reduce((s: number, it: GoodsReceiptItem) => s + it.rejectedQty, 0);
    const totalAmount = items.reduce(
      (s: Qapik, it: GoodsReceiptItem) => (s + it.receivedNowQty * it.unitCost) as Qapik,
      0 as Qapik
    );

    const newGR: GoodsReceipt = {
      id: `gr-${Date.now()}`,
      grNumber: `GR-2026-${String(this.receipts.length + 1).padStart(4, '0')}`,
      poId: payload.poId || '',
      poNumber: payload.poNumber || '',
      supplierId: payload.supplierId || '',
      supplierName: payload.supplierName || '',
      warehouseId: payload.warehouseId || 'wh-1',
      warehouseName: payload.warehouseName || 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
      receivedDate: payload.receivedDate || new Date().toISOString().slice(0, 10),
      status: 'confirmed',
      idempotencyKey,
      items,
      totalOrderedQty: totalOrdered,
      totalReceivedQty: totalReceived,
      totalDamagedQty: totalDamaged,
      totalRejectedQty: totalRejected,
      totalAmount,
      discrepancyNotes: payload.discrepancyNotes,
      receivedBy: 'current-user',
      receivedByName: 'Əli Həsənov (Anbardar)',
      stockDocumentId: `doc-gr-${Date.now()}`,
      linkedDocs: {
        orderId: payload.poId,
        orderNumber: payload.poNumber,
      },
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      isDemo: true,
    };

    // Update parent PO line previouslyReceivedQty and status
    const poIdx = this.orders.findIndex((o) => o.id === payload.poId);
    if (poIdx !== -1) {
      const po = this.orders[poIdx];
      let allFulfilled = true;
      po.items.forEach((pItem: PurchaseOrderItem) => {
        const receivedItem = items.find((i: GoodsReceiptItem) => i.poItemId === pItem.id || i.sku === pItem.sku);
        if (receivedItem) {
          pItem.previouslyReceivedQty += receivedItem.receivedNowQty;
          pItem.outstandingQty = Math.max(0, pItem.orderedQty - pItem.previouslyReceivedQty);
        }
        if (pItem.outstandingQty > 0) {
          allFulfilled = false;
        }
      });
      po.status = allFulfilled ? 'received' : 'partially_received';
      po.linkedDocs.receiptId = newGR.id;
      po.linkedDocs.receiptNumber = newGR.grNumber;
      po.updatedAt = new Date().toISOString();
      this.orders[poIdx] = po;
    }

    // UPDATE STOCK VIA VALID INVENTORY STOCK DOCUMENT!
    // Stock is updated ONLY by confirming a valid goods-receipt document (UI never edits stock directly).
    if (this.inventoryRepo) {
      try {
        await this.inventoryRepo.createStockDocument({
          docNumber: `MƏDAXİL-${newGR.grNumber}`,
          type: 'receipt',
          status: 'confirmed',
          warehouseId: newGR.warehouseId,
          warehouseName: newGR.warehouseName,
          totalValueQapik: newGR.totalAmount,
          notes: `Satınalma qəbulu #${newGR.grNumber} üzrə anbara daxilolma`,
        }, idempotencyKey);
      } catch {
        // Ignore if mock repository is standalone
      }
    }

    this.processedIdempotencyKeys.set(idempotencyKey, newGR);
    this.receipts.unshift(newGR);
    return { ...newGR };
  }

  async confirmGoodsReceipt(id: string, _idempotencyKey?: string): Promise<GoodsReceipt> {
    const idx = this.receipts.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Qəbul sənədi tapılmadı: ${id}`);
    const gr = this.receipts[idx];
    gr.status = 'confirmed';
    gr.confirmedAt = new Date().toISOString();
    this.receipts[idx] = gr;
    return { ...gr };
  }

  // ----------------------------------------------------------------
  // SUPPLIER INVOICES & THREE-WAY MATCH
  // ----------------------------------------------------------------
  async getSupplierInvoices(params?: PurchasingFilterParams): Promise<SupplierInvoice[]> {
    let list = [...this.invoices];
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.supplierInvoiceRef.toLowerCase().includes(q) ||
          i.supplierName.toLowerCase().includes(q)
      );
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((i) => i.status === params.status);
    }
    return list;
  }

  async getSupplierInvoiceById(id: string): Promise<SupplierInvoice | null> {
    const i = this.invoices.find((item) => item.id === id);
    return i ? { ...i } : null;
  }

  async createSupplierInvoice(payload: Partial<SupplierInvoice>): Promise<SupplierInvoice> {
    const lines = payload.lines || [];
    const subtotal = lines.reduce((sum: Qapik, l: SupplierInvoiceLine) => (sum + l.lineTotal) as Qapik, 0 as Qapik);
    const taxAmount = Math.round(subtotal * 0.18) as Qapik;
    const totalAmount = (subtotal + taxAmount) as Qapik;

    const newInv: SupplierInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-2026-${String(this.invoices.length + 1).padStart(4, '0')}`,
      supplierInvoiceRef: payload.supplierInvoiceRef || `FAK-${Date.now()}`,
      poId: payload.poId,
      poNumber: payload.poNumber,
      grId: payload.grId,
      grNumber: payload.grNumber,
      supplierId: payload.supplierId || 'sup-1',
      supplierName: payload.supplierName || 'Baku Fashion Textile MMC',
      supplierTaxId: payload.supplierTaxId || '1401234567',
      invoiceDate: payload.invoiceDate || new Date().toISOString().slice(0, 10),
      dueDate: payload.dueDate || new Date().toISOString().slice(0, 10),
      status: 'pending_match',
      lines,
      subtotal,
      taxAmount,
      totalAmount,
      paidAmount: 0 as Qapik,
      outstandingAmount: totalAmount,
      linkedDocs: {
        orderId: payload.poId,
        orderNumber: payload.poNumber,
        receiptId: payload.grId,
        receiptNumber: payload.grNumber,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };

    // Auto run match if PO is linked
    if (newInv.poId) {
      const po = this.orders.find((o) => o.id === newInv.poId);
      const gr = this.receipts.find((r) => r.id === newInv.grId || r.poId === newInv.poId);
      if (po) {
        newInv.matchResult = calculateThreeWayMatch(
          po.items,
          gr ? gr.items : [],
          newInv.lines,
          { toleranceQtyPercent: 0, tolerancePricePercent: 0 }
        );
        newInv.status = newInv.matchResult.isApprovedForPayment
          ? 'approved_for_payment'
          : 'mismatch_hold';
      }
    }

    this.invoices.unshift(newInv);
    return { ...newInv };
  }

  async updateSupplierInvoiceStatus(
    id: string,
    status: SupplierInvoiceStatus,
    resolutionNote?: string
  ): Promise<SupplierInvoice> {
    const idx = this.invoices.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Faktura tapılmadı: ${id}`);
    const inv = this.invoices[idx];
    inv.status = status;
    if (resolutionNote && inv.matchResult) {
      inv.matchResult.resolutionNotes = resolutionNote;
    }
    inv.updatedAt = new Date().toISOString();
    this.invoices[idx] = inv;
    return { ...inv };
  }

  async runThreeWayMatch(
    invoiceId: string,
    options?: { toleranceQtyPercent?: number; tolerancePricePercent?: number }
  ): Promise<ThreeWayMatchResult> {
    const inv = this.invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error(`Faktura tapılmadı: ${invoiceId}`);

    const po = this.orders.find((o) => o.id === inv.poId || o.poNumber === inv.poNumber);
    const gr = this.receipts.find((r) => r.id === inv.grId || r.poId === inv.poId);

    const matchRes = calculateThreeWayMatch(
      po ? po.items : [],
      gr ? gr.items : [],
      inv.lines,
      options
    );

    inv.matchResult = matchRes;
    inv.status = matchRes.isApprovedForPayment ? 'approved_for_payment' : 'mismatch_hold';
    inv.updatedAt = new Date().toISOString();

    return matchRes;
  }

  // ----------------------------------------------------------------
  // RETURNS & CREDIT NOTES
  // ----------------------------------------------------------------
  async getPurchaseReturns(): Promise<PurchaseReturn[]> {
    return [...this.returns];
  }

  async createPurchaseReturn(payload: Partial<PurchaseReturn>): Promise<PurchaseReturn> {
    const newReturn: PurchaseReturn = {
      id: `prtn-${Date.now()}`,
      returnNumber: `PRTN-2026-${String(this.returns.length + 1).padStart(4, '0')}`,
      supplierId: payload.supplierId || '',
      supplierName: payload.supplierName || '',
      warehouseId: payload.warehouseId || 'wh-1',
      warehouseName: payload.warehouseName || 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
      invoiceId: payload.invoiceId,
      invoiceNumber: payload.invoiceNumber,
      grId: payload.grId,
      grNumber: payload.grNumber,
      reason: payload.reason || 'Qaytarılma',
      status: 'credited',
      items: payload.items || [],
      totalAmount: payload.totalAmount || (0 as Qapik),
      stockDocumentId: `doc-prtn-${Date.now()}`,
      creditNoteId: `cn-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isDemo: true,
    };

    // Also auto-generate corresponding Credit Note
    const creditNote: CreditNote = {
      id: newReturn.creditNoteId!,
      creditNoteNumber: `CN-2026-${String(this.creditNotes.length + 1).padStart(4, '0')}`,
      supplierId: newReturn.supplierId,
      supplierName: newReturn.supplierName,
      returnId: newReturn.id,
      invoiceId: newReturn.invoiceId,
      amount: newReturn.totalAmount,
      reason: `Qaytarılma #${newReturn.returnNumber} üzrə kredit qeydi`,
      status: 'applied',
      createdAt: new Date().toISOString(),
      isDemo: true,
    };

    // Reduce inventory through an inventory stock document
    if (this.inventoryRepo) {
      try {
        await this.inventoryRepo.createStockDocument({
          docNumber: `QAYTARILMA-${newReturn.returnNumber}`,
          type: 'issue',
          status: 'confirmed',
          warehouseId: newReturn.warehouseId,
          warehouseName: newReturn.warehouseName,
          totalValueQapik: newReturn.totalAmount,
          notes: `Təchizatçıya qaytarılma #${newReturn.returnNumber}`,
        });
      } catch {
        // ignore
      }
    }

    this.creditNotes.unshift(creditNote);
    this.returns.unshift(newReturn);
    return { ...newReturn };
  }

  async getCreditNotes(): Promise<CreditNote[]> {
    return [...this.creditNotes];
  }

  // ----------------------------------------------------------------
  // SUPPLIER PAYMENTS & AGING
  // ----------------------------------------------------------------
  async getSupplierPayments(params?: PurchasingFilterParams): Promise<SupplierPayment[]> {
    let list = [...this.payments];
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.paymentNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q) ||
          p.referenceNumber.toLowerCase().includes(q)
      );
    }
    return list;
  }

  async createSupplierPayment(payload: Partial<SupplierPayment>): Promise<SupplierPayment> {
    const amount = payload.amount || (0 as Qapik);
    const allocations = payload.allocations || [];
    const totalAllocated = allocations.reduce((sum: Qapik, a: PaymentInvoiceAllocation) => (sum + a.allocatedAmount) as Qapik, 0 as Qapik);
    const unallocatedAdvance = Math.max(0, amount - totalAllocated) as Qapik;

    // High amount check: over 10,000 AZN (1,000,000 Qəpik) requires manager approval
    const requiresApproval = amount > 1000000;

    const newPayment: SupplierPayment = {
      id: `pmt-${Date.now()}`,
      paymentNumber: `PMT-2026-${String(this.payments.length + 1).padStart(4, '0')}`,
      supplierId: payload.supplierId || '',
      supplierName: payload.supplierName || '',
      paymentDate: payload.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: payload.paymentMethod || 'bank_transfer',
      bankAccountId: payload.bankAccountId,
      bankAccountName: payload.bankAccountName || 'PAŞA Bank ASC',
      referenceNumber: payload.referenceNumber || `REF-${Date.now()}`,
      amount,
      unallocatedAdvance,
      status: requiresApproval ? 'pending_approval' : 'posted',
      requiresHighAmountApproval: requiresApproval,
      requiresApproval,
      allocations,
      notes: payload.notes,
      linkedDocs: {},
      createdAt: new Date().toISOString(),
      isDemo: true,
    };

    // Deduct from paid invoices if posted directly
    if (newPayment.status === 'posted') {
      for (const alloc of allocations) {
        const inv = this.invoices.find((i) => i.id === alloc.invoiceId);
        if (inv) {
          inv.paidAmount = (inv.paidAmount + alloc.allocatedAmount) as Qapik;
          inv.outstandingAmount = Math.max(0, inv.totalAmount - inv.paidAmount) as Qapik;
          inv.status = inv.outstandingAmount === 0 ? 'paid' : 'partially_paid';
          inv.updatedAt = new Date().toISOString();
        }
      }
    }

    this.payments.unshift(newPayment);
    return { ...newPayment };
  }

  async approveSupplierPayment(id: string): Promise<SupplierPayment> {
    const idx = this.payments.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Ödəniş tapılmadı: ${id}`);
    const pmt = this.payments[idx];
    pmt.status = 'posted';
    pmt.approvedBy = 'current-user';
    pmt.approvedByName = 'Kamran Əliyev (Baş Menecer)';

    // Deduct from allocated invoices
    for (const alloc of pmt.allocations) {
      const inv = this.invoices.find((i) => i.id === alloc.invoiceId);
      if (inv) {
        inv.paidAmount = (inv.paidAmount + alloc.allocatedAmount) as Qapik;
        inv.outstandingAmount = Math.max(0, inv.totalAmount - inv.paidAmount) as Qapik;
        inv.status = inv.outstandingAmount === 0 ? 'paid' : 'partially_paid';
        inv.updatedAt = new Date().toISOString();
      }
    }

    this.payments[idx] = pmt;
    return { ...pmt };
  }

  async getPayablesAging(referenceDate?: string): Promise<PayablesAgingBucket[]> {
    return calculatePayablesAging(this.invoices, referenceDate);
  }
}
