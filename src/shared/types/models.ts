import { Qapik } from '../utils/money';

export type ProductSection = 'kisi' | 'qadin' | 'usaq' | 'diger';
export type ProductType = 'geyim' | 'ayaqqabi' | 'aksesuar';
export type ProductCategory =
  | 'koynek'
  | 'salvar'
  | 'kazak'
  | 'sweatshirt'
  | 'tshirt'
  | 'bluz'
  | 'don'
  | 'dest'
  | 'jilet'
  | 'palto'
  | 'ayaqqabi'
  | 'canta_pulqabi';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  section: ProductSection;
  type: ProductType;
  category: ProductCategory;
  brand: string;
  priceQapik: Qapik;
  costPriceQapik: Qapik;
  sizes: string[];
  colors: string[];
  stockQty: number;
  branchId: string;
  isDemo: true; // Explicitly labeled as demo data
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  manager: string;
  isActive: boolean;
  isDemo: true;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  section?: ProductSection;
  type?: ProductType;
  category?: ProductCategory;
  brand?: string;
  sortBy?: keyof Product;
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
}

