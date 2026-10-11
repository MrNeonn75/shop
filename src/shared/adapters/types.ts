import { Branch, PaginatedResult, Product, ProductFilterParams } from '../types/models';
import {
  CatalogProduct,
  CatalogFilterParams,
  ProductCategoryTaxonomy,
  Brand,
  ProductStatus,
} from '../../features/catalog/types/catalog';

export interface ProductRepository {
  getProducts(params?: ProductFilterParams): Promise<PaginatedResult<Product>>;
  getProductById(id: string): Promise<Product | null>;
  createProduct(
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<Product>;
  updateProduct(id: string, updates: Partial<Product>): Promise<Product>;
  deleteProduct(id: string): Promise<boolean>;
}

export interface CatalogRepository {
  getProducts(params?: CatalogFilterParams): Promise<PaginatedResult<CatalogProduct>>;
  getProductById(id: string): Promise<CatalogProduct | null>;
  createProduct(
    product: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<CatalogProduct>;
  updateProduct(id: string, updates: Partial<CatalogProduct>): Promise<CatalogProduct>;
  deleteProduct(id: string): Promise<boolean>;
  bulkUpdateStatus(productIds: string[], status: ProductStatus): Promise<number>;
  bulkUpdateCategory(
    productIds: string[],
    categoryId: string,
    categoryName: string
  ): Promise<number>;
  checkIdentifierUniqueness(
    sku: string,
    barcode: string,
    excludeProductId?: string
  ): Promise<{ skuAvailable: boolean; barcodeAvailable: boolean }>;
  getCategories(): Promise<ProductCategoryTaxonomy[]>;
  saveCategory(category: Partial<ProductCategoryTaxonomy>): Promise<ProductCategoryTaxonomy>;
  deleteCategory(id: string, reassignToId?: string): Promise<boolean>;
  getBrands(): Promise<Brand[]>;
  saveBrand(brand: Partial<Brand>): Promise<Brand>;
  deleteBrand(id: string): Promise<boolean>;
  importProducts(
    products: Partial<CatalogProduct>[]
  ): Promise<{ importedCount: number; errors: Array<{ row: number; reason: string }> }>;
}

export interface BranchRepository {
  getBranches(): Promise<Branch[]>;
  getBranchById(id: string): Promise<Branch | null>;
}

export interface DashboardRepository {
  getSummary(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').DashboardSummaryResponse>;
  getSalesTrend(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').SalesTrendDataPoint[]>;
  getSalesByBranch(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').BranchSalesDataPoint[]>;
  getSectionTypeSales(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').SectionTypeSalesData>;
  getTopSellingProducts(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').TopSellingProductsData>;
  getPaymentBreakdown(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').PaymentBreakdownData>;
  getInventoryAlerts(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').InventoryAlertsData>;
  getSlowMovingStock(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').SlowMovingStockData>;
  getExpenseTrend(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').ExpenseTrendData>;
  getOperationsStatus(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').OperationsStatusData>;
  getActivities(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').DashboardActivitiesData>;
}

export interface InventoryRepository {
  getMovements(params?: import('../../features/inventory/types').MovementFilterParams): Promise<PaginatedResult<import('../../features/inventory/types').StockMovement>>;
  getStockBalances(params?: import('../../features/inventory/types').StockFilterParams): Promise<import('../../features/inventory/types').StockBalance[]>;
  getVariantMatrix(productId: string, warehouseId: string): Promise<import('../../features/inventory/services/ledgerEngine').VariantMatrixData>;
  getStockDocuments(params?: { type?: string; status?: string; warehouseId?: string }): Promise<import('../../features/inventory/types').StockDocument[]>;
  getStockDocumentById(id: string): Promise<import('../../features/inventory/types').StockDocument | null>;
  createStockDocument(doc: Partial<import('../../features/inventory/types').StockDocument>, idempotencyKey?: string): Promise<import('../../features/inventory/types').StockDocument>;
  confirmStockDocument(id: string, idempotencyKey?: string): Promise<import('../../features/inventory/types').StockDocument>;
  getCountSessions(params?: { status?: string; warehouseId?: string }): Promise<import('../../features/inventory/types').InventoryCountSession[]>;
  getCountSessionById(id: string): Promise<import('../../features/inventory/types').InventoryCountSession | null>;
  createCountSession(payload: Partial<import('../../features/inventory/types').InventoryCountSession>, idempotencyKey?: string): Promise<import('../../features/inventory/types').InventoryCountSession>;
  logCountScan(sessionId: string, payload: { barcodeOrSku: string; delta: number; isUndo?: boolean; manualQty?: number }): Promise<import('../../features/inventory/types').InventoryCountSession>;
  toggleRecountItem(sessionId: string, itemId: string): Promise<import('../../features/inventory/types').InventoryCountSession>;
  updateCountSessionStatus(sessionId: string, status: import('../../features/inventory/types').InventoryCountStatus): Promise<import('../../features/inventory/types').InventoryCountSession>;
  approveCountSession(sessionId: string, idempotencyKey?: string): Promise<{ session: import('../../features/inventory/types').InventoryCountSession; adjustmentDocument: import('../../features/inventory/types').StockDocument }>;
  importOpeningBalance(warehouseId: string, rows: import('../../features/inventory/types').OpeningBalanceRow[], override: boolean, overrideReason?: string, idempotencyKey?: string): Promise<import('../../features/inventory/types').StockDocument>;
  getOpeningBalanceRecords(): Promise<import('../../features/inventory/types').OpeningBalanceRecord[]>;
  getAlertRules(): Promise<import('../../features/inventory/types').StockAlertRule[]>;
  saveAlertRule(rule: Partial<import('../../features/inventory/types').StockAlertRule>): Promise<import('../../features/inventory/types').StockAlertRule>;
  deleteAlertRule(id: string): Promise<boolean>;
  getWarehouses(): Promise<import('./mock/adminMockData').AdminWarehouse[]>;
  getWarehouseById(id: string): Promise<import('./mock/adminMockData').AdminWarehouse | null>;
  getWarehouseBins(warehouseId: string): Promise<import('../../features/inventory/types').WarehouseBinZone[]>;
}

export interface TransferRepository {
  getTransfers(params?: import('../../features/transfers/types').TransferFilterParams): Promise<import('../../features/transfers/types').Transfer[]>;
  getTransferById(id: string): Promise<import('../../features/transfers/types').Transfer | null>;
  createTransfer(payload: import('../../features/transfers/types').CreateTransferPayload, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  submitTransfer(id: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  approveTransfer(id: string, notes?: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  rejectTransfer(id: string, reason: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  startPicking(id: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  updatePicking(id: string, payload: import('../../features/transfers/types').UpdatePickingPayload, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  dispatchTransfer(id: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  receiveTransfer(id: string, payload: import('../../features/transfers/types').ReceiveTransferPayload, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  cancelTransfer(id: string, reason: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
}


