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


