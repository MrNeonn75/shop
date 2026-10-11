import { ProductRepository } from '../types';
import { PaginatedResult, Product, ProductFilterParams } from '../../types/models';
import { httpClient } from '../../api/httpClient';

export class HttpProductAdapter implements ProductRepository {
  async getProducts(params?: ProductFilterParams): Promise<PaginatedResult<Product>> {
    const response = await httpClient.get<PaginatedResult<Product>>('/products', {
      params,
    });
    return response.data;
  }

  async getProductById(id: string): Promise<Product | null> {
    const response = await httpClient.get<Product>(`/products/${id}`);
    return response.data;
  }

  async createProduct(
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<Product> {
    const response = await httpClient.post<Product>('/products', product);
    return response.data;
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const response = await httpClient.put<Product>(`/products/${id}`, updates);
    return response.data;
  }

  async deleteProduct(id: string): Promise<boolean> {
    await httpClient.delete(`/products/${id}`);
    return true;
  }
}

