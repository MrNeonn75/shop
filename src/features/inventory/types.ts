import { Qapik } from '../../shared/utils/money';
import { ProductSection, ProductType } from '../../shared/types/models';

export type StockMovementType =
  | 'receipt'          // Qəbul (ilkin, açılış və ya qeyri-satınalma)
  | 'issue'            // Silinmə (daxili istifadə, xərcləmə)
  | 'transfer_out'    // Transfer çıxış (mənbədən tranzitə)
  | 'transfer_in'     // Transfer giriş (tranzitdən təyinat anbarına)
  | 'sale'             // Satış (kassa və ya sifariş)
  | 'return'           // Qaytarılma (müştəri qaytarması)
  | 'adjustment'       // Korreksiya / düzəliş
  | 'inventory_count'  // İnventarizasiya sayım fərqi
  | 'damaged'          // Zədəli mal qeydiyyatı
  | 'lost';            // İtmiş / əskik mal qeydiyyatı

export type StockState = 'normal' | 'low' | 'out_of_stock' | 'negative';

export interface StockMovement {
  id: string; // e.g. "MV-2026-00001"
  timestamp: string; // ISO 8601 (formatted to Asia/Baku in UI)
  type: StockMovementType;
  productId: string;
  productName: string;
  productSku: string;
  productBarcode: string;
  variantId: string;
  variantSku: string;
  variantBarcode: string;
  size: string;
  color: string;
  fromWarehouseId?: string;
  fromWarehouseName?: string;
  toWarehouseId?: string;
  toWarehouseName?: string;
  quantity: number; // positive magnitude of movement
  unitCostQapik: Qapik;
  totalCostQapik: Qapik;
  referenceDocType:
    | 'receipt'
    | 'issue'
    | 'adjustment'
    | 'transfer'
    | 'inventory_count'
    | 'opening'
    | 'sale'
    | 'return'
    | 'damaged'
    | 'lost';
  referenceDocId: string;
  referenceDocNumber: string; // e.g. "DOC-2026-00012", "TR-28M-2026-00004"
  userId: string;
  userName: string;
  reasonCode?: string;
  notes?: string;
  classification?: 'resalable' | 'damaged' | 'restricted';
}

export interface StockBalance {
  productId: string;
  productName: string;
  productSku: string;
  productBarcode: string;
  section: ProductSection;
  type: ProductType;
  categoryName: string;
  brandName: string;
  variantId: string;
  variantSku: string;
  variantBarcode: string;
  size: string;
  color: string;
  warehouseId: string;
  warehouseName: string;
  branchId: string;
  branchName: string;
  onHand: number;          // Faktiki qalıq (Ledger movements: sum(in) - sum(out))
  reserved: number;        // Rezerv edilmiş (Təsdiqlənmiş/Yığımdakı transferlər)
  available: number;       // Sərbəst qalıq (onHand - reserved)
  inTransit: number;       // Yolda olan (Yola salınmış, lakin hələ qəbul edilməmiş)
  minLevel: number;        // Minimum kritik limit
  unitCostQapik: Qapik;
  valuationQapik: Qapik;   // onHand * unitCostQapik (Həssas maliyyə sahəsi)
  lastMovementDate?: string;
  lastSaleDate?: string;
  daysWithoutSale: number; // Günlərin sayı (dövriyyə analizi üçün)
  stockState: StockState;
}

export type StockDocumentType =
  | 'receipt'
  | 'issue'
  | 'adjustment'
  | 'damaged'
  | 'lost'
  | 'return_classification'
  | 'opening';

export type StockDocumentStatus = 'draft' | 'confirmed' | 'cancelled';

export interface StockDocumentLine {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSku: string;
  variantBarcode: string;
  size: string;
  color: string;
  quantity: number;
  currentOnHand: number;
  unitCostQapik: Qapik;
  totalCostQapik: Qapik;
  reasonCode?: string;
  classification?: 'resalable' | 'damaged' | 'restricted';
  notes?: string;
}

export interface StockDocumentAttachment {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface StockDocumentAuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
}

export interface StockDocument {
  id: string;
  docNumber: string; // e.g. "DOC-2026-00014"
  type: StockDocumentType;
  status: StockDocumentStatus;
  warehouseId: string;
  warehouseName: string;
  branchId: string;
  branchName: string;
  createdAt: string;
  confirmedAt?: string;
  createdById: string;
  createdByName: string;
  reasonCode?: string;
  notes?: string;
  allowNegativeStockOverride?: boolean;
  negativeOverrideReason?: string;
  lines: StockDocumentLine[];
  attachments: StockDocumentAttachment[];
  auditTrail: StockDocumentAuditEntry[];
  totalValueQapik: Qapik;
}

export type InventoryCountScope = 'full' | 'category' | 'random';
export type InventoryCountStatus = 'draft' | 'active' | 'paused' | 'review' | 'approved' | 'cancelled';

export interface InventoryCountItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSku: string;
  variantBarcode: string;
  size: string;
  color: string;
  expectedQty: number;     // Dondurulmuş snapshot qalığı
  countedQty: number;      // Sayılmış faktiki say
  varianceQty: number;     // countedQty - expectedQty
  unitCostQapik: Qapik;
  varianceValueQapik: Qapik; // varianceQty * unitCostQapik
  recountFlag: boolean;
  notes?: string;
}

export interface InventoryCountScanLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  variantSku: string;
  barcode: string;
  deltaQty: number;
  newCountedQty: number;
  action: 'scan' | 'manual_input' | 'undo';
}

export interface InventoryCountSession {
  id: string;
  sessionNumber: string; // e.g. "CNT-2026-00001"
  warehouseId: string;
  warehouseName: string;
  branchId: string;
  branchName: string;
  scope: InventoryCountScope;
  categoryFilter?: string;
  isBlindCount: boolean; // Əgər true-dursa, sayım zamanı gözlənilən say gizlədilir
  status: InventoryCountStatus;
  createdAt: string;
  startedAt?: string;
  snapshotFrozenAt?: string;
  approvedAt?: string;
  createdById: string;
  createdByName: string;
  approvedById?: string;
  approvedByName?: string;
  notes?: string;
  items: InventoryCountItem[];
  scanLogs: InventoryCountScanLog[];
  adjustmentDocId?: string;
  adjustmentDocNumber?: string;
}

export interface OpeningBalanceRow {
  barcode: string;
  sku: string;
  name: string;
  size: string;
  color: string;
  quantity: number;
  unitCostAzn: number;
}

export interface OpeningBalanceRecord {
  warehouseId: string;
  importedAt: string;
  documentId: string;
  documentNumber: string;
  totalSKUs: number;
  totalUnits: number;
  totalValueQapik: Qapik;
  importedBy: string;
}

export interface StockAlertRule {
  id: string;
  scope: 'global' | 'category' | 'warehouse' | 'product';
  targetId?: string;
  targetName: string;
  minQty: number;
  autoReorderQty?: number;
  isActive: boolean;
}

export interface WarehouseBinZone {
  id: string;
  warehouseId: string;
  zone: string; // e.g. "Zolaq A"
  rack: string; // e.g. "Rəf 03"
  bin: string;  // e.g. "Göz 12"
  code: string; // "A-03-12"
  description?: string;
}

export interface StockFilterParams {
  search?: string;
  branchId?: string;
  warehouseId?: string;
  section?: ProductSection | 'all';
  type?: ProductType | 'all';
  categoryId?: string;
  brandName?: string;
  stockState?: StockState | 'all';
  minDaysWithoutSale?: number;
  tab?: 'all' | 'low' | 'out_of_stock' | 'slow_moving' | 'dead_stock';
}

export interface MovementFilterParams {
  search?: string;
  type?: StockMovementType | 'all';
  warehouseId?: string;
  productId?: string;
  variantId?: string;
  docNumber?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}
