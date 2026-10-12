import { PermissionString } from '../../../shared/utils/permissions';

export type ReportCategory =
  | 'sales'
  | 'inventory'
  | 'purchasing'
  | 'finance'
  | 'hr'
  | 'marketing';

export interface ReportColumnDefinition {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: 'money' | 'number' | 'percent' | 'date' | 'badge' | 'text';
  isSensitive?: boolean;
  sortable?: boolean;
}

export type ReportFilterField =
  | 'dateRange'
  | 'branches'
  | 'categories'
  | 'brands'
  | 'suppliers'
  | 'cashiers'
  | 'thresholdDays'
  | 'paymentMethods';

export interface ReportFilterConfig {
  supportedFilters: ReportFilterField[];
  defaultDatePreset?: string;
  defaultThresholdDays?: number;
}

export interface ReportDefinition {
  id: string;
  code: string;
  azTitle: string;
  azDescription: string;
  category: ReportCategory;
  requiredPermissions: PermissionString[];
  isSensitive?: boolean; // Requires privileged financial/cost permissions
  filterConfig: ReportFilterConfig;
  columns: ReportColumnDefinition[];
  kpiIds: string[];
  defaultChartType?: 'bar' | 'line' | 'pie' | 'heatmap' | 'table';
  drillDownUrlPattern?: string;
  cogsMethodNotice?: boolean;
}

export interface ReportFilterState {
  datePreset?: string;
  startDate?: string;
  endDate?: string;
  branchIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  supplierIds?: string[];
  cashierIds?: string[];
  thresholdDays?: number;
  paymentMethod?: string;
}

export interface ReportKpiResult {
  id: string;
  label: string;
  formattedValue: string;
  rawValue: number;
  unit: 'azn' | 'percent' | 'qty' | 'ratio';
  changePercent?: number;
  isComputable: boolean;
  missingReason?: string;
  kpiDefId?: string;
}

export interface ReportQueryResult {
  reportId: string;
  reportTitle: string;
  generatedAt: string; // Asia/Baku timestamp e.g. "2026-03-15 14:30:00 (Asia/Baku)"
  isDemo: boolean;
  kpis: ReportKpiResult[];
  tableRows: Array<Record<string, unknown>>;
  chartData?: Array<Record<string, unknown>>;
  totalCount: number;
  activeCogsMethod?: string; // e.g. "Çəkili Orta Maya (Weighted Average)"
  missingDataReasons?: string[];
}

export type ReportDatasetId =
  | 'sales_lines'
  | 'stock_movements'
  | 'purchase_lines'
  | 'expense_lines';

export interface ReportBuilderField {
  id: string;
  label: string;
  type: 'dimension' | 'measure';
  dataType: 'string' | 'number' | 'money' | 'date';
  requiredPermission?: PermissionString; // Field-level security
  isSensitive?: boolean;
}

export interface CustomReportConfig {
  id: string;
  title: string;
  description?: string;
  dataset: ReportDatasetId;
  selectedDimensions: string[];
  selectedMeasures: string[];
  filters?: Array<{ field: string; operator: string; value: unknown }>;
  groupBy?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' };
  isShared: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ScheduledReportDelivery {
  id: string;
  reportId: string;
  reportTitle: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  channel: 'email' | 'whatsapp' | 'telegram';
  recipients: string[];
  format: 'pdf' | 'xlsx' | 'csv';
  providerStatus: string; // Strictly "Konfiqurasiya olunmayıb" until provider configured
  lastSentAt?: string;
  isActive: boolean;
}
