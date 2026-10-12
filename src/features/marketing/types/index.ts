import { Qapik } from '../../../shared/utils/money';

export type CampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'ended'
  | 'rejected';

export type CampaignObjective =
  | 'brand_awareness'
  | 'traffic'
  | 'sales_volume'
  | 'clearance'
  | 'loyalty_engagement'
  | 'new_collection';

export type CampaignType =
  | 'seasonal'
  | 'product'
  | 'category'
  | 'brand'
  | 'branch_specific'
  | 'loyalty'
  | 'promo_code';

export interface Campaign {
  id: string;
  code: string;
  name: string;
  objective: CampaignObjective;
  type: CampaignType;
  status: CampaignStatus;
  startDate: string; // ISO date 'YYYY-MM-DD'
  endDate: string; // ISO date 'YYYY-MM-DD'
  budgetQapik: Qapik;
  spentQapik: Qapik;
  attributedSalesQapik: Qapik;
  targetBranchIds: string[]; // ['*'] represents all branches
  targetSegmentIds: string[]; // ['*'] represents all segments
  eligibleBrandIds: string[];
  eligibleCategoryIds: string[];
  eligibleProductIds: string[];
  excludedProductIds: string[];
  description: string;
  rejectionReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type PromotionRuleType =
  | 'percentage'
  | 'fixed_amount'
  | 'bogo'
  | 'quantity_tier'
  | 'bundle'
  | 'loyalty_discount';

export interface QuantityTier {
  minQty: number;
  discountPercent: number;
}

export interface PromotionRule {
  id: string;
  code: string;
  name: string;
  ruleType: PromotionRuleType;
  priorityRank: number; // 1 = highest priority
  canStack: boolean; // can stack with other non-exclusive promotions
  isExclusive: boolean; // stops other discounts from applying
  startDate: string;
  endDate: string;
  isActive: boolean;
  targetBranchIds: string[]; // ['*'] for all branches
  minCartAmountQapik?: Qapik;
  maxDiscountAmountQapik?: Qapik;
  
  // Specific rule parameters
  discountPercent?: number; // For 'percentage' or 'loyalty_discount'
  discountAmountQapik?: Qapik; // For 'fixed_amount'
  bogoBuyQty?: number; // Buy X
  bogoGetQty?: number; // Get Y
  bogoDiscountPercent?: number; // 100 for free, 50 for 50% off
  quantityTiers?: QuantityTier[]; // For 'quantity_tier'
  bundleProducts?: string[]; // Product IDs required for bundle
  bundlePriceQapik?: Qapik; // Total price for bundle
  targetTiers?: string[]; // ['bronze', 'silver', 'gold', 'platinum'] for loyalty_discount

  // Eligibility and exclusions
  eligibleProductIds: string[];
  eligibleCategoryIds: string[];
  eligibleBrandIds: string[];
  excludedProductIds: string[];
  description?: string;
}

export type PromoCodeStatus = 'active' | 'expired' | 'exhausted' | 'disabled';

export interface PromoCode {
  id: string;
  code: string;
  campaignId?: string;
  promotionRuleId: string;
  discountDescription: string;
  totalUsageLimit: number;
  usedCount: number;
  perCustomerLimit: number;
  startDate: string;
  endDate: string;
  targetBranchIds: string[];
  targetSegmentIds: string[];
  status: PromoCodeStatus;
  createdAt: string;
}

export interface PromoCodeRedemption {
  id: string;
  promoCode: string;
  orderId: string;
  customerPhone: string;
  customerName: string;
  discountAppliedQapik: Qapik;
  branchName: string;
  redeemedAt: string;
}

export interface BranchPerformanceBreakdown {
  branchId: string;
  branchName: string;
  revenueQapik: Qapik;
  discountCostQapik: Qapik;
  units: number;
}

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  period: { start: string; end: string };
  totalRevenueQapik: Qapik;
  unitsSold: number;
  totalDiscountCostQapik: Qapik;
  grossMarginQapik?: Qapik;
  grossMarginPercent?: number;
  spendRoiPercent?: number;
  hasSufficientCostData: boolean;
  missingDataReasons?: string[];
  baselineRevenueQapik: Qapik;
  revenueLiftPercent: number;
  branchBreakdown: BranchPerformanceBreakdown[];
  funnel: {
    impressionsOrAudience: number;
    codesIssuedOrEngaged: number;
    redemptions: number;
    conversions: number;
  };
}

export interface CommunicationTemplate {
  id: string;
  name: string;
  channel: 'sms' | 'email' | 'whatsapp';
  subject?: string;
  body: string;
  category: 'promotional' | 'transactional' | 'loyalty';
  updatedAt: string;
}

export interface CommunicationCampaign {
  id: string;
  title: string;
  channel: 'sms' | 'email' | 'whatsapp';
  templateId: string;
  targetSegmentId: string;
  audienceTotalCount: number;
  consentingCount: number;
  optedOutCount: number;
  providerStatus: 'unconfigured' | 'active'; // In our architecture: 'unconfigured' -> "Konfiqurasiya olunmayıb"
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  scheduledFor?: string;
  createdAt: string;
}

export interface CartSimulationItem {
  id: string;
  productId: string;
  productName: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  unitPriceQapik: Qapik;
  costPriceQapik?: Qapik;
}

export interface CartSimulationInput {
  branchId: string;
  customerTier?: string;
  promoCode?: string;
  items: CartSimulationItem[];
}

export interface AppliedPromotionDetail {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  ruleType: PromotionRuleType;
  priorityRank: number;
  discountAmountQapik: Qapik;
  affectedItemIds: string[];
}

export interface ItemSimulationResult {
  itemId: string;
  productName: string;
  quantity: number;
  unitPriceQapik: Qapik;
  originalTotalQapik: Qapik;
  discountQapik: Qapik;
  finalTotalQapik: Qapik;
  effectiveUnitPriceQapik: Qapik;
  costPriceQapik?: Qapik;
  isBelowCost: boolean;
  costDeficitQapik?: Qapik;
}

export interface PromotionSimulationResult {
  items: ItemSimulationResult[];
  subtotalQapik: Qapik;
  totalDiscountQapik: Qapik;
  finalPayableQapik: Qapik;
  appliedRules: AppliedPromotionDetail[];
  marginWarnings: Array<{
    itemId: string;
    productName: string;
    effectiveUnitPriceQapik: Qapik;
    costPriceQapik: Qapik;
    deficitQapik: Qapik;
  }>;
  conflictsDetected: string[];
}

