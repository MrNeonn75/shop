import { describe, it, expect, beforeEach } from 'vitest';
import { MockBiAdapter } from '../src/shared/adapters/mock/mockBiAdapter';

describe('Business Intelligence & Analytics Module (BI - F13)', () => {
  let biAdapter: MockBiAdapter;

  beforeEach(() => {
    biAdapter = new MockBiAdapter();
  });

  describe('Executive Performance & Dashboard', () => {
    it('retrieves period summary, growth percentages and achievement against targets', async () => {
      const data = await biAdapter.getExecutivePerformance();
      expect(data).toBeDefined();
      expect(data.isDemo).toBe(true);
      expect(data.periodSummary.currentSalesAzn).toBeGreaterThan(0);
      expect(data.periodSummary.growthPercent).toBeGreaterThan(0);
      expect(data.periodSummary.targetAchievementPercent).toBeGreaterThan(0);
    });

    it('ranks branches by sales revenue and calculates share percentages correctly', async () => {
      const data = await biAdapter.getExecutivePerformance();
      expect(data.branchRankings.length).toBeGreaterThanOrEqual(3);

      // Verify rankings are descending by sales
      for (let i = 0; i < data.branchRankings.length - 1; i++) {
        expect(data.branchRankings[i].salesAzn).toBeGreaterThanOrEqual(
          data.branchRankings[i + 1].salesAzn
        );
      }

      // Check sum of share percents approximates 100%
      const totalShare = data.branchRankings.reduce((sum, b) => sum + b.sharePercent, 0);
      expect(totalShare).toBeCloseTo(100, 0);
    });

    it('provides period comparisons with absolute and percentage variance', async () => {
      const data = await biAdapter.getExecutivePerformance();
      expect(data.periodComparisons.length).toBeGreaterThan(0);
      data.periodComparisons.forEach((row) => {
        expect(row.metric).toBeTruthy();
        expect(typeof row.currentValue).toBe('number');
        expect(typeof row.previousValue).toBe('number');
        expect(row.varianceAbsolute).toBeCloseTo(row.currentValue - row.previousValue, 1);
      });
    });
  });

  describe('Inventory Intelligence & Reorder Formulas', () => {
    it('calculates inventory turnover rate, DIO days and dead stock value', async () => {
      const data = await biAdapter.getInventoryIntelligence();
      expect(data.inventoryTurnover).toBeGreaterThan(0);
      expect(data.daysOfInventory).toBeGreaterThan(0);
      expect(data.deadStockValueAzn).toBeGreaterThan(0);
      expect(data.totalStockValueAzn).toBeGreaterThan(data.deadStockValueAzn);
    });

    it('evaluates Sell-Through Rate (STR) across collections', async () => {
      const data = await biAdapter.getInventoryIntelligence();
      expect(data.seasonSellThrough.length).toBeGreaterThan(0);
      data.seasonSellThrough.forEach((s) => {
        const expectedStr = (s.soldQty / s.initialStockQty) * 100;
        expect(s.strPercent).toBeCloseTo(expectedStr, 0);
        expect(['optimal', 'slow', 'fast']).toContain(s.status);
      });
    });

    it('evaluates markdown candidates based on age without sale and locked capital', async () => {
      const data = await biAdapter.getInventoryIntelligence();
      expect(data.markdownCandidates.length).toBeGreaterThan(0);
      data.markdownCandidates.forEach((m) => {
        expect(m.ageDays).toBeGreaterThanOrEqual(90); // Dead/slow stock threshold
        expect(m.suggestedDiscountPercent).toBeGreaterThan(0);
        expect(m.costPriceAzn).toBeLessThan(m.retailPriceAzn);
        expect(m.reason).toBeTruthy();
      });
    });

    it('provides transparent formula explanation for auto-reorder suggestions', async () => {
      const data = await biAdapter.getInventoryIntelligence();
      expect(data.reorderSuggestions.length).toBeGreaterThan(0);
      data.reorderSuggestions.forEach((s) => {
        const { dailyVelocity, leadTimeDays, safetyStock, currentStock, suggestedReorderQty, explanation } = s;

        // Verify inputs are transparently documented in explanation
        expect(explanation.dailyVelocityInput).toBe(dailyVelocity);
        expect(explanation.leadTimeDaysInput).toBe(leadTimeDays);
        expect(explanation.safetyStockInput).toBe(safetyStock);
        expect(explanation.formulaText).toContain('Tövsiyə');

        // Theoretical formula: (dailyVelocity * leadTimeDays) + safetyStock - currentStock
        const rawFormula = dailyVelocity * leadTimeDays + safetyStock - currentStock;
        expect(suggestedReorderQty).toBeGreaterThan(0);
        expect(Math.abs(suggestedReorderQty - rawFormula)).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('Customer Analytics & Basket Associations', () => {
    it('segments customers into 5 RFM clusters with spend metrics', async () => {
      const data = await biAdapter.getCustomerAnalytics();
      expect(data.rfmSegments.length).toBe(5);

      const segmentNames = data.rfmSegments.map((s) => s.segmentName);
      expect(segmentNames).toContain('Çempionlar (VIP)');
      expect(segmentNames).toContain('Sadiq Alıcılar');
      expect(segmentNames).toContain('Risk Qrupunda');

      // VIPs have highest average spend
      const vip = data.rfmSegments.find((s) => s.segmentName.includes('VIP'))!;
      const passive = data.rfmSegments.find((s) => s.segmentName.includes('Passiv'))!;
      expect(vip.avgSpentAzn).toBeGreaterThan(passive.avgSpentAzn);
    });

    it('evaluates new vs returning customers ratio', async () => {
      const data = await biAdapter.getCustomerAnalytics();
      const { newVsReturning } = data;
      expect(newVsReturning.newCustomerCount).toBeGreaterThan(0);
      expect(newVsReturning.returningCustomerCount).toBeGreaterThan(0);
      expect(newVsReturning.newSharePercent + newVsReturning.returningSharePercent).toBeCloseTo(100, 0);
    });

    it('calculates market basket analysis lift scores (> 1 indicates positive affinity)', async () => {
      const data = await biAdapter.getCustomerAnalytics();
      expect(data.basketAssociations.length).toBeGreaterThan(0);
      data.basketAssociations.forEach((pair) => {
        expect(pair.productA).toBeTruthy();
        expect(pair.productB).toBeTruthy();
        expect(pair.coOccurrenceCount).toBeGreaterThan(0);
        expect(pair.confidencePercent).toBeGreaterThan(0);
        // Lift > 1 indicates positive affinity between products
        expect(pair.liftScore).toBeGreaterThan(1.0);
      });
    });

    it('identifies churn risk customers exceeding 60-90 days inactivity', async () => {
      const data = await biAdapter.getCustomerAnalytics();
      expect(data.churnRiskCustomers.length).toBeGreaterThan(0);
      data.churnRiskCustomers.forEach((c) => {
        expect(c.daysSinceLastPurchase).toBeGreaterThanOrEqual(60);
        expect(c.ltvAzn).toBeGreaterThan(0);
        expect(['high', 'medium']).toContain(c.riskLevel);
      });
    });
  });

  describe('Profitability & Margins', () => {
    it('enforces active COGS method labeling and distinguishes revenue vs cash', async () => {
      const data = await biAdapter.getProfitabilityData();
      expect(data.activeCogsMethod).toBe('Çəkili Orta Maya (Weighted Average)');
      expect(data.totalRevenueAzn).toBeGreaterThan(0);
      expect(data.cogsAzn).toBeGreaterThan(0);
      expect(data.grossProfitAzn).toBe(data.totalRevenueAzn - data.cogsAzn);
      expect(data.grossMarginPercent).toBeCloseTo(
        (data.grossProfitAzn / data.totalRevenueAzn) * 100,
        0
      );
    });

    it('quantifies profit leakage across discounts and handling costs', async () => {
      const data = await biAdapter.getProfitabilityData();
      expect(data.discountLeakageAzn).toBeGreaterThan(0);
      expect(data.returnCostAzn).toBeGreaterThan(0);
    });

    it('computes margins by brand and category', async () => {
      const data = await biAdapter.getProfitabilityData();
      expect(data.marginByBrand.length).toBeGreaterThan(0);
      expect(data.marginByCategory.length).toBeGreaterThan(0);

      data.marginByBrand.forEach((b) => {
        expect(b.revenueAzn).toBeGreaterThan(b.cogsAzn);
        expect(b.grossProfitAzn).toBe(b.revenueAzn - b.cogsAzn);
        expect(b.marginPercent).toBeGreaterThan(0);
      });
    });
  });

  describe('Anomaly Detection Board', () => {
    it('detects operational anomalies with criteria, severity and evidence links', async () => {
      const anomalies = await biAdapter.getAnomalies();
      expect(anomalies.length).toBeGreaterThanOrEqual(4);

      anomalies.forEach((a) => {
        expect(['discount', 'return', 'cash_variance', 'stock_adjustment']).toContain(a.type);
        expect(['critical', 'warning']).toContain(a.severity);
        expect(a.title).toBeTruthy();
        expect(a.description).toBeTruthy();
        expect(a.detectionCriteria).toBeTruthy();
        expect(a.evidenceUrl).toBeTruthy();
        expect(a.actorName).toBeTruthy();
        expect(a.branchName).toBeTruthy();
      });
    });

    it('filters anomalies by branch when requested', async () => {
      const filtered = await biAdapter.getAnomalies({ branchIds: ['b1'] });
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe('Chart Annotations Timeline', () => {
    it('retrieves and persists chart event annotations', async () => {
      const initial = await biAdapter.getChartAnnotations();
      expect(initial.length).toBeGreaterThan(0);

      const added = await biAdapter.addChartAnnotation({
        title: 'Qara Cümə Kampaniyası',
        date: '2026-11-27',
        note: 'Bütün filiallarda 30% endirim aksiyası planlaşdırılıb',
        author: 'Test Menecer',
        type: 'campaign',
      });

      expect(added.id).toBeTruthy();
      expect(added.title).toBe('Qara Cümə Kampaniyası');

      const after = await biAdapter.getChartAnnotations();
      expect(after.length).toBe(initial.length + 1);
    });
  });
});
