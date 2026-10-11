import { Qapik } from '../../../shared/utils/money';

export type ProductSection = 'kisi' | 'qadin' | 'usaq' | 'diger';
export type ProductType = 'geyim' | 'ayaqqabi' | 'aksesuar';
export type ProductStatus = 'active' | 'archived';
export type StockState = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  priceOverrideQapik?: Qapik;
  costPriceOverrideQapik?: Qapik;
  stockQty: number;
  status: ProductStatus;
}

export interface ProductSupplierLink {
  supplierId: string;
  supplierName: string;
  supplierSku: string;
  lastPurchasePriceQapik: Qapik;
  isPrimary: boolean;
}

export interface ProductImage {
  id: string;
  url: string;
  name: string;
  sizeBytes: number;
  isPrimary: boolean;
  order: number;
}

export interface PriceHistoryEntry {
  id: string;
  effectiveFrom: string; // ISO 8601 string
  priceQapik: Qapik;
  oldPriceQapik?: Qapik;
  changedBy: string;
  reason?: string;
  createdAt: string;
}

export interface CostHistoryEntry {
  id: string;
  effectiveFrom: string; // ISO 8601 string
  costPriceQapik: Qapik;
  oldCostPriceQapik?: Qapik;
  changedBy: string;
  reason?: string;
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
  country?: string;
  description?: string;
  isActive: boolean;
  productCount: number;
}

export interface ProductCategoryTaxonomy {
  id: string;
  name: string;
  slug: string;
  section: ProductSection;
  type: ProductType;
  parentId?: string | null;
  children?: ProductCategoryTaxonomy[];
  productCount: number;
  sortOrder: number;
  isActive: boolean;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  sku: string;
  barcode: string;
  section: ProductSection;
  type: ProductType;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  brandId: string;
  brandName: string;
  unit: string; // 'ədəd', 'cüt', 'dəst', 'metr', 'kq'
  taxClassId: string; // from tax settings
  minStockLevel: number;
  status: ProductStatus;
  priceQapik: Qapik;
  costPriceQapik: Qapik;
  stockQty: number;
  branchId?: string;
  hasPromotion?: boolean;
  variants: ProductVariant[];
  suppliers: ProductSupplierLink[];
  images: ProductImage[];
  priceHistory: PriceHistoryEntry[];
  costHistory: CostHistoryEntry[];
  syncStatus: 'not_configured' | 'synced' | 'pending' | 'error';
  isDemo: true;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  section?: ProductSection | 'all';
  type?: ProductType | 'all';
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  status?: ProductStatus | 'all';
  stockState?: StockState;
  minPriceQapik?: number;
  maxPriceQapik?: number;
  hasPromotion?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface BulkStatusUpdateParams {
  productIds: string[];
  status: ProductStatus;
}

export interface BulkCategoryUpdateParams {
  productIds: string[];
  categoryId: string;
  categoryName: string;
}

export interface BarcodeLabelConfig {
  sizePreset: '58x40' | '40x25' | '30x20' | 'a4_grid';
  showName: boolean;
  showBrand: boolean;
  showSize: boolean;
  showColor: boolean;
  showPrice: boolean;
  showBarcode: boolean;
  showWordmark: boolean;
  copiesPerItem: number;
  includeVariants: boolean;
}

