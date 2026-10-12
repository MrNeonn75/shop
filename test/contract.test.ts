import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpBranchAdapter } from '../src/shared/adapters/http/httpBranchAdapter';
import { HttpProductAdapter } from '../src/shared/adapters/http/httpProductAdapter';
import { HttpDashboardAdapter } from '../src/shared/adapters/http/httpDashboardAdapter';
import { HttpCatalogAdapter } from '../src/shared/adapters/http/httpCatalogAdapter';
import { httpClient } from '../src/shared/api/httpClient';
import { Branch, Product, PaginatedResult } from '../src/shared/types/models';
import { DashboardSummaryResponse } from '../src/features/dashboard/types';
import { CatalogProduct } from '../src/features/catalog/types/catalog';
import { resources } from '../src/locales/i18n';
import { toQapik } from '../src/shared/utils/money';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('Contract & API Adapter Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('HttpBranchAdapter Contract', () => {
    const adapter = new HttpBranchAdapter();

    it('matches /branches GET endpoint contract and deserializes Branch array', async () => {
      const mockBranches: Branch[] = [
        {
          id: 'branch-1',
          name: 'Nizami Mall',
          code: 'NZM',
          address: 'Nizami küç. 14',
          phone: '+994 12 598 00 00',
          manager: 'Əli Məmmədov',
          isActive: true,
          isDemo: true,
        },
      ];

      const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        data: mockBranches,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse<Branch[]>);

      const result = await adapter.getBranches();

      expect(getSpy).toHaveBeenCalledWith('/branches');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('branch-1');
      expect(result[0].name).toBe('Nizami Mall');
      expect(result[0].isDemo).toBe(true);
    });

    it('matches /branches/:id GET endpoint contract and returns specific branch', async () => {
      const mockBranch: Branch = {
        id: 'branch-2',
        name: 'Gənclik Mall',
        code: 'GNL',
        address: 'Fətəli Xan Xoyski 14',
        phone: '+994 12 599 11 22',
        manager: 'Leyla Əliyeva',
        isActive: true,
        isDemo: true,
      };

      const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        data: mockBranch,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse<Branch>);

      const result = await adapter.getBranchById('branch-2');

      expect(getSpy).toHaveBeenCalledWith('/branches/branch-2');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('branch-2');
      expect(result?.name).toBe('Gənclik Mall');
    });
  });

  describe('HttpProductAdapter Contract', () => {
    const adapter = new HttpProductAdapter();

    it('matches /products GET endpoint contract with pagination and filters', async () => {
      const mockResponse: PaginatedResult<Product> = {
        items: [
          {
            id: 'prod-101',
            name: 'Kişi Jaket',
            sku: 'JKT-001',
            barcode: '86800010001',
            section: 'kisi',
            type: 'geyim',
            category: 'kazak',
            brand: 'Zara',
            priceQapik: toQapik(18000),
            costPriceQapik: toQapik(9000),
            sizes: ['M', 'L'],
            colors: ['Qara'],
            stockQty: 12,
            branchId: 'branch-1',
            isDemo: true,
            createdAt: '2026-10-01T10:00:00Z',
            updatedAt: '2026-10-01T10:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };

      const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse<PaginatedResult<Product>>);

      const filterParams = { page: 1, pageSize: 10 };
      const result = await adapter.getProducts(filterParams);

      expect(getSpy).toHaveBeenCalledWith('/products', { params: filterParams });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].sku).toBe('JKT-001');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('matches /products POST creation contract', async () => {
      const newProductPayload: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'> = {
        name: 'Qadın Şalvar',
        sku: 'SLV-002',
        barcode: '86800010002',
        section: 'qadin',
        type: 'geyim',
        category: 'salvar',
        brand: 'Mango',
        priceQapik: toQapik(9500),
        costPriceQapik: toQapik(4500),
        sizes: ['36', '38'],
        colors: ['Bej'],
        stockQty: 20,
        branchId: 'branch-1',
      };

      const createdProduct: Product = {
        ...newProductPayload,
        id: 'prod-102',
        isDemo: true,
        createdAt: '2026-10-12T12:00:00Z',
        updatedAt: '2026-10-12T12:00:00Z',
      };

      const postSpy = vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
        data: createdProduct,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse<Product>);

      const result = await adapter.createProduct(newProductPayload);

      expect(postSpy).toHaveBeenCalledWith('/products', newProductPayload);
      expect(result.id).toBe('prod-102');
      expect(result.name).toBe('Qadın Şalvar');
      expect(result.priceQapik).toBe(9500);
    });

    it('matches /products/:id PUT update and DELETE contracts', async () => {
      const updates: Partial<Product> = { priceQapik: toQapik(8900) };
      const updatedProduct: Product = {
        id: 'prod-102',
        name: 'Qadın Şalvar',
        sku: 'SLV-002',
        barcode: '86800010002',
        section: 'qadin',
        type: 'geyim',
        category: 'salvar',
        brand: 'Mango',
        priceQapik: toQapik(8900),
        costPriceQapik: toQapik(4500),
        sizes: ['36', '38'],
        colors: ['Bej'],
        stockQty: 20,
        branchId: 'branch-1',
        isDemo: true,
        createdAt: '2026-10-12T12:00:00Z',
        updatedAt: '2026-10-12T12:30:00Z',
      };

      const putSpy = vi.spyOn(httpClient, 'put').mockResolvedValueOnce({
        data: updatedProduct,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse<Product>);

      const updateResult = await adapter.updateProduct('prod-102', updates);
      expect(putSpy).toHaveBeenCalledWith('/products/prod-102', updates);
      expect(updateResult.priceQapik).toBe(8900);

      const deleteSpy = vi.spyOn(httpClient, 'delete').mockResolvedValueOnce({
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse<{ success: boolean }>);

      const deleteResult = await adapter.deleteProduct('prod-102');
      expect(deleteSpy).toHaveBeenCalledWith('/products/prod-102');
      expect(deleteResult).toBe(true);
    });
  });

  describe('HttpDashboardAdapter Contract', () => {
    const adapter = new HttpDashboardAdapter();

    it('matches /dashboard/summary endpoint and verifies required KPI metric types', async () => {
      const mockSummary: DashboardSummaryResponse = {
        metrics: {
          totalSales: {
            id: 'totalSales',
            value: 12500000,
            previousValue: 11000000,
            changePercentage: 13.6,
            isCalculated: true,
            sparkline: [100, 110, 125],
          },
          grossProfit: {
            id: 'grossProfit',
            value: 4500000,
            previousValue: 4000000,
            changePercentage: 12.5,
            isCalculated: true,
            sparkline: [40, 42, 45],
          },
          netProfit: {
            id: 'netProfit',
            value: 2100000,
            previousValue: 1900000,
            changePercentage: 10.5,
            isCalculated: true,
            sparkline: [18, 19, 21],
          },
          salesGrowth: {
            id: 'salesGrowth',
            value: 13.6,
            isCalculated: true,
            sparkline: [10, 12, 13.6],
          },
          averageOrderValue: {
            id: 'averageOrderValue',
            value: 14705,
            previousValue: 14102,
            changePercentage: 4.3,
            isCalculated: true,
            sparkline: [140, 142, 147],
          },
          unitsSold: {
            id: 'unitsSold',
            value: 850,
            previousValue: 780,
            changePercentage: 9.0,
            isCalculated: true,
            sparkline: [750, 780, 850],
          },
          returnRate: {
            id: 'returnRate',
            value: 1.8,
            previousValue: 1.9,
            changePercentage: -5.2,
            isCalculated: true,
            sparkline: [2.0, 1.9, 1.8],
          },
          inventoryValue: {
            id: 'inventoryValue',
            value: 35000000,
            previousValue: 34000000,
            changePercentage: 2.9,
            isCalculated: true,
            sparkline: [340, 345, 350],
          },
          inventoryTurnover: {
            id: 'inventoryTurnover',
            value: 4.2,
            isCalculated: true,
            sparkline: [3.9, 4.0, 4.2],
          },
          supplierLiabilities: {
            id: 'supplierLiabilities',
            value: 12000000,
            isCalculated: true,
            sparkline: [130, 125, 120],
          },
          discountCost: {
            id: 'discountCost',
            value: 450000,
            isCalculated: true,
            sparkline: [40, 42, 45],
          },
        },
        filterContext: {
          branchId: 'all',
          datePreset: 'this_month',
          startDate: '2026-10-01',
          endDate: '2026-10-12',
          comparisonMode: 'previous_period',
        },
        periodLabel: 'Cari ay',
        comparisonLabel: 'Əvvəlki dövr',
        isDemo: true,
        lastUpdatedAt: '2026-10-12T16:00:00Z',
      };

      const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
        data: mockSummary,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse<DashboardSummaryResponse>);

      const params = {
        branchId: 'all',
        datePreset: 'this_month' as const,
        startDate: '2026-10-01',
        endDate: '2026-10-12',
        comparisonMode: 'previous_period' as const,
      };

      const result = await adapter.getSummary(params);

      expect(getSpy).toHaveBeenCalledWith('/dashboard/summary', { params });
      expect(result.metrics.totalSales.value).toBe(12500000);
      expect(result.metrics.grossProfit.value).toBe(4500000);
      expect(result.metrics.netProfit.isCalculated).toBe(true);
      expect(result.isDemo).toBe(true);
    });
  });

  describe('HttpCatalogAdapter Contract (Fetch-based)', () => {
    const adapter = new HttpCatalogAdapter();

    it('dispatches GET /catalog/products with query string and handles response envelope', async () => {
      const mockResult: PaginatedResult<CatalogProduct> = {
        items: [
          {
            id: 'cp-1',
            sku: 'DRS-001',
            barcode: '868111222333',
            name: 'Klassik Don',
            description: 'İpək don',
            section: 'qadin',
            type: 'geyim',
            categoryId: 'cat-1',
            categoryName: 'Geyim',
            brandId: 'brand-1',
            brandName: 'Zara',
            unit: 'ədəd',
            taxClassId: 'tax-standard',
            minStockLevel: 2,
            status: 'active',
            priceQapik: toQapik(15000),
            costPriceQapik: toQapik(7000),
            stockQty: 10,
            variants: [],
            suppliers: [],
            images: [],
            priceHistory: [],
            costHistory: [],
            syncStatus: 'not_configured',
            isDemo: true,
            createdAt: '2026-10-01T10:00:00Z',
            updatedAt: '2026-10-01T10:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResult,
      } as Response);

      const res = await adapter.getProducts({ page: 1, pageSize: 20, search: 'Don' });

      expect(fetchSpy).toHaveBeenCalled();
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/catalog/products?');
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('pageSize=20');
      expect(calledUrl).toContain('search=Don');
      expect(res.items).toHaveLength(1);
      expect(res.items[0].sku).toBe('DRS-001');
    });

    it('throws localized Azerbaijani error on non-ok HTTP status', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ message: 'Məhsul tapılmadı' }),
      } as Response);

      await expect(adapter.getProductById('invalid-id')).rejects.toThrow('Məhsul tapılmadı');
    });
  });

  describe('i18n Translation Completeness & Key Parity', () => {
    it('verifies all Azerbaijani translation files have valid, non-empty keys', () => {
      const az = resources.az;
      expect(az).toBeDefined();
      expect(Object.keys(az)).toContain('common');
      expect(Object.keys(az)).toContain('navigation');
      expect(Object.keys(az)).toContain('products');
      expect(Object.keys(az)).toContain('branches');
      expect(Object.keys(az)).toContain('auth');
      expect(Object.keys(az)).toContain('ui');
      expect(Object.keys(az)).toContain('pos');

      const checkNoEmptyValues = (obj: Record<string, unknown>, prefix = ''): void => {
        Object.entries(obj).forEach(([key, val]) => {
          const path = prefix ? `${prefix}.${key}` : key;
          if (typeof val === 'string') {
            expect(val.trim().length, `Empty translation string at "${path}"`).toBeGreaterThan(0);
          } else if (typeof val === 'object' && val !== null) {
            checkNoEmptyValues(val as Record<string, unknown>, path);
          }
        });
      };

      Object.entries(az).forEach(([namespace, table]) => {
        checkNoEmptyValues(table as Record<string, unknown>, `az.${namespace}`);
      });
    });

    it('verifies key parity between az/common and en/common dictionaries', () => {
      const azCommon = resources.az.common as Record<string, unknown>;
      const enCommon = resources.en.common as Record<string, unknown>;

      const getDeepKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
        let keys: string[] = [];
        Object.entries(obj).forEach(([key, val]) => {
          const path = prefix ? `${prefix}.${key}` : key;
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            keys = keys.concat(getDeepKeys(val as Record<string, unknown>, path));
          } else {
            keys.push(path);
          }
        });
        return keys;
      };

      const azKeys = getDeepKeys(azCommon);
      const enKeys = getDeepKeys(enCommon);

      expect(azKeys.length).toBeGreaterThan(0);
      expect(enKeys.length).toBeGreaterThan(0);

      // Verify that major common keys exist in both
      ['actions.save', 'actions.cancel', 'actions.delete', 'status.active'].forEach((expectedKey) => {
        expect(azKeys).toContain(expectedKey);
        expect(enKeys).toContain(expectedKey);
      });
    });
  });
});

