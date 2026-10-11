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
import {
  generateMockDashboardData,
  generateSalesTrendPoints,
  generateBranchSalesPoints,
  generateSectionTypeSales,
  generateTopSellingProducts,
  generatePaymentBreakdown,
  generateInventoryAlerts,
  generateSlowMovingStock,
  generateExpenseTrend,
  generateOperationsStatus,
  generateDashboardActivities,
} from './mockDashboardGenerator';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T, ms = SIMULATED_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export class MockDashboardAdapter implements DashboardRepository {
  async getSummary(params: DashboardFilterParams): Promise<DashboardSummaryResponse> {
    const { summaryResponse } = generateMockDashboardData(params);
    return delay(summaryResponse);
  }

  async getSalesTrend(params: DashboardFilterParams): Promise<SalesTrendDataPoint[]> {
    const trend = generateSalesTrendPoints(params);
    return delay(trend);
  }

  async getSalesByBranch(params: DashboardFilterParams): Promise<BranchSalesDataPoint[]> {
    const branchSales = generateBranchSalesPoints(params);
    return delay(branchSales);
  }

  async getSectionTypeSales(params: DashboardFilterParams): Promise<SectionTypeSalesData> {
    const sectionType = generateSectionTypeSales(params);
    return delay(sectionType);
  }

  async getTopSellingProducts(params: DashboardFilterParams): Promise<TopSellingProductsData> {
    const topProducts = generateTopSellingProducts(params);
    return delay(topProducts);
  }

  async getPaymentBreakdown(params: DashboardFilterParams): Promise<PaymentBreakdownData> {
    const payments = generatePaymentBreakdown(params);
    return delay(payments);
  }

  async getInventoryAlerts(params: DashboardFilterParams): Promise<InventoryAlertsData> {
    const alerts = generateInventoryAlerts(params);
    return delay(alerts);
  }

  async getSlowMovingStock(params: DashboardFilterParams): Promise<SlowMovingStockData> {
    const deadStock = generateSlowMovingStock(params);
    return delay(deadStock);
  }

  async getExpenseTrend(params: DashboardFilterParams): Promise<ExpenseTrendData> {
    const expenses = generateExpenseTrend(params);
    return delay(expenses);
  }

  async getOperationsStatus(params: DashboardFilterParams): Promise<OperationsStatusData> {
    const ops = generateOperationsStatus(params);
    return delay(ops);
  }

  async getActivities(params: DashboardFilterParams): Promise<DashboardActivitiesData> {
    const activities = generateDashboardActivities(params);
    return delay(activities);
  }
}

