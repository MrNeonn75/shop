import { CatalogRepository } from '../types';
import {
  CatalogProduct,
  CatalogFilterParams,
  ProductCategoryTaxonomy,
  Brand,
  ProductStatus,
  ProductVariant,
  ProductSupplierLink,
} from '../../../features/catalog/types/catalog';
import { PaginatedResult } from '../../types/models';
import {
  SEEDED_CATALOG_PRODUCTS,
  SEEDED_CATEGORIES,
  SEEDED_BRANDS,
} from '../../../features/catalog/data/taxonomyData';
import { env } from '../../config/env';
import { toQapik } from '../../utils/money';

export class MockCatalogAdapter implements CatalogRepository {
  private products: CatalogProduct[] = JSON.parse(JSON.stringify(SEEDED_CATALOG_PRODUCTS));
  private categories: ProductCategoryTaxonomy[] = JSON.parse(JSON.stringify(SEEDED_CATEGORIES));
  private brands: Brand[] = JSON.parse(JSON.stringify(SEEDED_BRANDS));

  private async delay(): Promise<void> {
    const ms = env.VITE_MOCK_LATENCY_MS || 250;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getProducts(params?: CatalogFilterParams): Promise<PaginatedResult<CatalogProduct>> {
    await this.delay();

    let filtered = [...this.products];

    // Search by name, SKU, or barcode (checks base product and all variants)
    if (params?.search) {
      const q = params.search.toLowerCase().trim();
      filtered = filtered.filter((p) => {
        const matchesBase =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.brandName.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q);

        const matchesVariant = p.variants?.some(
          (v: ProductVariant) =>
            v.sku.toLowerCase().includes(q) ||
            v.barcode.toLowerCase().includes(q) ||
            v.size.toLowerCase().includes(q) ||
            v.color.toLowerCase().includes(q)
        );

        return matchesBase || matchesVariant;
      });
    }

    if (params?.branchId && params.branchId !== 'all') {
      filtered = filtered.filter((p) => !p.branchId || p.branchId === params.branchId);
    }

    if (params?.section && params.section !== 'all') {
      filtered = filtered.filter((p) => p.section === params.section);
    }

    if (params?.type && params.type !== 'all') {
      filtered = filtered.filter((p) => p.type === params.type);
    }

    if (params?.categoryId && params.categoryId !== 'all') {
      filtered = filtered.filter((p) => p.categoryId === params.categoryId);
    }

    if (params?.brandId && params.brandId !== 'all') {
      filtered = filtered.filter((p) => p.brandId === params.brandId);
    }

    if (params?.supplierId && params.supplierId !== 'all') {
      filtered = filtered.filter((p) =>
        p.suppliers?.some((s: ProductSupplierLink) => s.supplierId === params.supplierId)
      );
    }

    if (params?.status && params.status !== 'all') {
      filtered = filtered.filter((p) => p.status === params.status);
    }

    if (params?.stockState && params.stockState !== 'all') {
      if (params.stockState === 'in_stock') {
        filtered = filtered.filter((p) => p.stockQty > (p.minStockLevel || 5));
      } else if (params.stockState === 'low_stock') {
        filtered = filtered.filter(
          (p) => p.stockQty > 0 && p.stockQty <= (p.minStockLevel || 5)
        );
      } else if (params.stockState === 'out_of_stock') {
        filtered = filtered.filter((p) => p.stockQty === 0);
      }
    }

    if (typeof params?.minPriceQapik === 'number') {
      filtered = filtered.filter((p) => p.priceQapik >= params.minPriceQapik!);
    }

    if (typeof params?.maxPriceQapik === 'number') {
      filtered = filtered.filter((p) => p.priceQapik <= params.maxPriceQapik!);
    }

    if (typeof params?.hasPromotion === 'boolean') {
      filtered = filtered.filter((p) => !!p.hasPromotion === params.hasPromotion);
    }

    // Sorting
    if (params?.sortBy) {
      const field = params.sortBy as keyof CatalogProduct;
      const order = params.sortOrder === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * order;
        }
        return String(valA ?? '').localeCompare(String(valB ?? '')) * order;
      });
    } else {
      // Default sort by updatedAt desc
      filtered.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }

    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.max(1, params?.pageSize || 10);
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const items = filtered.slice(startIndex, startIndex + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async getProductById(id: string): Promise<CatalogProduct | null> {
    await this.delay();
    const product = this.products.find((p) => p.id === id);
    return product ? JSON.parse(JSON.stringify(product)) : null;
  }

  async createProduct(
    productData: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<CatalogProduct> {
    await this.delay();

    // Check SKU and barcode conflicts
    const conflict = await this.checkIdentifierUniqueness(productData.sku, productData.barcode);
    if (!conflict.skuAvailable) {
      throw new Error(`SKU "${productData.sku}" artıq başqa məhsulda qeydiyyatdadır.`);
    }
    if (!conflict.barcodeAvailable) {
      throw new Error(`Barkod "${productData.barcode}" artıq başqa məhsulda qeydiyyatdadır.`);
    }

    const now = new Date().toISOString();
    const newProduct: CatalogProduct = {
      ...productData,
      id: `prod-${Date.now()}`,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };

    this.products.unshift(newProduct);
    return JSON.parse(JSON.stringify(newProduct));
  }

  async updateProduct(id: string, updates: Partial<CatalogProduct>): Promise<CatalogProduct> {
    await this.delay();
    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Məhsul ID ${id} tapılmadı.`);
    }

    // If updating SKU or barcode, verify uniqueness excluding this product
    if (updates.sku || updates.barcode) {
      const conflict = await this.checkIdentifierUniqueness(
        updates.sku || this.products[index].sku,
        updates.barcode || this.products[index].barcode,
        id
      );
      if (updates.sku && !conflict.skuAvailable) {
        throw new Error(`SKU "${updates.sku}" artıq başqa məhsulda qeydiyyatdadır.`);
      }
      if (updates.barcode && !conflict.barcodeAvailable) {
        throw new Error(`Barkod "${updates.barcode}" artıq başqa məhsulda qeydiyyatdadır.`);
      }
    }

    const updated: CatalogProduct = {
      ...this.products[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.products[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  async deleteProduct(id: string): Promise<boolean> {
    await this.delay();
    const len = this.products.length;
    this.products = this.products.filter((p) => p.id !== id);
    return this.products.length < len;
  }

  async bulkUpdateStatus(productIds: string[], status: ProductStatus): Promise<number> {
    await this.delay();
    let count = 0;
    this.products = this.products.map((p) => {
      if (productIds.includes(p.id)) {
        count++;
        return { ...p, status, updatedAt: new Date().toISOString() };
      }
      return p;
    });
    return count;
  }

  async bulkUpdateCategory(
    productIds: string[],
    categoryId: string,
    categoryName: string
  ): Promise<number> {
    await this.delay();
    let count = 0;
    this.products = this.products.map((p) => {
      if (productIds.includes(p.id)) {
        count++;
        return { ...p, categoryId, categoryName, updatedAt: new Date().toISOString() };
      }
      return p;
    });
    return count;
  }

  async checkIdentifierUniqueness(
    sku: string,
    barcode: string,
    excludeProductId?: string
  ): Promise<{ skuAvailable: boolean; barcodeAvailable: boolean }> {
    const cleanSku = sku.trim().toUpperCase();
    const cleanBarcode = barcode.trim();

    let skuAvailable = true;
    let barcodeAvailable = true;

    for (const p of this.products) {
      if (excludeProductId && p.id === excludeProductId) continue;

      if (p.sku.trim().toUpperCase() === cleanSku) {
        skuAvailable = false;
      }
      if (p.barcode.trim() === cleanBarcode) {
        barcodeAvailable = false;
      }

      // Also check variants
      p.variants?.forEach((v: ProductVariant) => {
        if (v.sku.trim().toUpperCase() === cleanSku) {
          skuAvailable = false;
        }
        if (v.barcode.trim() === cleanBarcode) {
          barcodeAvailable = false;
        }
      });

      if (!skuAvailable && !barcodeAvailable) break;
    }

    return { skuAvailable, barcodeAvailable };
  }

  async getCategories(): Promise<ProductCategoryTaxonomy[]> {
    await this.delay();
    return JSON.parse(JSON.stringify(this.categories));
  }

  async saveCategory(
    categoryData: Partial<ProductCategoryTaxonomy>
  ): Promise<ProductCategoryTaxonomy> {
    await this.delay();
    if (categoryData.id) {
      const idx = this.categories.findIndex((c) => c.id === categoryData.id);
      if (idx !== -1) {
        this.categories[idx] = { ...this.categories[idx], ...categoryData };
        return JSON.parse(JSON.stringify(this.categories[idx]));
      }
    }
    const newCat: ProductCategoryTaxonomy = {
      id: `cat-${Date.now()}`,
      name: categoryData.name || 'Yeni Kateqoriya',
      slug: categoryData.slug || `cat-${Date.now()}`,
      section: categoryData.section || 'kisi',
      type: categoryData.type || 'geyim',
      parentId: categoryData.parentId || null,
      productCount: 0,
      sortOrder: this.categories.length + 1,
      isActive: true,
      ...categoryData,
    };
    this.categories.push(newCat);
    return JSON.parse(JSON.stringify(newCat));
  }

  async deleteCategory(id: string, reassignToId?: string): Promise<boolean> {
    await this.delay();
    // If linked products exist and reassignToId is provided, reassign them
    if (reassignToId) {
      const targetCat = this.categories.find((c) => c.id === reassignToId);
      if (targetCat) {
        this.products = this.products.map((p) => {
          if (p.categoryId === id) {
            return { ...p, categoryId: targetCat.id, categoryName: targetCat.name };
          }
          return p;
        });
      }
    } else {
      // Check if products still linked
      const hasLinked = this.products.some((p) => p.categoryId === id);
      if (hasLinked) {
        throw new Error(
          'Bu kateqoriyaya bağlı məhsullar mövcuddur. Zəhmət olmasa, əvvəlcə məhsulları başqa kateqoriyaya köçürün.'
        );
      }
    }

    this.categories = this.categories.filter((c) => c.id !== id);
    return true;
  }

  async getBrands(): Promise<Brand[]> {
    await this.delay();
    return JSON.parse(JSON.stringify(this.brands));
  }

  async saveBrand(brandData: Partial<Brand>): Promise<Brand> {
    await this.delay();
    if (brandData.id) {
      const idx = this.brands.findIndex((b) => b.id === brandData.id);
      if (idx !== -1) {
        this.brands[idx] = { ...this.brands[idx], ...brandData };
        return JSON.parse(JSON.stringify(this.brands[idx]));
      }
    }
    const newBrand: Brand = {
      id: `brand-${Date.now()}`,
      name: brandData.name || 'Yeni Brend',
      code: brandData.code || 'BR',
      country: brandData.country || 'Azərbaycan',
      description: brandData.description || '',
      isActive: true,
      productCount: 0,
      ...brandData,
    };
    this.brands.push(newBrand);
    return JSON.parse(JSON.stringify(newBrand));
  }

  async deleteBrand(id: string): Promise<boolean> {
    await this.delay();
    const hasLinked = this.products.some((p) => p.brandId === id);
    if (hasLinked) {
      throw new Error(
        'Bu brendə bağlı məhsullar mövcuddur. Silmək üçün əvvəlcə məhsulların brendini dəyişin.'
      );
    }
    this.brands = this.brands.filter((b) => b.id !== id);
    return true;
  }

  async importProducts(
    productsToImport: Partial<CatalogProduct>[]
  ): Promise<{ importedCount: number; errors: Array<{ row: number; reason: string }> }> {
    await this.delay();
    let importedCount = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    const existingSkus = new Set<string>();
    const existingBarcodes = new Set<string>();

    this.products.forEach((p) => {
      existingSkus.add(p.sku.toUpperCase());
      existingBarcodes.add(p.barcode);
      p.variants?.forEach((v: ProductVariant) => {
        existingSkus.add(v.sku.toUpperCase());
        existingBarcodes.add(v.barcode);
      });
    });

    productsToImport.forEach((item, index) => {
      const rowNum = index + 1;
      if (!item.name || item.name.length < 3) {
        errors.push({ row: rowNum, reason: 'Məhsul adı çatışmır və ya çox qısadır.' });
        return;
      }
      if (!item.sku) {
        errors.push({ row: rowNum, reason: 'SKU kodu tələb olunur.' });
        return;
      }
      if (existingSkus.has(item.sku.toUpperCase())) {
        errors.push({ row: rowNum, reason: `SKU "${item.sku}" artıq mövcuddur.` });
        return;
      }
      if (!item.priceQapik || item.priceQapik <= 0) {
        errors.push({ row: rowNum, reason: 'Satış qiyməti 0-dan böyük olmalıdır.' });
        return;
      }

      // Valid item: create
      const now = new Date().toISOString();
      const created: CatalogProduct = {
        id: `prod-imp-${Date.now()}-${rowNum}`,
        name: item.name,
        description: item.description || '',
        sku: item.sku,
        barcode: item.barcode || `476000${Math.floor(1000000 + Math.random() * 9000000)}`,
        section: item.section || 'kisi',
        type: item.type || 'geyim',
        categoryId: item.categoryId || 'cat-koynek',
        categoryName: item.categoryName || 'Köynək',
        brandId: item.brandId || 'brand-zara',
        brandName: item.brandName || 'Zara',
        unit: item.unit || 'ədəd',
        taxClassId: item.taxClassId || 'tax-standard',
        minStockLevel: item.minStockLevel || 5,
        status: item.status || 'active',
        priceQapik: item.priceQapik,
        costPriceQapik: item.costPriceQapik || toQapik(0),
        stockQty: 0, // Opening balances are deferred to Milestone F5 (Inventory module)
        variants: item.variants || [],
        suppliers: item.suppliers || [],
        images: item.images || [],
        priceHistory: [
          {
            id: `ph-imp-${rowNum}`,
            effectiveFrom: now,
            priceQapik: item.priceQapik,
            changedBy: 'Kütləvi İdxal (Import)',
            createdAt: now,
          },
        ],
        costHistory: [],
        syncStatus: 'not_configured',
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      };

      existingSkus.add(created.sku.toUpperCase());
      existingBarcodes.add(created.barcode);
      this.products.unshift(created);
      importedCount++;
    });

    return { importedCount, errors };
  }
}
