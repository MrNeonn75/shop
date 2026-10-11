import { CatalogRepository } from '../types';
import {
  CatalogProduct,
  CatalogFilterParams,
  ProductCategoryTaxonomy,
  Brand,
  ProductStatus,
} from '../../../features/catalog/types/catalog';
import { PaginatedResult } from '../../types/models';
import { env } from '../../config/env';

export class HttpCatalogAdapter implements CatalogRepository {
  private baseUrl = env.VITE_API_BASE_URL || '/api/v1';

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP xətası: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async getProducts(params?: CatalogFilterParams): Promise<PaginatedResult<CatalogProduct>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== 'all') {
          searchParams.append(key, String(value));
        }
      });
    }
    return this.request<PaginatedResult<CatalogProduct>>(`/catalog/products?${searchParams.toString()}`);
  }

  async getProductById(id: string): Promise<CatalogProduct | null> {
    return this.request<CatalogProduct>(`/catalog/products/${id}`);
  }

  async createProduct(
    product: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<CatalogProduct> {
    return this.request<CatalogProduct>('/catalog/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  }

  async updateProduct(id: string, updates: Partial<CatalogProduct>): Promise<CatalogProduct> {
    return this.request<CatalogProduct>(`/catalog/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteProduct(id: string): Promise<boolean> {
    await this.request<{ success: boolean }>(`/catalog/products/${id}`, {
      method: 'DELETE',
    });
    return true;
  }

  async bulkUpdateStatus(productIds: string[], status: ProductStatus): Promise<number> {
    const res = await this.request<{ count: number }>('/catalog/products/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ productIds, status }),
    });
    return res.count;
  }

  async bulkUpdateCategory(
    productIds: string[],
    categoryId: string,
    categoryName: string
  ): Promise<number> {
    const res = await this.request<{ count: number }>('/catalog/products/bulk-category', {
      method: 'POST',
      body: JSON.stringify({ productIds, categoryId, categoryName }),
    });
    return res.count;
  }

  async checkIdentifierUniqueness(
    sku: string,
    barcode: string,
    excludeProductId?: string
  ): Promise<{ skuAvailable: boolean; barcodeAvailable: boolean }> {
    return this.request<{ skuAvailable: boolean; barcodeAvailable: boolean }>(
      '/catalog/products/check-uniqueness',
      {
        method: 'POST',
        body: JSON.stringify({ sku, barcode, excludeProductId }),
      }
    );
  }

  async getCategories(): Promise<ProductCategoryTaxonomy[]> {
    return this.request<ProductCategoryTaxonomy[]>('/catalog/categories');
  }

  async saveCategory(category: Partial<ProductCategoryTaxonomy>): Promise<ProductCategoryTaxonomy> {
    return this.request<ProductCategoryTaxonomy>('/catalog/categories', {
      method: category.id ? 'PUT' : 'POST',
      body: JSON.stringify(category),
    });
  }

  async deleteCategory(id: string, reassignToId?: string): Promise<boolean> {
    await this.request<{ success: boolean }>(`/catalog/categories/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reassignToId }),
    });
    return true;
  }

  async getBrands(): Promise<Brand[]> {
    return this.request<Brand[]>('/catalog/brands');
  }

  async saveBrand(brand: Partial<Brand>): Promise<Brand> {
    return this.request<Brand>('/catalog/brands', {
      method: brand.id ? 'PUT' : 'POST',
      body: JSON.stringify(brand),
    });
  }

  async deleteBrand(id: string): Promise<boolean> {
    await this.request<{ success: boolean }>(`/catalog/brands/${id}`, {
      method: 'DELETE',
    });
    return true;
  }

  async importProducts(
    products: Partial<CatalogProduct>[]
  ): Promise<{ importedCount: number; errors: Array<{ row: number; reason: string }> }> {
    return this.request<{ importedCount: number; errors: Array<{ row: number; reason: string }> }>(
      '/catalog/products/import',
      {
        method: 'POST',
        body: JSON.stringify({ products }),
      }
    );
  }
}
