import { httpClient } from '../../api/httpClient';
import { DashboardRepository } from '../types';
import {
  DashboardFilterParams,
  DashboardSummaryResponse,
  SalesTrendDataPoint,
  BranchSalesDataPoint,
  SectionTypeSalesData,
  TopSellingProductsData,
  PaymentBreakdownData,
  InventoryAlertsData,
  SlowMovingStockData,
  ExpenseTrendData,
  OperationsStatusData,
  DashboardActivitiesData,
} from '../../../features/dashboard/types';

export class HttpDashboardAdapter implements DashboardRepository {
  async getSummary(params: DashboardFilterParams): Promise<DashboardSummaryResponse> {
    const response = await httpClient.get<DashboardSummaryResponse>('/dashboard/summary', {
      params,
    });
    return response.data;
  }

  async getSalesTrend(params: DashboardFilterParams): Promise<SalesTrendDataPoint[]> {
    const response = await httpClient.get<SalesTrendDataPoint[]>('/dashboard/sales-trend', {
      params,
    });
    return response.data;
  }

  async getSalesByBranch(params: DashboardFilterParams): Promise<BranchSalesDataPoint[]> {
    const response = await httpClient.get<BranchSalesDataPoint[]>('/dashboard/sales-by-branch', {
      params,
    });
    return response.data;
  }

  async getSectionTypeSales(params: DashboardFilterParams): Promise<SectionTypeSalesData> {
    const response = await httpClient.get<SectionTypeSalesData>('/dashboard/sections-types', {
      params,
    });
    return response.data;
  }

  async getTopSellingProducts(params: DashboardFilterParams): Promise<TopSellingProductsData> {
    const response = await httpClient.get<TopSellingProductsData>('/dashboard/top-products', {
      params,
    });
    return response.data;
  }

  async getPaymentBreakdown(params: DashboardFilterParams): Promise<PaymentBreakdownData> {
    const response = await httpClient.get<PaymentBreakdownData>('/dashboard/payments', {
      params,
    });
    return response.data;
  }

  async getInventoryAlerts(params: DashboardFilterParams): Promise<InventoryAlertsData> {
    const response = await httpClient.get<InventoryAlertsData>('/dashboard/inventory-alerts', {
      params,
    });
    return response.data;
  }

  async getSlowMovingStock(params: DashboardFilterParams): Promise<SlowMovingStockData> {
    const response = await httpClient.get<SlowMovingStockData>('/dashboard/slow-moving', {
      params,
    });
    return response.data;
  }

  async getExpenseTrend(params: DashboardFilterParams): Promise<ExpenseTrendData> {
    const response = await httpClient.get<ExpenseTrendData>('/dashboard/expenses', {
      params,
    });
    return response.data;
  }

  async getOperationsStatus(params: DashboardFilterParams): Promise<OperationsStatusData> {
    const response = await httpClient.get<OperationsStatusData>('/dashboard/operations', {
      params,
    });
    return response.data;
  }

  async getActivities(params: DashboardFilterParams): Promise<DashboardActivitiesData> {
    const response = await httpClient.get<DashboardActivitiesData>('/dashboard/activities', {
      params,
    });
    return response.data;
  }
}

