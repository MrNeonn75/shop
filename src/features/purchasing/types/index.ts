import { Qapik } from '../../../shared/utils/money';

// ----------------------------------------------------
// WORKFLOW STEPS
// Purchase Request → Approval → Purchase Order → Goods Receipt → Supplier Invoice → Payment
// ----------------------------------------------------
export type PurchasingWorkflowStage =
  | 'request'
  | 'approval'
  | 'order'
  | 'receipt'
  | 'invoice'
  | 'payment';

export interface WorkflowLinkedDocuments {
  requestId?: string;
  requestNumber?: string;
  orderId?: string;
  orderNumber?: string;
  receiptId?: string;
  receiptNumber?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentId?: string;
  paymentNumber?: string;
}

// ----------------------------------------------------
// 1. PURCHASE REQUEST (Tələbnamə)
// ----------------------------------------------------
export type PurchaseRequestStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'returned_for_edit'
  | 'converted_to_po';

export interface PurchaseRequestItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  requestedQty: number;
  estimatedUnitCost: Qapik; // in Qəpik
  lineTotal: Qapik;        // in Qəpik
  currentStock: number;
  minStockLevel?: number;
  suggestedQty?: number;
  isSuggestionApplied?: boolean;
}

export interface ApprovalLog {
  id: string;
  stage: string;
  decision: 'approved' | 'rejected' | 'returned_for_edit';
  decidedBy: string;
  userName: string;
  roleName: string;
  reason?: string;
  timestamp: string;
}

export interface SuggestedReorderItem {
  productId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  currentStock: number;
  minStockLevel: number;
  salesVelocityPerWeek: number;
  suggestedQty: number;
  estimatedUnitCost: Qapik;
  supplierId?: string;
  supplierName?: string;
  reason: string; // Məs. "Stok minimum həddən aşağıdır (qalıq: 2, min: 10, həftəlik satış: 5)"
}

export interface PurchaseRequest {
  id: string;
  requestNumber: string; // PR-2026-0001
  branchId: string;
  branchName: string;
  warehouseId: string;
  warehouseName: string;
  neededByDate: string;
  reason: string;
  status: PurchaseRequestStatus;
  approvalLevelRequired: number; // 1 (<= 1000 AZN), 2 (<= 10000 AZN), 3 (> 10000 AZN)
  totalEstimatedAmount: Qapik;
  items: PurchaseRequestItem[];
  approvalLogs: ApprovalLog[];
  linkedDocs: WorkflowLinkedDocuments;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

// ----------------------------------------------------
// 2. PURCHASE ORDER (Satınalma Sifarişi)
// ----------------------------------------------------
export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled';

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  orderedQty: number;
  previouslyReceivedQty: number;
  receivedNowQty?: number;
  outstandingQty: number; // orderedQty - previouslyReceivedQty
  unitCost: Qapik;
  discountPercent: number; // 0 - 100
  taxRatePercent: number;  // 0 or 18% etc.
  lineTotal: Qapik;        // in Qəpik
}

export interface PurchaseOrder {
  id: string;
  poNumber: string; // PO-2026-0001
  supplierId: string;
  supplierName: string;
  supplierTaxId: string;
  deliveryWarehouseId: string;
  deliveryWarehouseName: string;
  branchId: string;
  branchName: string;
  orderDate: string;
  expectedDeliveryDate: string;
  paymentTerms: string;
  currency: 'AZN' | 'USD' | 'EUR' | 'TRY';
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  subtotal: Qapik;
  discountAmount: Qapik;
  taxAmount: Qapik;
  totalAmount: Qapik;
  notes?: string;
  attachments?: string[];
  emailSentAt?: string;
  emailSentTo?: string;
  linkedDocs: WorkflowLinkedDocuments;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

// ----------------------------------------------------
// 3. GOODS RECEIPT (Malların Mədaxili / Təhvil-Təslim)
// ----------------------------------------------------
export type GoodsReceiptStatus = 'draft' | 'confirmed' | 'cancelled';

export interface GoodsReceiptItem {
  id: string;
  poItemId: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  orderedQty: number;
  previouslyReceivedQty: number;
  receivedNowQty: number;
  rejectedQty: number;
  damagedQty: number;
  reasonCode?: string;
  notes?: string;
  unitCost: Qapik;
}

export interface GoodsReceipt {
  id: string;
  grNumber: string; // GR-2026-0001
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  receivedDate: string;
  status: GoodsReceiptStatus;
  idempotencyKey: string;
  items: GoodsReceiptItem[];
  totalOrderedQty: number;
  totalReceivedQty: number;
  totalDamagedQty: number;
  totalRejectedQty: number;
  totalAmount: Qapik;
  discrepancyNotes?: string;
  receivedBy: string;
  receivedByName: string;
  stockDocumentId?: string; // Links to confirmed Inventory stock document!
  linkedDocs: WorkflowLinkedDocuments;
  createdAt: string;
  confirmedAt?: string;
  isDemo: boolean;
}

export interface DiscrepancyReport {
  poNumber: string;
  grNumber: string;
  hasDiscrepancy: boolean;
  lines: Array<{
    sku: string;
    productName: string;
    size: string;
    color: string;
    orderedQty: number;
    receivedQty: number;
    rejectedQty: number;
    damagedQty: number;
    discrepancyQty: number; // receivedQty - orderedQty
    unitCost: Qapik;
    varianceAmount: Qapik;
    reason?: string;
  }>;
}

// ----------------------------------------------------
// 4. SUPPLIER INVOICE & THREE-WAY MATCH (Hesab-Faktura)
// ----------------------------------------------------
export type SupplierInvoiceStatus =
  | 'draft'
  | 'pending_match'
  | 'matched'
  | 'mismatch_hold'
  | 'disputed'
  | 'approved_for_payment'
  | 'partially_paid'
  | 'paid'
  | 'cancelled';

export type MatchStatus =
  | 'exact_match'
  | 'match_within_tolerance'
  | 'tolerance_match'
  | 'quantity_mismatch'
  | 'qty_mismatch'
  | 'price_mismatch'
  | 'both_mismatch'
  | 'unmatched';

export interface ThreeWayMatchLineResult {
  productId: string;
  productName: string;
  sku: string;
  poQty: number;
  grQty: number;
  invQty: number;
  poUnitCost: Qapik;
  invUnitCost: Qapik;
  qtyDiff: number;            // invQty - grQty
  priceDiff: Qapik;          // invUnitCost - poUnitCost
  priceDiffPercent: number;   // ((invUnitCost - poUnitCost) / poUnitCost) * 100
  isQtyMatched: boolean;
  isPriceMatched: boolean;
  isWithinTolerance: boolean;
  status: MatchStatus;
  notes?: string;
}

export interface ThreeWayMatchResult {
  overallStatus: MatchStatus;
  toleranceQtyPercent: number;    // e.g. 0%
  tolerancePricePercent: number;  // e.g. 1% or 0%
  isApprovedForPayment: boolean;
  canApproveForPayment?: boolean;
  hasMismatch?: boolean;
  flagMissingGR?: boolean;
  flags: string[];
  lines: ThreeWayMatchLineResult[];
  resolutionNotes?: string;
  checkedAt: string;
}

export interface SupplierInvoiceLine {
  id: string;
  poItemId?: string;
  grItemId?: string;
  productId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  invoicedQty: number;
  unitCost: Qapik;
  taxRatePercent: number;
  lineTotal: Qapik;
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;        // INV-2026-0001
  supplierInvoiceRef: string;   // Supplier's external reference/seriya (məs: AA-98234)
  poId?: string;
  poNumber?: string;
  grId?: string;
  grNumber?: string;
  supplierId: string;
  supplierName: string;
  supplierTaxId: string;
  invoiceDate: string;
  dueDate: string;
  status: SupplierInvoiceStatus;
  lines: SupplierInvoiceLine[];
  subtotal: Qapik;
  taxAmount: Qapik;
  totalAmount: Qapik;
  paidAmount: Qapik;
  outstandingAmount: Qapik;
  currency?: 'AZN' | 'USD' | 'EUR' | 'TRY';
  matchResult?: ThreeWayMatchResult;
  attachmentFileName?: string;
  linkedDocs?: WorkflowLinkedDocuments;
  createdAt: string;
  updatedAt?: string;
  isDemo?: boolean;
}

// ----------------------------------------------------
// 5. CREDIT NOTES & PURCHASE RETURNS (Qaytarılma və Kredit Qeydi)
// ----------------------------------------------------
export interface PurchaseReturn {
  id: string;
  returnNumber: string; // PRTN-2026-0001
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  grId?: string;
  grNumber?: string;
  reason: string;
  status: 'draft' | 'approved' | 'dispatched' | 'credited';
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    size: string;
    color: string;
    returnQty: number;
    unitCost: Qapik;
    totalAmount: Qapik;
  }>;
  totalAmount: Qapik;
  stockDocumentId?: string; // Reduces inventory via stock document
  creditNoteId?: string;
  createdAt: string;
  isDemo: boolean;
}

export interface CreditNote {
  id: string;
  creditNoteNumber: string; // CN-2026-0001
  supplierId: string;
  supplierName: string;
  returnId?: string;
  invoiceId?: string;
  amount: Qapik;
  reason: string;
  status: 'issued' | 'applied';
  createdAt: string;
  isDemo: boolean;
}

// ----------------------------------------------------
// 6. SUPPLIER PAYMENTS & AGING (Ödənişlər və Yaşlanma)
// ----------------------------------------------------
export type PaymentMethodType = 'bank_transfer' | 'cash' | 'check';

export interface PaymentInvoiceAllocation {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: Qapik;
  previouslyPaid: Qapik;
  allocatedAmount: Qapik;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string; // PMT-2026-0001
  supplierId: string;
  supplierName: string;
  paymentDate: string;
  paymentMethod: PaymentMethodType;
  bankAccountId?: string;
  bankAccountName?: string;
  referenceNumber: string; // Bank köçürmə rekviziti / Qəbz №
  amount: Qapik;
  unallocatedAdvance: Qapik;
  status: 'draft' | 'pending_approval' | 'approved' | 'posted' | 'cancelled';
  requiresHighAmountApproval: boolean; // if amount > 10000 AZN (1 000 000 Qəpik)
  requiresApproval?: boolean;
  approvedBy?: string;
  approvedByName?: string;
  allocations: PaymentInvoiceAllocation[];
  notes?: string;
  linkedDocs: WorkflowLinkedDocuments;
  createdAt: string;
  isDemo: boolean;
}

export interface PayablesAgingBucket {
  supplierId: string;
  supplierName: string;
  taxId: string;
  current0To30: Qapik;
  days31To60: Qapik;
  days61To90: Qapik;
  days90Plus: Qapik;
  totalPayable: Qapik;
}

// ----------------------------------------------------
// 7. REPORTS & FILTERS
// ----------------------------------------------------
export interface PurchasingFilterParams {
  search?: string;
  status?: string;
  supplierId?: string;
  warehouseId?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

