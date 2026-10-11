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
import { toQapik } from '../../utils/money';

/**
 * Seeded deterministic Pseudo-Random Number Generator (Mulberry32)
 * Ensures that for any given combination of filter parameters, the generated
 * metrics are 100% stable, repeatable, and realistic.
 */
function createSeededRng(seedString: string) {
  let h = 0;
  for (let i = 0; i < seedString.length; i++) {
    h = Math.imul(31, h) + seedString.charCodeAt(i) | 0;
  }
  let s = h >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BRANCH_NAMES_MAP: Record<string, { name: string; code: string; factor: number }> = {
  branch_28may: { name: '28 May Filialı', code: '28M', factor: 1.25 },
  branch_genclik: { name: 'Gənclik Mall Filialı', code: 'GNM', factor: 1.4 },
  branch_nizami: { name: 'Nizami Filialı', code: 'NZM', factor: 0.95 },
  branch_deniz: { name: 'Dəniz Mall Filialı', code: 'DNZ', factor: 1.1 },
  branch_sumqayit: { name: 'Sumqayıt Filialı', code: 'SMQ', factor: 0.75 },
};

/**
 * Calculates days between two date strings (YYYY-MM-DD)
 */
function getDaysCount(startDate: string, endDate: string): number {
  const d1 = new Date(startDate);
  const d2 = new Date(endDate);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, isNaN(diffDays) ? 1 : diffDays);
}

export function generateMockDashboardData(params: DashboardFilterParams) {
  const seedKey = `${params.branchId}_${params.datePreset}_${params.startDate}_${params.endDate}_${params.comparisonMode}`;
  const rng = createSeededRng(seedKey);

  const days = getDaysCount(params.startDate, params.endDate);
  const isAllBranches = params.branchId === 'all';

  // Base daily volume for Brand House chain (in AZN)
  const singleBranchBaseDailyAzn = 8500 + Math.floor(rng() * 3200);
  const branchMultiplier = isAllBranches ? 4.8 : (BRANCH_NAMES_MAP[params.branchId]?.factor || 1.0);
  const totalPeriodGrossAzn = singleBranchBaseDailyAzn * branchMultiplier * days;

  // Realistic retail rates
  const returnRatePercent = Number((3.2 + rng() * 1.8).toFixed(1)); // 3.2% - 5.0%
  const grossSalesQapik = Math.round(totalPeriodGrossAzn * 100);
  const returnsQapik = Math.round((grossSalesQapik * returnRatePercent) / 100);
  const netSalesQapik = grossSalesQapik - returnsQapik;

  // COGS is ~52% of net sales (fashion retail weighted average margin)
  const cogsRatio = 0.51 + rng() * 0.04;
  const cogsQapik = Math.round(netSalesQapik * cogsRatio);
  const grossProfitQapik = netSalesQapik - cogsQapik;

  // Operating Expenses (Rent, Salaries, Utilities, Logistics)
  const dailyOpexAzn = (isAllBranches ? 8500 : 1800) + Math.floor(rng() * 400);
  const totalExpenseQapik = Math.round(dailyOpexAzn * days * 100);

  // Net Profit condition:
  // If datePreset === 'custom' and days > 60 or specific edge case, simulate missing OPEX allocation
  const isNetProfitCalculated = !(params.datePreset === 'custom' && days > 45);
  const netProfitQapik = isNetProfitCalculated ? grossProfitQapik - totalExpenseQapik : 0;

  // Volume metrics
  const avgOrderValueAzn = 84.5 + Math.floor(rng() * 30);
  const avgOrderValueQapik = Math.round(avgOrderValueAzn * 100);
  const orderCount = Math.max(1, Math.round(netSalesQapik / avgOrderValueQapik));
  const avgItemsPerOrder = 2.1 + rng() * 0.4;
  const unitsSold = Math.round(orderCount * avgItemsPerOrder);

  // Inventory value (Central warehouse + active branches)
  const baseChainInventoryAzn = 1450000;
  const inventoryValueAzn = isAllBranches
    ? baseChainInventoryAzn + Math.floor(rng() * 85000)
    : Math.floor(baseChainInventoryAzn * 0.22 * (BRANCH_NAMES_MAP[params.branchId]?.factor || 1));
  const inventoryValueQapik = Math.round(inventoryValueAzn * 100);

  // Inventory Turnover: Annualized COGS / Avg Inventory
  const annualizedCogs = (cogsQapik / days) * 365;
  const inventoryTurnover = Number((annualizedCogs / inventoryValueQapik).toFixed(2));

  // Supplier liabilities (unpaid invoices to fashion suppliers)
  const supplierLiabilitiesAzn = isAllBranches ? 312000 + Math.floor(rng() * 45000) : 65000 + Math.floor(rng() * 12000);
  const supplierLiabilitiesQapik = Math.round(supplierLiabilitiesAzn * 100);

  // Promotional discount cost
  const discountRate = 0.085 + rng() * 0.035; // 8.5% - 12%
  const discountCostQapik = Math.round(grossSalesQapik * discountRate);

  // Comparison period percentage deltas
  const salesGrowthPercent = Number(((rng() > 0.3 ? 1 : -1) * (4.2 + rng() * 14.5)).toFixed(1));
  const grossProfitGrowthPercent = Number(((rng() > 0.35 ? 1 : -1) * (3.8 + rng() * 12.0)).toFixed(1));
  const netProfitGrowthPercent = Number(((rng() > 0.4 ? 1 : -1) * (2.5 + rng() * 15.0)).toFixed(1));
  const aovGrowthPercent = Number(((rng() > 0.45 ? 1 : -1) * (1.2 + rng() * 6.5)).toFixed(1));
  const unitsGrowthPercent = Number(((rng() > 0.3 ? 1 : -1) * (3.5 + rng() * 11.2)).toFixed(1));
  const returnRateDelta = Number(((rng() > 0.5 ? -1 : 1) * (0.2 + rng() * 0.8)).toFixed(1));

  // Sparklines (7 micro-data points)
  const makeSparkline = (base: number, volatility = 0.15) =>
    Array.from({ length: 7 }, (_, i) => {
      const noise = (rng() - 0.48) * volatility;
      return Math.round(base * (1 + noise + (i * 0.02)));
    });

  const summaryResponse: DashboardSummaryResponse = {
    isDemo: true,
    lastUpdatedAt: new Date().toISOString(),
    filterContext: params,
    periodLabel:
      params.datePreset === 'today'
        ? 'Bu gün'
        : params.datePreset === 'yesterday'
          ? 'Dünən'
          : params.datePreset === 'last_7_days'
            ? 'Son 7 gün'
            : params.datePreset === 'this_month'
              ? 'Bu ay'
              : params.datePreset === 'last_month'
                ? 'Keçən ay'
                : params.datePreset === 'this_year'
                  ? 'Bu il'
                  : `${params.startDate} - ${params.endDate}`,
    comparisonLabel:
      params.comparisonMode === 'same_period_last_year'
        ? 'Keçən ilin eyni dövrünə nisbətən'
        : params.comparisonMode === 'previous_period'
          ? 'Əvvəlki dövrə nisbətən'
          : 'Müqayisəsiz',
    metrics: {
      totalSales: {
        id: 'totalSales',
        value: netSalesQapik,
        previousValue: Math.round(netSalesQapik / (1 + salesGrowthPercent / 100)),
        changePercentage: salesGrowthPercent,
        isCalculated: true,
        sparkline: makeSparkline(netSalesQapik),
      },
      grossProfit: {
        id: 'grossProfit',
        value: grossProfitQapik,
        previousValue: Math.round(grossProfitQapik / (1 + grossProfitGrowthPercent / 100)),
        changePercentage: grossProfitGrowthPercent,
        isCalculated: true,
        sparkline: makeSparkline(grossProfitQapik),
      },
      netProfit: {
        id: 'netProfit',
        value: netProfitQapik,
        previousValue: Math.round(netProfitQapik / (1 + netProfitGrowthPercent / 100)),
        changePercentage: isNetProfitCalculated ? netProfitGrowthPercent : undefined,
        isCalculated: isNetProfitCalculated,
        uncalculatedReason: isNetProfitCalculated
          ? undefined
          : 'Geniş tarix aralığı üzrə dövrün icarə və kommunal xərc aktları hələ tam bağlanmayıb',
        sparkline: makeSparkline(netProfitQapik),
      },
      salesGrowth: {
        id: 'salesGrowth',
        value: salesGrowthPercent,
        changePercentage: salesGrowthPercent,
        isCalculated: true,
        sparkline: makeSparkline(salesGrowthPercent, 0.4),
      },
      averageOrderValue: {
        id: 'averageOrderValue',
        value: avgOrderValueQapik,
        changePercentage: aovGrowthPercent,
        isCalculated: true,
        sparkline: makeSparkline(avgOrderValueQapik),
      },
      unitsSold: {
        id: 'unitsSold',
        value: unitsSold,
        changePercentage: unitsGrowthPercent,
        isCalculated: true,
        sparkline: makeSparkline(unitsSold),
      },
      returnRate: {
        id: 'returnRate',
        value: returnRatePercent,
        changePercentage: returnRateDelta,
        isCalculated: true,
        sparkline: makeSparkline(returnRatePercent, 0.2),
      },
      inventoryValue: {
        id: 'inventoryValue',
        value: inventoryValueQapik,
        changePercentage: Number(((rng() - 0.5) * 4).toFixed(1)),
        isCalculated: true,
        sparkline: makeSparkline(inventoryValueQapik, 0.05),
      },
      inventoryTurnover: {
        id: 'inventoryTurnover',
        value: inventoryTurnover,
        changePercentage: Number(((rng() - 0.45) * 6).toFixed(1)),
        isCalculated: true,
        sparkline: makeSparkline(inventoryTurnover, 0.1),
      },
      supplierLiabilities: {
        id: 'supplierLiabilities',
        value: supplierLiabilitiesQapik,
        changePercentage: Number(((rng() - 0.5) * 5).toFixed(1)),
        isCalculated: true,
        sparkline: makeSparkline(supplierLiabilitiesQapik, 0.08),
      },
      discountCost: {
        id: 'discountCost',
        value: discountCostQapik,
        changePercentage: Number(((rng() - 0.4) * 8).toFixed(1)),
        isCalculated: true,
        sparkline: makeSparkline(discountCostQapik, 0.12),
      },
    },
  };

  return {
    summaryResponse,
    rng,
    netSalesQapik,
    orderCount,
    days,
    isAllBranches,
  };
}

/**
 * Generate Sales Trend points (hourly for 1 day, daily for <= 31 days, monthly otherwise)
 */
export function generateSalesTrendPoints(params: DashboardFilterParams): SalesTrendDataPoint[] {
  const { rng, netSalesQapik, days } = generateMockDashboardData(params);

  // Hourly trend for single day (today or yesterday)
  if (params.datePreset === 'today' || params.datePreset === 'yesterday' || days === 1) {
    const hours = [
      '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
    ];
    // Peak hours in retail are 17:00 - 21:00
    const hourWeights = [0.03, 0.05, 0.07, 0.08, 0.08, 0.09, 0.11, 0.13, 0.14, 0.12, 0.07, 0.02, 0.01];

    return hours.map((hour, idx) => {
      const weight = hourWeights[idx];
      const hourlyAzn = (netSalesQapik * weight) / 100;
      const currentSales = Math.round(hourlyAzn * 100);
      const prevSales = Math.round(currentSales * (0.88 + rng() * 0.25));
      return {
        timestamp: `${params.startDate}T${hour}:00`,
        label: hour,
        currentSalesQapik: toQapik(currentSales),
        previousSalesQapik: params.comparisonMode !== 'none' ? toQapik(prevSales) : undefined,
        orderCount: Math.max(1, Math.round(currentSales / 8500)),
      };
    });
  }

  // Daily trend for 7 days, this month, last month
  const count = Math.min(days, 30);
  const dailyBase = netSalesQapik / count;

  return Array.from({ length: count }, (_, i) => {
    const dayNum = i + 1;
    const isWeekend = (dayNum % 7 === 5 || dayNum % 7 === 6); // Friday/Saturday peak in Baku retail
    const weekendBoost = isWeekend ? 1.4 : 0.92;
    const randomFactor = 0.85 + rng() * 0.3;
    const currentSales = Math.round(dailyBase * weekendBoost * randomFactor);
    const prevSales = Math.round(currentSales * (0.85 + rng() * 0.28));

    const dateStr = `${dayNum < 10 ? '0' : ''}${dayNum}`;
    return {
      timestamp: `2026-10-${dateStr}`,
      label: `${dateStr} okt`,
      currentSalesQapik: toQapik(currentSales),
      previousSalesQapik: params.comparisonMode !== 'none' ? toQapik(prevSales) : undefined,
      orderCount: Math.max(3, Math.round(currentSales / 8500)),
    };
  });
}

/**
 * Generate Sales by Branch ranking
 */
export function generateBranchSalesPoints(params: DashboardFilterParams): BranchSalesDataPoint[] {
  const { netSalesQapik, isAllBranches } = generateMockDashboardData(params);

  const branches = [
    { id: 'branch_genclik', name: 'Gənclik Mall Filialı', code: 'GNM', weight: 0.32 },
    { id: 'branch_28may', name: '28 May Filialı', code: '28M', weight: 0.28 },
    { id: 'branch_deniz', name: 'Dəniz Mall Filialı', code: 'DNZ', weight: 0.22 },
    { id: 'branch_nizami', name: 'Nizami Filialı', code: 'NZM', weight: 0.18 },
  ];

  if (!isAllBranches) {
    const found = branches.find((b) => b.id === params.branchId) || branches[0];
    return [
      {
        branchId: found.id,
        branchName: found.name,
        branchCode: found.code,
        salesQapik: toQapik(netSalesQapik),
        orderCount: Math.round(netSalesQapik / 8500),
        sharePercentage: 100,
        returnRate: 3.8,
        isDemo: true,
      },
    ];
  }

  return branches.map((b) => {
    const branchSales = Math.round(netSalesQapik * b.weight);
    return {
      branchId: b.id,
      branchName: b.name,
      branchCode: b.code,
      salesQapik: toQapik(branchSales),
      orderCount: Math.round(branchSales / 8500),
      sharePercentage: Math.round(b.weight * 100),
      returnRate: Number((3.1 + Math.random() * 1.5).toFixed(1)),
      isDemo: true,
    };
  });
}

/**
 * Generate Section and Type Sales breakdown
 */
export function generateSectionTypeSales(params: DashboardFilterParams): SectionTypeSalesData {
  const { netSalesQapik } = generateMockDashboardData(params);

  // Sections: Kişi, Qadın, Uşaq, Digər
  const sections: SectionTypeSalesData['sections'] = [
    {
      section: 'qadin',
      labelAz: 'Qadın Kolleksiyası',
      salesQapik: toQapik(Math.round(netSalesQapik * 0.42)),
      unitsSold: Math.round((netSalesQapik * 0.42) / 6500),
      sharePercentage: 42,
    },
    {
      section: 'kisi',
      labelAz: 'Kişi Kolleksiyası',
      salesQapik: toQapik(Math.round(netSalesQapik * 0.38)),
      unitsSold: Math.round((netSalesQapik * 0.38) / 7200),
      sharePercentage: 38,
    },
    {
      section: 'usaq',
      labelAz: 'Uşaq Bölməsi',
      salesQapik: toQapik(Math.round(netSalesQapik * 0.14)),
      unitsSold: Math.round((netSalesQapik * 0.14) / 4500),
      sharePercentage: 14,
    },
    {
      section: 'diger',
      labelAz: 'Digər / Mövsümi',
      salesQapik: toQapik(Math.round(netSalesQapik * 0.06)),
      unitsSold: Math.round((netSalesQapik * 0.06) / 3800),
      sharePercentage: 6,
    },
  ];

  // Types: Geyim, Ayaqqabı, Aksesuar
  const types: SectionTypeSalesData['types'] = [
    {
      type: 'geyim',
      labelAz: 'Geyim',
      salesQapik: toQapik(Math.round(netSalesQapik * 0.61)),
      unitsSold: Math.round((netSalesQapik * 0.61) / 5800),
      sharePercentage: 61,
    },
    {
      type: 'ayaqqabi',
      labelAz: 'Ayaqqabı',
      salesQapik: toQapik(Math.round(netSalesQapik * 0.27)),
      unitsSold: Math.round((netSalesQapik * 0.27) / 11500),
      sharePercentage: 27,
    },
    {
      type: 'aksesuar',
      labelAz: 'Aksesuar',
      salesQapik: toQapik(Math.round(netSalesQapik * 0.12)),
      unitsSold: Math.round((netSalesQapik * 0.12) / 3200),
      sharePercentage: 12,
    },
  ];

  return {
    sections,
    types,
    totalSalesQapik: toQapik(netSalesQapik),
    isDemo: true,
  };
}

/**
 * Generate Top 10 Products and Categories
 */
export function generateTopSellingProducts(params: DashboardFilterParams): TopSellingProductsData {
  const { netSalesQapik } = generateMockDashboardData(params);

  const products: TopSellingProductsData['products'] = [
    {
      id: 'prod-01',
      name: 'Klassik Pambıq Köynək',
      sku: 'TH-MS-001',
      barcode: '47600123001',
      brand: 'Tommy Hilfiger',
      category: 'koynek',
      categoryNameAz: 'Köynək',
      section: 'kisi',
      unitsSold: 218,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.075)),
      sharePercentage: 7.5,
    },
    {
      id: 'prod-02',
      name: 'Zərif İpək Bluz',
      sku: 'MD-WS-002',
      barcode: '47600123002',
      brand: 'Massimo Dutti',
      category: 'bluz',
      categoryNameAz: 'Bluz',
      section: 'qadin',
      unitsSold: 184,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.068)),
      sharePercentage: 6.8,
    },
    {
      id: 'prod-03',
      name: 'Slim Fit Cins Şalvar',
      sku: 'ZR-MJ-003',
      barcode: '47600123003',
      brand: 'Zara',
      category: 'salvar',
      categoryNameAz: 'Şalvar',
      section: 'kisi',
      unitsSold: 165,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.059)),
      sharePercentage: 5.9,
    },
    {
      id: 'prod-04',
      name: 'Oversize Yun Palto',
      sku: 'MD-WC-004',
      barcode: '47600123004',
      brand: 'Massimo Dutti',
      category: 'palto',
      categoryNameAz: 'Palto',
      section: 'qadin',
      unitsSold: 92,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.054)),
      sharePercentage: 5.4,
    },
    {
      id: 'prod-05',
      name: 'Dəri Şəhər Sneaker',
      sku: 'AD-US-005',
      barcode: '47600123005',
      brand: 'Adidas',
      category: 'ayaqqabi',
      categoryNameAz: 'Ayaqqabı',
      section: 'kisi',
      unitsSold: 140,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.048)),
      sharePercentage: 4.8,
    },
    {
      id: 'prod-06',
      name: 'Kapüşonlu Pambıq Sweatshirt',
      sku: 'ZR-MS-006',
      barcode: '47600123006',
      brand: 'Zara',
      category: 'sweatshirt',
      categoryNameAz: 'Sweatshirt',
      section: 'kisi',
      unitsSold: 132,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.042)),
      sharePercentage: 4.2,
    },
    {
      id: 'prod-07',
      name: 'Premium Dəri Çanta',
      sku: 'MD-WB-007',
      barcode: '47600123007',
      brand: 'Massimo Dutti',
      category: 'canta_pulqabi',
      categoryNameAz: 'Çanta və Pulqabı',
      section: 'qadin',
      unitsSold: 88,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.039)),
      sharePercentage: 3.9,
    },
    {
      id: 'prod-08',
      name: 'Gül Naxışlı Midi Don',
      sku: 'ZR-WD-008',
      barcode: '47600123008',
      brand: 'Zara',
      category: 'don',
      categoryNameAz: 'Don',
      section: 'qadin',
      unitsSold: 115,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.036)),
      sharePercentage: 3.6,
    },
    {
      id: 'prod-09',
      name: 'Kaşmir Qarışıqlı Kazak',
      sku: 'TH-MK-009',
      barcode: '47600123009',
      brand: 'Tommy Hilfiger',
      category: 'kazak',
      categoryNameAz: 'Kazak',
      section: 'kisi',
      unitsSold: 104,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.034)),
      sharePercentage: 3.4,
    },
    {
      id: 'prod-10',
      name: 'Uşaq İdman Dəsti',
      sku: 'AD-KD-010',
      barcode: '47600123010',
      brand: 'Adidas',
      category: 'dest',
      categoryNameAz: 'Dəst',
      section: 'usaq',
      unitsSold: 120,
      revenueQapik: toQapik(Math.round(netSalesQapik * 0.031)),
      sharePercentage: 3.1,
    },
  ];

  const categories: TopSellingProductsData['categories'] = [
    { category: 'koynek', categoryNameAz: 'Köynək', unitsSold: 412, revenueQapik: toQapik(Math.round(netSalesQapik * 0.18)), sharePercentage: 18 },
    { category: 'salvar', categoryNameAz: 'Şalvar', unitsSold: 365, revenueQapik: toQapik(Math.round(netSalesQapik * 0.16)), sharePercentage: 16 },
    { category: 'ayaqqabi', categoryNameAz: 'Ayaqqabı', unitsSold: 280, revenueQapik: toQapik(Math.round(netSalesQapik * 0.15)), sharePercentage: 15 },
    { category: 'bluz', categoryNameAz: 'Bluz', unitsSold: 240, revenueQapik: toQapik(Math.round(netSalesQapik * 0.12)), sharePercentage: 12 },
    { category: 'palto', categoryNameAz: 'Palto', unitsSold: 110, revenueQapik: toQapik(Math.round(netSalesQapik * 0.11)), sharePercentage: 11 },
    { category: 'sweatshirt', categoryNameAz: 'Sweatshirt', unitsSold: 220, revenueQapik: toQapik(Math.round(netSalesQapik * 0.09)), sharePercentage: 9 },
    { category: 'canta_pulqabi', categoryNameAz: 'Çanta və Pulqabı', unitsSold: 145, revenueQapik: toQapik(Math.round(netSalesQapik * 0.08)), sharePercentage: 8 },
    { category: 'don', categoryNameAz: 'Don', unitsSold: 180, revenueQapik: toQapik(Math.round(netSalesQapik * 0.06)), sharePercentage: 6 },
    { category: 'kazak', categoryNameAz: 'Kazak', unitsSold: 130, revenueQapik: toQapik(Math.round(netSalesQapik * 0.05)), sharePercentage: 5 },
  ];

  return {
    products,
    categories,
    isDemo: true,
  };
}

/**
 * Generate Payment Method Breakdown
 */
export function generatePaymentBreakdown(params: DashboardFilterParams): PaymentBreakdownData {
  const { netSalesQapik, orderCount } = generateMockDashboardData(params);

  const cardShare = 0.64;
  const cashShare = 0.26;
  const otherShare = 0.07; // Birbank, Tamkart taksit
  const splitShare = 0.03; // Mixed payment

  const items: PaymentBreakdownData['items'] = [
    {
      method: 'card',
      labelAz: 'Bank Kartı (POS Terminal)',
      amountQapik: toQapik(Math.round(netSalesQapik * cardShare)),
      transactionCount: Math.round(orderCount * cardShare),
      percentage: 64,
    },
    {
      method: 'cash',
      labelAz: 'Nağd Pul',
      amountQapik: toQapik(Math.round(netSalesQapik * cashShare)),
      transactionCount: Math.round(orderCount * cashShare),
      percentage: 26,
    },
    {
      method: 'other',
      labelAz: 'Taksit (Birbank / Tamkart)',
      amountQapik: toQapik(Math.round(netSalesQapik * otherShare)),
      transactionCount: Math.round(orderCount * otherShare),
      percentage: 7,
    },
    {
      method: 'split',
      labelAz: 'Qarışıq (Nağd + Kart)',
      amountQapik: toQapik(Math.round(netSalesQapik * splitShare)),
      transactionCount: Math.round(orderCount * splitShare),
      percentage: 3,
    },
  ];

  return {
    items,
    totalAmountQapik: toQapik(netSalesQapik),
    totalTransactions: orderCount,
    isDemo: true,
  };
}

/**
 * Generate Low Stock & Out-of-Stock alerts
 */
export function generateInventoryAlerts(params: DashboardFilterParams): InventoryAlertsData {
  const isBranchScoped = params.branchId !== 'all';
  const targetBranch = isBranchScoped
    ? BRANCH_NAMES_MAP[params.branchId]?.name || 'Gənclik Mall Filialı'
    : 'Bütün Filiallar';

  const lowStockItems: InventoryAlertsData['lowStockItems'] = [
    {
      id: 'stk-01',
      name: 'Klassik Pambıq Köynək (Ağ / L)',
      sku: 'TH-MS-001-W-L',
      barcode: '4760012300101',
      branchId: params.branchId,
      branchName: targetBranch,
      currentStock: 0,
      minThreshold: 5,
      status: 'critical',
      costPriceQapik: toQapik(4200),
    },
    {
      id: 'stk-02',
      name: 'Slim Fit Cins Şalvar (Mavi / 32)',
      sku: 'ZR-MJ-003-B-32',
      barcode: '4760012300302',
      branchId: params.branchId,
      branchName: targetBranch,
      currentStock: 1,
      minThreshold: 4,
      status: 'low',
      costPriceQapik: toQapik(3800),
    },
    {
      id: 'stk-03',
      name: 'Dəri Şəhər Sneaker (Ağ / 42)',
      sku: 'AD-US-005-W-42',
      barcode: '4760012300503',
      branchId: params.branchId,
      branchName: targetBranch,
      currentStock: 0,
      minThreshold: 3,
      status: 'critical',
      costPriceQapik: toQapik(7500),
    },
    {
      id: 'stk-04',
      name: 'Zərif İpək Bluz (Qara / S)',
      sku: 'MD-WS-002-B-S',
      barcode: '4760012300204',
      branchId: params.branchId,
      branchName: targetBranch,
      currentStock: 2,
      minThreshold: 6,
      status: 'low',
      costPriceQapik: toQapik(5200),
    },
    {
      id: 'stk-05',
      name: 'Oversize Yun Palto (Bej / M)',
      sku: 'MD-WC-004-BG-M',
      barcode: '4760012300405',
      branchId: params.branchId,
      branchName: targetBranch,
      currentStock: 1,
      minThreshold: 3,
      status: 'low',
      costPriceQapik: toQapik(12500),
    },
  ];

  return {
    lowStockItems,
    criticalCount: 2,
    lowStockCount: 3,
    totalAlertCount: 5,
    isDemo: true,
  };
}

/**
 * Generate Slow Moving / Dead Stock summary
 */
export function generateSlowMovingStock(params: DashboardFilterParams): SlowMovingStockData {
  const branchName = params.branchId !== 'all'
    ? BRANCH_NAMES_MAP[params.branchId]?.name || 'Gənclik Mall Filialı'
    : 'Mərkəzi Anbar & Filiallar';

  const items: SlowMovingStockData['items'] = [
    {
      id: 'dead-01',
      name: 'Qalstuk və Dəsmal Dəsti (İpək)',
      sku: 'ACC-TK-001',
      categoryNameAz: 'Aksesuar',
      daysWithoutSale: 84,
      stockQty: 38,
      tiedUpCapitalQapik: toQapik(114000), // 1,140.00 ₼
      branchName,
    },
    {
      id: 'dead-02',
      name: 'Mövsümi Yağmurluq Jilet (Sarı / S)',
      sku: 'JKT-YL-002',
      categoryNameAz: 'Jilet',
      daysWithoutSale: 72,
      stockQty: 24,
      tiedUpCapitalQapik: toQapik(132000), // 1,320.00 ₼
      branchName,
    },
    {
      id: 'dead-03',
      name: 'Klassik Dəri Kəmər (Qəhvəyi / 95)',
      sku: 'ACC-BLT-003',
      categoryNameAz: 'Aksesuar',
      daysWithoutSale: 65,
      stockQty: 42,
      tiedUpCapitalQapik: toQapik(96600), // 966.00 ₼
      branchName,
    },
    {
      id: 'dead-04',
      name: 'Uşaq Qış Şərfi və Papağı',
      sku: 'KD-SCF-004',
      categoryNameAz: 'Aksesuar',
      daysWithoutSale: 61,
      stockQty: 35,
      tiedUpCapitalQapik: toQapik(52500), // 525.00 ₼
      branchName,
    },
  ];

  const totalTiedUpCapitalQapik = toQapik(items.reduce((sum, item) => sum + item.tiedUpCapitalQapik, 0));

  return {
    items,
    totalTiedUpCapitalQapik,
    itemCount: items.length,
    isDemo: true,
  };
}

/**
 * Generate Expense Trend by Category
 */
export function generateExpenseTrend(params: DashboardFilterParams): ExpenseTrendData {
  const { isAllBranches, days } = generateMockDashboardData(params);

  const baseExpenseAzn = (isAllBranches ? 8500 : 2100) * days;
  const totalExpenseQapik = Math.round(baseExpenseAzn * 100);

  const categories: ExpenseTrendData['categories'] = [
    {
      category: 'rent',
      categoryNameAz: 'Ticarət Sahəsi İcarəsi (Mall / Küçə)',
      amountQapik: toQapik(Math.round(totalExpenseQapik * 0.48)),
      percentage: 48,
    },
    {
      category: 'salaries',
      categoryNameAz: 'Əməkhaqqı və Satış Bonusları',
      amountQapik: toQapik(Math.round(totalExpenseQapik * 0.32)),
      percentage: 32,
    },
    {
      category: 'utilities',
      categoryNameAz: 'Kommunal və Əməliyyat Məsrəfləri',
      amountQapik: toQapik(Math.round(totalExpenseQapik * 0.09)),
      percentage: 9,
    },
    {
      category: 'marketing',
      categoryNameAz: 'Marketinq və Reklam Xərcləri',
      amountQapik: toQapik(Math.round(totalExpenseQapik * 0.07)),
      percentage: 7,
    },
    {
      category: 'logistics',
      categoryNameAz: 'Daxili Daşınma və Loqistika',
      amountQapik: toQapik(Math.round(totalExpenseQapik * 0.04)),
      percentage: 4,
    },
  ];

  const timeline = [
    { label: 'Həftə 1', amountQapik: toQapik(Math.round(totalExpenseQapik * 0.26)) },
    { label: 'Həftə 2', amountQapik: toQapik(Math.round(totalExpenseQapik * 0.24)) },
    { label: 'Həftə 3', amountQapik: toQapik(Math.round(totalExpenseQapik * 0.25)) },
    { label: 'Həftə 4', amountQapik: toQapik(Math.round(totalExpenseQapik * 0.25)) },
  ];

  return {
    categories,
    totalExpenseQapik: toQapik(totalExpenseQapik),
    timeline,
    isDemo: true,
  };
}

/**
 * Generate Operations Status: Open POs, Transfers, Registers today
 */
export function generateOperationsStatus(params: DashboardFilterParams): OperationsStatusData {
  const registers: OperationsStatusData['registers'] = [
    {
      id: 'reg-01',
      registerNumber: 'KASSA-28M-01',
      branchName: '28 May Filialı',
      cashierName: 'Aysel Quliyeva',
      status: 'open',
      expectedCashQapik: toQapik(84500), // 845.00 ₼
      actualCashQapik: toQapik(84500),
      discrepancyQapik: toQapik(0),
    },
    {
      id: 'reg-02',
      registerNumber: 'KASSA-GNM-01',
      branchName: 'Gənclik Mall Filialı',
      cashierName: 'Nicat Məmmədov',
      status: 'open',
      expectedCashQapik: toQapik(124000), // 1,240.00 ₼
      actualCashQapik: toQapik(123460), // 1,234.60 ₼
      discrepancyQapik: toQapik(-540), // -5.40 ₼ deficit
    },
    {
      id: 'reg-03',
      registerNumber: 'KASSA-DNZ-01',
      branchName: 'Dəniz Mall Filialı',
      cashierName: 'Nərgiz Əliyeva',
      status: 'open',
      expectedCashQapik: toQapik(98000),
      actualCashQapik: toQapik(98000),
      discrepancyQapik: toQapik(0),
    },
    {
      id: 'reg-04',
      registerNumber: 'KASSA-NZM-01',
      branchName: 'Nizami Filialı',
      cashierName: 'Elmir Babayev',
      status: 'open',
      expectedCashQapik: toQapik(76000),
      actualCashQapik: toQapik(76200),
      discrepancyQapik: toQapik(200), // +2.00 ₼ surplus
    },
  ];

  const filteredRegisters = params.branchId === 'all'
    ? registers
    : registers.filter((r) => r.branchName.toLowerCase().includes(params.branchId.replace('branch_', '')));

  const totalCashDiscrepancyQapik = toQapik(filteredRegisters.reduce((sum, r) => sum + r.discrepancyQapik, 0));

  return {
    openPurchaseOrdersCount: 4,
    openPurchaseOrdersAmountQapik: toQapik(4280000), // 42,800.00 ₼
    inTransitTransfersCount: 3,
    inTransitUnitsCount: 148,
    openRegistersCount: filteredRegisters.length,
    totalRegistersCount: filteredRegisters.length,
    totalCashDiscrepancyQapik,
    registers: filteredRegisters,
    isDemo: true,
  };
}

/**
 * Generate Recent Activities feed (Refunds, cancellations, stock adjustments, high discounts)
 */
export function generateDashboardActivities(params: DashboardFilterParams): DashboardActivitiesData {
  const branchName = params.branchId !== 'all'
    ? BRANCH_NAMES_MAP[params.branchId]?.name || 'Gənclik Mall'
    : '28 May Filialı';

  const activities: DashboardActivitiesData['activities'] = [
    {
      id: 'act-01',
      type: 'large_refund',
      typeLabelAz: 'Böyük Məbləğli Qaytarılma',
      title: 'Çek #CK-28M-2026-00412 qaytarılması',
      description: 'Müştəri tərəfindən 2 ədəd Yun Palto geri qaytarıldı. Qaytarılma aktı təsdiqləndi.',
      amountQapik: toQapik(49800), // 498.00 ₼
      branchName,
      userName: 'Aysel Quliyeva (Kassir)',
      timestamp: '2026-10-10T16:24:00',
      severity: 'warning',
    },
    {
      id: 'act-02',
      type: 'high_discount',
      typeLabelAz: 'Xüsusi Endirim (Limitdən artıq)',
      title: 'Menecer icazəsi ilə 25% endirim',
      description: 'VIP loyallıq müştərisi üçün standart 10% limiti aşan 25% endirim tətbiq edildi.',
      amountQapik: toQapik(12500), // 125.00 ₼
      branchName: 'Gənclik Mall Filialı',
      userName: 'Kənan Əhmədov (Filial Meneceri)',
      timestamp: '2026-10-10T15:40:00',
      severity: 'info',
    },
    {
      id: 'act-03',
      type: 'cancellation',
      typeLabelAz: 'Kassa Çekinin Ləğvi',
      title: 'Çek #CK-GNM-2026-00389 ləğv edildi',
      description: 'Ödəniş terminalı xətası səbəbindən çek kassir tərəfindən rədd edildi və yenidən vuruldu.',
      amountQapik: toQapik(18450), // 184.50 ₼
      branchName: 'Gənclik Mall Filialı',
      userName: 'Nicat Məmmədov (Kassir)',
      timestamp: '2026-10-10T14:15:00',
      severity: 'warning',
    },
    {
      id: 'act-04',
      type: 'stock_adjustment',
      typeLabelAz: 'Manual Sayım Düzəlişi',
      title: 'Mərkəzi anbar sayım aktı #SA-2026-024',
      description: 'İllik inventarizasiya nəticəsində 3 ədəd köynək defisit qeydə alındı və silindi.',
      amountQapik: toQapik(12600), // 126.00 ₼
      branchName: 'Mərkəzi Anbar',
      userName: 'Samir İsmayılov (Anbardar)',
      timestamp: '2026-10-10T11:30:00',
      severity: 'danger',
    },
  ];

  return {
    activities,
    isDemo: true,
  };
}
