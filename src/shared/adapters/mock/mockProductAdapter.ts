import { ProductRepository } from '../types';
import { PaginatedResult, Product, ProductFilterParams } from '../../types/models';
import { MOCK_PRODUCTS } from './mockData';
import { env } from '../../config/env';

export class MockProductAdapter implements ProductRepository {
  private products: Product[] = [...MOCK_PRODUCTS];

  private async delay(): Promise<void> {
    const ms = env.VITE_MOCK_LATENCY_MS || 300;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getProducts(params?: ProductFilterParams): Promise<PaginatedResult<Product>> {
    await this.delay();

    let filtered = [...this.products];

    if (params?.search) {
      const q = params.search.toLowerCase().trim();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.includes(q) ||
          p.brand.toLowerCase().includes(q)
      );
    }

    if (params?.branchId && params.branchId !== 'all') {
      filtered = filtered.filter((p) => p.branchId === params.branchId);
    }

    if (params?.section) {
      filtered = filtered.filter((p) => p.section === params.section);
    }

    if (params?.type) {
      filtered = filtered.filter((p) => p.type === params.type);
    }

    if (params?.category) {
      filtered = filtered.filter((p) => p.category === params.category);
    }

    if (params?.brand) {
      filtered = filtered.filter((p) => p.brand === params.brand);
    }

    if (params?.sortBy) {
      const sortField = params.sortBy;
      const order = params.sortOrder === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * order;
        }
        return String(valA ?? '').localeCompare(String(valB ?? '')) * order;
      });
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

  async getProductById(id: string): Promise<Product | null> {
    await this.delay();
    const product = this.products.find((p) => p.id === id);
    return product ? { ...product } : null;
  }

  async createProduct(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<Product> {
    await this.delay();
    const now = new Date().toISOString();
    const newProduct: Product = {
      ...productData,
      id: `prod-${Date.now()}`,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };
    this.products.unshift(newProduct);
    return { ...newProduct };
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    await this.delay();
    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Product with ID ${id} not found.`);
    }

    const updated: Product = {
      ...this.products[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.products[index] = updated;
    return { ...updated };
  }

  async deleteProduct(id: string): Promise<boolean> {
    await this.delay();
    const initialLen = this.products.length;
    this.products = this.products.filter((p) => p.id !== id);
    return this.products.length < initialLen;
  }
}

