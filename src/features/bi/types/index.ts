export interface BranchRankingItem {
  branchId: string;
  branchName: string;
  salesAzn: number;
  sharePercent: number;
  targetAzn: number;
  achievementPercent: number;
  ordersCount: number;
}

export interface SectionMixItem {
  section: string;
  salesAzn: number;
  sharePercent: number;
  marginPercent: number;
}

export interface ProductCohortItem {
  sku: string;
  name: string;
  brand: string;
  category: string;
  unitsSold: number;
  revenueAzn: number;
  growthPercent: number;
  rank: number;
}

export interface PeriodComparisonSummary {
  metric: string;
  currentValue: number;
  previousValue: number;
  varianceAbsolute: number;
  variancePercent: number;
  isPositive: boolean;
}

export interface SeasonSellThroughItem {
  season: string;
  collection: string;
  initialStockQty: number;
  soldQty: number;
  currentStockQty: number;
  strPercent: number;
  status: 'optimal' | 'slow' | 'fast';
}

export interface MarkdownCandidateItem {
  sku: string;
  name: string;
  brand: string;
  category: string;
  ageDays: number;
  currentStock: number;
  costPriceAzn: number;
  retailPriceAzn: number;
  strPercent: number;
  suggestedDiscountPercent: number;
  reason: string;
}

export interface ReorderSuggestionItem {
  sku: string;
  name: string;
  brand: string;
  currentStock: number;
  safetyStock: number;
  leadTimeDays: number;
  dailyVelocity: number;
  suggestedReorderQty: number;
  explanation: {
    safetyStockInput: number;
    leadTimeDaysInput: number;
    dailyVelocityInput: number;
    formulaText: string;
  };
}

export interface RfmSegmentItem {
  segmentName: string;
  customerCount: number;
  avgSpentAzn: number;
  sharePercent: number;
  description: string;
}

export interface BasketAssociationItem {
  productA: string;
  productB: string;
  coOccurrenceCount: number;
  confidencePercent: number;
  liftScore: number;
}

export interface ChurnRiskCustomerItem {
  customerId: string;
  name: string;
  phone: string;
  daysSinceLastPurchase: number;
  ordersCount: number;
  ltvAzn: number;
  riskLevel: 'high' | 'medium';
}

export interface AnomalyItem {
  id: string;
  type: 'discount' | 'return' | 'cash_variance' | 'stock_adjustment';
  title: string;
  description: string;
  detectedAt: string;
  severity: 'warning' | 'critical';
  evidenceUrl: string;
  detectionCriteria: string;
  actorName: string;
  branchName: string;
  varianceAzn?: number;
}

export interface ChartAnnotation {
  id: string;
  date: string;
  title: string;
  note: string;
  author: string;
  type: 'campaign' | 'manager_note';
}

export interface ExecutiveBiData {
  generatedAt: string;
  isDemo: boolean;
  periodSummary: {
    currentSalesAzn: number;
    previousSalesAzn: number;
    growthPercent: number;
    targetAchievementPercent: number;
  };
  periodComparisons: PeriodComparisonSummary[];
  branchRankings: BranchRankingItem[];
  sectionMix: SectionMixItem[];
  topProductCohorts: ProductCohortItem[];
  annotations: ChartAnnotation[];
}

export interface InventoryIntelligenceData {
  generatedAt: string;
  isDemo: boolean;
  inventoryTurnover: number;
  daysOfInventory: number;
  totalStockValueAzn: number;
  deadStockValueAzn: number;
  seasonSellThrough: SeasonSellThroughItem[];
  markdownCandidates: MarkdownCandidateItem[];
  reorderSuggestions: ReorderSuggestionItem[];
}

export interface CustomerAnalyticsData {
  generatedAt: string;
  isDemo: boolean;
  newVsReturning: {
    newCustomerCount: number;
    returningCustomerCount: number;
    newSharePercent: number;
    returningSharePercent: number;
  };
  rfmSegments: RfmSegmentItem[];
  ltvDistribution: Array<{ tierRange: string; customerCount: number; totalLtvAzn: number }>;
  basketAssociations: BasketAssociationItem[];
  churnRiskCustomers: ChurnRiskCustomerItem[];
}

export interface ProfitabilityData {
  generatedAt: string;
  isDemo: boolean;
  activeCogsMethod: string;
  totalRevenueAzn: number;
  cogsAzn: number;
  grossProfitAzn: number;
  grossMarginPercent: number;
  discountLeakageAzn: number;
  returnCostAzn: number;
  marginByBrand: Array<{ brand: string; revenueAzn: number; cogsAzn: number; grossProfitAzn: number; marginPercent: number }>;
  marginByCategory: Array<{ category: string; revenueAzn: number; cogsAzn: number; grossProfitAzn: number; marginPercent: number }>;
}

