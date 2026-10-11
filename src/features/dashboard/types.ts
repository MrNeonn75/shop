import { Qapik } from '../../shared/utils/money';
import { ProductSection, ProductType, ProductCategory } from '../../shared/types/models';
import { KpiMetricId } from './kpiDefinitions';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export type ComparisonMode = 'none' | 'previous_period' | 'same_period_last_year';

export interface DashboardFilterParams {
  branchId: string; // 'all' or branch code/id
  datePreset: DatePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  comparisonMode: ComparisonMode;
}

export interface KpiSummaryMetric {
  id: KpiMetricId;
  value: number; // in integer Qəpik for 'azn', float for 'percent', int for 'qty', float for 'ratio'
  previousValue?: number;
  changePercentage?: number; // e.g. +14.2 or -3.5
  isCalculated: boolean;
  uncalculatedReason?: string;
  sparkline: number[];
}

export interface DashboardSummaryResponse {
  metrics: Record<KpiMetricId, KpiSummaryMetric>;
  filterContext: DashboardFilterParams;
  periodLabel: string;
  comparisonLabel: string;
  isDemo: true;
  lastUpdatedAt: string;
}

export interface SalesTrendDataPoint {
  timestamp: string;
  label: string; // e.g. "10:00", "01.10", "Həftə 40"
  currentSalesQapik: Qapik;
  previousSalesQapik?: Qapik;
  orderCount: number;
}

export interface BranchSalesDataPoint {
  branchId: string;
  branchName: string;
  branchCode: string;
  salesQapik: Qapik;
  orderCount: number;
  sharePercentage: number;
  returnRate: number;
  isDemo: true;
}

export interface SectionSalesBreakdown {
  section: ProductSection;
  labelAz: string;
  salesQapik: Qapik;
  unitsSold: number;
  sharePercentage: number;
}

export interface TypeSalesBreakdown {
  type: ProductType;
  labelAz: string;
  salesQapik: Qapik;
  unitsSold: number;
  sharePercentage: number;
}

export interface SectionTypeSalesData {
  sections: SectionSalesBreakdown[];
  types: TypeSalesBreakdown[];
  totalSalesQapik: Qapik;
  isDemo: true;
}

export interface TopProductItem {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  category: ProductCategory;
  categoryNameAz: string;
  section: ProductSection;
  unitsSold: number;
  revenueQapik: Qapik;
  sharePercentage: number;
}

export interface TopCategoryItem {
  category: ProductCategory;
  categoryNameAz: string;
  unitsSold: number;
  revenueQapik: Qapik;
  sharePercentage: number;
}

export interface TopSellingProductsData {
  products: TopProductItem[];
  categories: TopCategoryItem[];
  isDemo: true;
}

export type PaymentMethodType = 'cash' | 'card' | 'other' | 'split';

export interface PaymentBreakdownItem {
  method: PaymentMethodType;
  labelAz: string;
  amountQapik: Qapik;
  transactionCount: number;
  percentage: number;
}

export interface PaymentBreakdownData {
  items: PaymentBreakdownItem[];
  totalAmountQapik: Qapik;
  totalTransactions: number;
  isDemo: true;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  branchId: string;
  branchName: string;
  currentStock: number;
  minThreshold: number;
  status: 'critical' | 'low'; // critical: 0, low: <= minThreshold
  costPriceQapik: Qapik;
}

export interface InventoryAlertsData {
  lowStockItems: LowStockItem[];
  criticalCount: number;
  lowStockCount: number;
  totalAlertCount: number;
  isDemo: true;
}

export interface SlowMovingItem {
  id: string;
  name: string;
  sku: string;
  categoryNameAz: string;
  daysWithoutSale: number;
  stockQty: number;
  tiedUpCapitalQapik: Qapik;
  branchName: string;
}

export interface SlowMovingStockData {
  items: SlowMovingItem[];
  totalTiedUpCapitalQapik: Qapik;
  itemCount: number;
  isDemo: true;
}

export interface ExpenseCategoryBreakdown {
  category: string;
  categoryNameAz: string;
  amountQapik: Qapik;
  percentage: number;
}

export interface ExpenseTrendData {
  categories: ExpenseCategoryBreakdown[];
  totalExpenseQapik: Qapik;
  timeline: { label: string; amountQapik: Qapik }[];
  isDemo: true;
}

export interface CashRegisterDetail {
  id: string;
  registerNumber: string;
  branchName: string;
  cashierName: string;
  status: 'open' | 'closed';
  expectedCashQapik: Qapik;
  actualCashQapik: Qapik;
  discrepancyQapik: Qapik; // actual - expected
}

export interface OperationsStatusData {
  openPurchaseOrdersCount: number;
  openPurchaseOrdersAmountQapik: Qapik;
  inTransitTransfersCount: number;
  inTransitUnitsCount: number;
  openRegistersCount: number;
  totalRegistersCount: number;
  totalCashDiscrepancyQapik: Qapik;
  registers: CashRegisterDetail[];
  isDemo: true;
}

export type ActivityType =
  | 'large_refund'
  | 'cancellation'
  | 'stock_adjustment'
  | 'high_discount';

export interface DashboardActivityItem {
  id: string;
  type: ActivityType;
  typeLabelAz: string;
  title: string;
  description: string;
  amountQapik?: Qapik;
  branchName: string;
  userName: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'danger';
}

export interface DashboardActivitiesData {
  activities: DashboardActivityItem[];
  isDemo: true;
}

