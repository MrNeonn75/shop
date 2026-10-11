import { describe, it, expect } from 'vitest';
import { MockDashboardAdapter } from '../src/shared/adapters/mock/mockDashboardAdapter';
import { BrendHouseLegacyDashboardAdapter, UnconfiguredLegacyAdapterError } from '../src/shared/adapters/BrendHouseLegacyAdapter';
import { DashboardFilterParams } from '../src/features/dashboard/types';
import { getDateRangeForPreset } from '../src/features/dashboard/utils/datePresets';

describe('Dashboard Adapter Pattern & Seeded Data Verification', () => {
  const mockAdapter = new MockDashboardAdapter();
  const legacyAdapter = new BrendHouseLegacyDashboardAdapter();

  const baseParams: DashboardFilterParams = {
    branchId: 'all',
    datePreset: 'this_month',
    startDate: '2026-10-01',
    endDate: '2026-10-10',
    comparisonMode: 'previous_period',
  };

  it('MockDashboardAdapter produces deterministic and stable results for identical filter params', async () => {
    const res1 = await mockAdapter.getSummary(baseParams);
    const res2 = await mockAdapter.getSummary(baseParams);

    expect(res1.metrics.totalSales.value).toBe(res2.metrics.totalSales.value);
    expect(res1.metrics.grossProfit.value).toBe(res2.metrics.grossProfit.value);
    expect(res1.metrics.unitsSold.value).toBe(res2.metrics.unitsSold.value);
    expect(res1.isDemo).toBe(true);
  });

  it('scales metrics according to selected branch or consolidated chain', async () => {
    const chainSummary = await mockAdapter.getSummary({
      ...baseParams,
      branchId: 'all',
    });

    const branchSummary = await mockAdapter.getSummary({
      ...baseParams,
      branchId: 'branch_28may',
    });

    // Chain-wide volume should be greater than a single branch volume
    expect(chainSummary.metrics.totalSales.value).toBeGreaterThan(branchSummary.metrics.totalSales.value);
    expect(chainSummary.metrics.inventoryValue.value).toBeGreaterThan(branchSummary.metrics.inventoryValue.value);
  });

  it('hourly sales trend is returned for single-day presets', async () => {
    const singleDayParams: DashboardFilterParams = {
      branchId: 'branch_genclik',
      datePreset: 'today',
      startDate: '2026-10-10',
      endDate: '2026-10-10',
      comparisonMode: 'previous_period',
    };

    const trend = await mockAdapter.getSalesTrend(singleDayParams);
    expect(trend.length).toBeGreaterThanOrEqual(10); // 10:00 to 22:00
    expect(trend[0].label).toBe('10:00');
    expect(trend[0].currentSalesQapik).toBeGreaterThan(0);
    expect(trend[0].previousSalesQapik).toBeDefined();
  });

  it('section and type breakdown includes all required fashion segments', async () => {
    const sectionTypes = await mockAdapter.getSectionTypeSales(baseParams);

    const sectionKeys = sectionTypes.sections.map((s) => s.section);
    expect(sectionKeys).toContain('kisi');
    expect(sectionKeys).toContain('qadin');
    expect(sectionKeys).toContain('usaq');
    expect(sectionKeys).toContain('diger');

    const typeKeys = sectionTypes.types.map((t) => t.type);
    expect(typeKeys).toContain('geyim');
    expect(typeKeys).toContain('ayaqqabi');
    expect(typeKeys).toContain('aksesuar');

    // Total percentages should equal 100%
    const totalSectionShare = sectionTypes.sections.reduce((acc, s) => acc + s.sharePercentage, 0);
    expect(totalSectionShare).toBe(100);
  });

  it('inventory alerts identifies critical and low stock items', async () => {
    const alerts = await mockAdapter.getInventoryAlerts(baseParams);
    expect(alerts.lowStockItems.length).toBeGreaterThan(0);
    expect(alerts.criticalCount).toBeGreaterThan(0);
    expect(alerts.lowStockItems.some((i) => i.status === 'critical')).toBe(true);
  });

  it('handles uncalculated net profit when opex expenses are incomplete', async () => {
    const incompleteParams: DashboardFilterParams = {
      branchId: 'all',
      datePreset: 'custom',
      startDate: '2026-06-01',
      endDate: '2026-09-30', // > 45 days custom period triggering unclosed ledger
      comparisonMode: 'none',
    };

    const summary = await mockAdapter.getSummary(incompleteParams);
    expect(summary.metrics.netProfit.isCalculated).toBe(false);
    expect(summary.metrics.netProfit.uncalculatedReason).toBeDefined();
  });

  it('date preset calculations return valid ISO dates', () => {
    const todayRange = getDateRangeForPreset('today');
    expect(todayRange.startDate).toBe(todayRange.endDate);

    const monthRange = getDateRangeForPreset('this_month');
    expect(monthRange.startDate.endsWith('-01')).toBe(true);
  });

  it('BrendHouseLegacyDashboardAdapter throws explicit unconfigured error', async () => {
    await expect(legacyAdapter.getSummary(baseParams)).rejects.toThrow(UnconfiguredLegacyAdapterError);
    await expect(legacyAdapter.getSalesTrend(baseParams)).rejects.toThrow('İnteqrasiya konfiqurasiya edilməyib');
  });
});

