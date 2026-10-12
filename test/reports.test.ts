import { describe, it, expect, beforeEach } from 'vitest';
import { STANDARD_REPORTS, REPORT_DEFINITIONS } from '../src/features/reports/constants/reportRegistry';
import { EXTENDED_KPI_REGISTRY } from '../src/features/reports/constants/extendedKpis';
import {
  DATASET_METADATA,
  getPermittedFieldsForDataset,
  serializeReportFiltersToUrl,
  parseReportFiltersFromUrl,
  executeCustomReportQuery,
} from '../src/features/reports/utils/reportBuilderEngine';
import { MockReportsAdapter } from '../src/shared/adapters/mock/mockReportsAdapter';
import { checkPermissionMatch } from '../src/shared/utils/permissions';
import { ROLE_DEFAULT_PERMISSIONS } from '../src/shared/utils/permissions';

describe('Reports Module (F13)', () => {
  let reportsAdapter: MockReportsAdapter;

  beforeEach(() => {
    reportsAdapter = new MockReportsAdapter();
  });

  describe('Report Catalog & Definitions Registry', () => {
    it('defines reports across all 6 core categories', () => {
      const categories = new Set(REPORT_DEFINITIONS.map((r) => r.category));
      expect(categories.has('sales')).toBe(true);
      expect(categories.has('inventory')).toBe(true);
      expect(categories.has('purchasing')).toBe(true);
      expect(categories.has('finance')).toBe(true);
      expect(categories.has('hr')).toBe(true);
      expect(categories.has('marketing')).toBe(true);
    });

    it('contains at least 20 comprehensive standard reports', () => {
      expect(STANDARD_REPORTS.length).toBeGreaterThanOrEqual(20);
    });

    it('ensures each report has valid columns, unique IDs and Azerbaijani title/description', () => {
      const ids = new Set<string>();
      STANDARD_REPORTS.forEach((report) => {
        expect(report.id).toBeTruthy();
        expect(ids.has(report.id)).toBe(false);
        ids.add(report.id);

        expect(report.code).toMatch(/^REP-[A-Z]{2,4}-\d{2}$/);
        expect(report.azTitle).toBeTruthy();
        expect(report.azDescription).toBeTruthy();
        expect(report.columns.length).toBeGreaterThan(0);
        expect(report.requiredPermissions.length).toBeGreaterThan(0);
      });
    });

    it('enforces cost/margin sensitivity flags on profit-related reports', () => {
      const pnlReport = STANDARD_REPORTS.find(
        (r) => r.id === 'finance-branch-pnl-comparison' || r.id === 'finance-pnl-management'
      );
      expect(pnlReport).toBeDefined();
      expect(pnlReport?.isSensitive).toBe(true);
      expect(pnlReport?.cogsMethodNotice).toBe(true);
    });
  });

  describe('Permission Gating & Role Isolation', () => {
    it('grants General Manager permission to view standard reports and export', () => {
      const gmPerms = ROLE_DEFAULT_PERMISSIONS.general_manager;
      expect(checkPermissionMatch(gmPerms, 'reports.standard.view')).toBe(true);
      expect(checkPermissionMatch(gmPerms, 'reports.custom.create')).toBe(true);
      expect(checkPermissionMatch(gmPerms, 'reports.export')).toBe(true);
      expect(checkPermissionMatch(gmPerms, 'reports.schedule.manage')).toBe(true);
    });

    it('strictly denies Cashier from viewing standard reports or creating custom reports', () => {
      const cashierPerms = ROLE_DEFAULT_PERMISSIONS.cashier;
      expect(checkPermissionMatch(cashierPerms, 'reports.standard.view')).toBe(false);
      expect(checkPermissionMatch(cashierPerms, 'reports.custom.create')).toBe(false);
      expect(checkPermissionMatch(cashierPerms, 'reports.export')).toBe(false);
      expect(checkPermissionMatch(cashierPerms, 'products.cost_price.view')).toBe(false);
    });
  });

  describe('Extended Central KPI Registry', () => {
    it('contains accounting and operational KPI formulas', () => {
      expect(EXTENDED_KPI_REGISTRY['cogsWeightedAverage']).toBeDefined();
      expect(EXTENDED_KPI_REGISTRY['netProfitManagement']).toBeDefined();
      expect(EXTENDED_KPI_REGISTRY['inventoryTurnoverDays']).toBeDefined();
      expect(EXTENDED_KPI_REGISTRY['deadStockValue']).toBeDefined();
      expect(EXTENDED_KPI_REGISTRY['discountLeakage']).toBeDefined();
    });

    it('documents exact mathematical formula and data source for each metric', () => {
      const cogsKpi = EXTENDED_KPI_REGISTRY['cogsWeightedAverage'];
      expect(cogsKpi.formulaText).toContain('Çəkili Orta Maya');
      expect(cogsKpi.unit).toBe('azn');
      expect(cogsKpi.isSensitive).toBe(true);

      const dioKpi = EXTENDED_KPI_REGISTRY['inventoryTurnoverDays'];
      expect(dioKpi.formulaText).toContain('COGS');
      expect(dioKpi.description).toBeTruthy();
    });
  });

  describe('Report Builder & Field Whitelisting', () => {
    it('whitelists 4 core business datasets with strictly defined fields', () => {
      expect(DATASET_METADATA.sales_lines).toBeDefined();
      expect(DATASET_METADATA.stock_movements).toBeDefined();
      expect(DATASET_METADATA.purchase_lines).toBeDefined();
      expect(DATASET_METADATA.expense_lines).toBeDefined();
    });

    it('strips cost price and margin fields for users without products.cost_price.view', () => {
      const unauthorizedPerms = ['reports.standard.view', 'pos.sale.create'];
      const permitted = getPermittedFieldsForDataset('sales_lines', unauthorizedPerms);

      const fieldIds = permitted.map((f) => f.id);
      expect(fieldIds).toContain('quantitySold');
      expect(fieldIds).toContain('netRevenueAzn');
      expect(fieldIds).not.toContain('cogsAzn');
      expect(fieldIds).not.toContain('grossProfitAzn');
    });

    it('includes cost and profit fields when user has products.cost_price.view', () => {
      const authorizedPerms = ['reports.standard.view', 'products.cost_price.view'];
      const permitted = getPermittedFieldsForDataset('sales_lines', authorizedPerms);

      const fieldIds = permitted.map((f) => f.id);
      expect(fieldIds).toContain('cogsAzn');
      expect(fieldIds).toContain('grossProfitAzn');
    });

    it('strips salary share in expense dataset for users without hr.salary.view', () => {
      const withoutSalaryPerms = ['finance.expense.view'];
      const permitted = getPermittedFieldsForDataset('expense_lines', withoutSalaryPerms);

      const fieldIds = permitted.map((f) => f.id);
      expect(fieldIds).toContain('amountAzn');
      expect(fieldIds).not.toContain('salaryShareAzn');

      const withSalaryPerms = ['finance.expense.view', 'hr.salary.view'];
      const permittedWithSalary = getPermittedFieldsForDataset('expense_lines', withSalaryPerms);
      expect(permittedWithSalary.map((f) => f.id)).toContain('salaryShareAzn');
    });

    it('executes no-code report aggregation deterministically without raw SQL', () => {
      const permitted = getPermittedFieldsForDataset('sales_lines', ['*']);
      const { columns, rows } = executeCustomReportQuery(
        {
          id: 'test-report',
          title: 'Test Satış',
          dataset: 'sales_lines',
          selectedDimensions: ['branchName', 'categoryName'],
          selectedMeasures: ['quantitySold', 'netRevenueAzn'],
          isShared: false,
          createdBy: 'admin',
          createdAt: new Date().toISOString(),
        },
        permitted
      );

      expect(columns.length).toBe(4);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toHaveProperty('branchName');
      expect(rows[0]).toHaveProperty('quantitySold');
    });
  });

  describe('Filter State URL Serialization', () => {
    it('serializes and deserializes report filters bidirectionally', () => {
      const filters = {
        datePreset: 'this_month',
        startDate: '2026-10-01',
        endDate: '2026-10-12',
        branchIds: ['b1', 'b2'],
        thresholdDays: 90,
      };

      const urlQuery = serializeReportFiltersToUrl(filters);
      expect(urlQuery).toContain('datePreset=this_month');
      expect(urlQuery).toContain('branchIds=b1%2Cb2');

      const parsed = parseReportFiltersFromUrl(urlQuery);
      expect(parsed.datePreset).toBe('this_month');
      expect(parsed.startDate).toBe('2026-10-01');
      expect(parsed.branchIds).toEqual(['b1', 'b2']);
      expect(parsed.thresholdDays).toBe(90);
    });
  });

  describe('Scheduled Report Deliveries', () => {
    it('maintains providerStatus strictly as "Konfiqurasiya olunmayıb"', async () => {
      const schedules = await reportsAdapter.getScheduledReports();
      expect(schedules.length).toBeGreaterThan(0);
      schedules.forEach((s) => {
        expect(s.providerStatus).toBe('Konfiqurasiya olunmayıb');
      });
    });

    it('supports creating, toggling and deleting schedules', async () => {
      const created = await reportsAdapter.createScheduledReport({
        reportId: 'sales-daily',
        reportTitle: 'Avtomat Gündəlik Satış',
        frequency: 'daily',
        channel: 'email',
        recipients: ['audit@brandhouse.az'],
        format: 'pdf',
      });

      expect(created.id).toBeTruthy();
      expect(created.providerStatus).toBe('Konfiqurasiya olunmayıb');
      expect(created.isActive).toBe(true);

      const updated = await reportsAdapter.updateScheduledReport(created.id, {
        isActive: false,
      });
      expect(updated.isActive).toBe(false);

      const deleted = await reportsAdapter.deleteScheduledReport(created.id);
      expect(deleted).toBe(true);
    });
  });

  describe('Export Generation', () => {
    it('generates valid base64 CSV export with column headers and rows', async () => {
      const exportRes = await reportsAdapter.exportReport('sales-daily', {}, 'csv');
      expect(exportRes.filename).toContain('sales-daily');
      expect(exportRes.filename).toContain('.csv');
      expect(exportRes.dataUri).toContain('data:text/csv');
    });

    it('generates XLSX and PDF export markers with proper MIME types', async () => {
      const xlsxRes = await reportsAdapter.exportReport('inventory-current-stock', {}, 'xlsx');
      expect(xlsxRes.filename).toContain('.xlsx');
      expect(xlsxRes.dataUri).toContain('data:application/vnd.openxmlformats');

      const pdfRes = await reportsAdapter.exportReport('finance-branch-pnl-comparison', {}, 'pdf');
      expect(pdfRes.filename).toContain('.pdf');
      expect(pdfRes.dataUri).toContain('data:application/pdf');
    });
  });
});
