import { z } from 'zod';

// 1. Purchase Request Schema
export const purchaseRequestItemSchema = z.object({
  productId: z.string().min(1, 'Məhsul seçilməlidir'),
  productName: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional().default(''),
  size: z.string().min(1, 'Ölçü seçilməlidir'),
  color: z.string().min(1, 'Rəng seçilməlidir'),
  requestedQty: z.number().int().positive('Say ən azı 1 olmalıdır'),
  estimatedUnitCost: z.number().int().min(0, 'Qiymət mənfi ola bilməz'), // in Qəpik
  currentStock: z.number().default(0),
  suggestedQty: z.number().optional(),
  isSuggestionApplied: z.boolean().optional(),
});

export const purchaseRequestFormSchema = z.object({
  branchId: z.string().min(1, 'Filial seçilməlidir'),
  warehouseId: z.string().min(1, 'Təhvil anbarı seçilməlidir'),
  neededByDate: z.string().min(1, 'Tələb olunan tarix daxil edilməlidir'),
  reason: z.string().min(5, 'Sifarişin səbəbi ən azı 5 simvol olmalıdır'),
  items: z.array(purchaseRequestItemSchema).min(1, 'Ən azı 1 məhsul əlavə edilməlidir'),
});

export type PurchaseRequestFormData = z.infer<typeof purchaseRequestFormSchema>;

// 2. Purchase Order Schema
export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1, 'Məhsul seçilməlidir'),
  productName: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional().default(''),
  size: z.string().min(1),
  color: z.string().min(1),
  orderedQty: z.number().int().positive('Say ən azı 1 olmalıdır'),
  unitCost: z.number().int().positive('Maya qiyməti müsbət olmalıdır'), // in Qəpik
  discountPercent: z.number().min(0).max(100).default(0),
  taxRatePercent: z.number().min(0).max(100).default(18),
});

export const purchaseOrderFormSchema = z.object({
  supplierId: z.string().min(1, 'Təchizatçı seçilməlidir'),
  deliveryWarehouseId: z.string().min(1, 'Təhvil anbarı seçilməlidir'),
  branchId: z.string().min(1, 'Filial seçilməlidir'),
  expectedDeliveryDate: z.string().min(1, 'Gözlənilən çatdırılma tarixi seçilməlidir'),
  paymentTerms: z.string().min(1, 'Ödəniş şərti seçilməlidir'),
  currency: z.enum(['AZN', 'USD', 'EUR', 'TRY']).default('AZN'),
  notes: z.string().optional(),
  items: z.array(purchaseOrderItemSchema).min(1, 'Ən azı 1 məhsul əlavə edilməlidir'),
});

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderFormSchema>;

// 3. Goods Receipt Schema
export const goodsReceiptItemSchema = z.object({
  poItemId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional().default(''),
  size: z.string().min(1),
  color: z.string().min(1),
  orderedQty: z.number().int().nonnegative(),
  previouslyReceivedQty: z.number().int().nonnegative(),
  receivedNowQty: z.number().int().nonnegative('Mənfi qəbul edilə bilməz'),
  rejectedQty: z.number().int().nonnegative().default(0),
  damagedQty: z.number().int().nonnegative().default(0),
  reasonCode: z.string().optional(),
  notes: z.string().optional(),
  unitCost: z.number().int().nonnegative(),
});

export const goodsReceiptFormSchema = z.object({
  poId: z.string().min(1, 'Satınalma sifarişi seçilməlidir'),
  receivedDate: z.string().min(1, 'Qəbul tarixi seçilməlidir'),
  warehouseId: z.string().min(1, 'Anbar seçilməlidir'),
  discrepancyNotes: z.string().optional(),
  idempotencyKey: z.string().min(1, 'İdempotentlik açarı mütləqdir'),
  items: z.array(goodsReceiptItemSchema).min(1, 'Sənəddə ən azı 1 sətir olmalıdır'),
});

export type GoodsReceiptFormData = z.infer<typeof goodsReceiptFormSchema>;

// 4. Supplier Invoice Schema
export const supplierInvoiceLineSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  sku: z.string().min(1),
  size: z.string().min(1),
  color: z.string().min(1),
  invoicedQty: z.number().int().positive('Say ən azı 1 olmalıdır'),
  unitCost: z.number().int().positive('Qiymət müsbət olmalıdır'), // in Qəpik
  taxRatePercent: z.number().min(0).max(100).default(18),
});

export const supplierInvoiceFormSchema = z.object({
  supplierId: z.string().min(1, 'Təchizatçı seçilməlidir'),
  supplierInvoiceRef: z.string().min(2, 'Təchizatçının faktura seriya və nömrəsi mütləqdir'),
  poId: z.string().optional(),
  grId: z.string().optional(),
  invoiceDate: z.string().min(1, 'Faktura tarixi seçilməlidir'),
  dueDate: z.string().min(1, 'Ödəniş son tarixi seçilməlidir'),
  lines: z.array(supplierInvoiceLineSchema).min(1, 'Faktura sətirləri boş ola bilməz'),
});

export type SupplierInvoiceFormData = z.infer<typeof supplierInvoiceFormSchema>;

// 5. Supplier Payment Schema
export const paymentAllocationSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceTotal: z.number().int().nonnegative(),
  previouslyPaid: z.number().int().nonnegative(),
  allocatedAmount: z.number().int().nonnegative(),
});

export const supplierPaymentFormSchema = z.object({
  supplierId: z.string().min(1, 'Təchizatçı seçilməlidir'),
  paymentDate: z.string().min(1, 'Ödəniş tarixi seçilməlidir'),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'check']),
  bankAccountId: z.string().optional(),
  referenceNumber: z.string().min(2, 'Bank çıxarışı / Qəbz nömrəsi mütləqdir'),
  amount: z.number().int().positive('Ödəniş məbləği 0-dan böyük olmalıdır'), // in Qəpik
  notes: z.string().optional(),
  allocations: z.array(paymentAllocationSchema).optional().default([]),
});

export type SupplierPaymentFormData = z.infer<typeof supplierPaymentFormSchema>;

