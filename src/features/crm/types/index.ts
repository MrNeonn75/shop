import { Qapik } from '../../../shared/utils/money';

export type CustomerTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface ConsentHistoryEntry {
  channel: 'sms' | 'email' | 'whatsapp' | 'data_processing';
  granted: boolean;
  timestamp: string; // ISO
  source: string; // e.g. 'pos_registration', 'profile_update', 'customer_request'
}

export interface CustomerConsent {
  smsMarketing: boolean;
  emailMarketing: boolean;
  whatsappMarketing: boolean;
  dataProcessing: boolean;
  consentUpdatedAt: string;
  history: ConsentHistoryEntry[];
}

export interface Customer {
  id: string;
  customerCode: string; // e.g. "CUST-00412"
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  birthDate?: string; // YYYY-MM-DD
  tier: CustomerTier;
  pointsBalance: number;
  totalSpentQapik: Qapik;
  ordersCount: number;
  averageOrderValueQapik: Qapik;
  lastPurchaseDate?: string;
  segmentTags: string[];
  primaryBranchId: string;
  preferredCategories: string[];
  preferredSizes: string[];
  consent: CustomerConsent;
  notes: string;
  isAnonymized: boolean;
  anonymizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPurchaseHistoryItem {
  orderId: string;
  orderNumber: string;
  date: string;
  branchName: string;
  itemsCount: number;
  itemsSummary: string;
  totalAmountQapik: Qapik;
  discountAmountQapik: Qapik;
  pointsEarned: number;
  pointsRedeemed: number;
  paymentMethod: string;
}

export interface CustomerReturnHistoryItem {
  returnId: string;
  returnNumber: string;
  originalOrderNumber: string;
  date: string;
  branchName: string;
  itemsReturned: string;
  refundAmountQapik: Qapik;
  pointsReversed: number;
  reason: string;
}

export type PointsLedgerType =
  | 'earned'
  | 'redeemed'
  | 'expired'
  | 'return_reversal'
  | 'manual_adjustment'
  | 'birthday_bonus';

export interface PointsLedgerEntry {
  id: string;
  customerId: string;
  date: string;
  type: PointsLedgerType;
  pointsDelta: number; // positive (added) or negative (subtracted)
  balanceAfter: number;
  referenceType: 'order' | 'return' | 'manual' | 'system';
  referenceId?: string;
  note: string;
  createdBy: string;
}

export interface CustomerSegmentRules {
  minSpendQapik?: Qapik;
  maxSpendQapik?: Qapik;
  minOrdersCount?: number;
  lastVisitWithinDays?: number;
  tiers?: CustomerTier[];
  branches?: string[];
  requiredConsentChannel?: 'sms' | 'email' | 'whatsapp';
  categoryInterest?: string[];
}

export interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  isDynamic: boolean;
  rules: CustomerSegmentRules;
  matchedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RewardCatalogItem {
  id: string;
  title: string;
  pointsRequired: number;
  category: string;
  availableQty: number;
  description: string;
}

export interface LoyaltyProgramConfig {
  programName: string;
  version: string; // e.g. "v2.2"
  effectiveDate: string;
  earnRules: {
    qapikPerPoint: number; // e.g. 1000 Qapik (10 AZN) = 1 point
    categoryMultipliers: Record<string, number>; // Category name -> multiplier e.g. 'Ayaqqabı': 1.5
    tierMultipliers: Record<CustomerTier, number>; // e.g. platinum -> 2.0
  };
  redemptionRules: {
    pointValueQapik: number; // e.g. 50 Qapik (0.50 AZN) per point
    maxReceiptPercentage: number; // e.g. 30% of order total
    minPointsToRedeem: number;
  };
  tierRules: {
    bronzeThresholdQapik: Qapik;
    silverThresholdQapik: Qapik;
    goldThresholdQapik: Qapik;
    platinumThresholdQapik: Qapik;
    rollingPeriodMonths: number;
  };
  expiryRules: {
    pointsExpireMonths: number;
  };
  reversalRules: {
    autoReversePointsOnReturn: boolean;
    refundRedeemedPointsOnReturn: boolean;
  };
  birthdayRules: {
    bonusPoints: number;
    validityDays: number;
  };
  rewardsCatalog: RewardCatalogItem[];
}

export interface CustomerAuditLogEntry {
  id: string;
  customerId: string;
  action: 'create' | 'update' | 'merge' | 'consent_change' | 'points_adjust' | 'anonymize_request';
  actorName: string;
  actorRole: string;
  details: string;
  timestamp: string;
}

export interface LoyaltySimulationInput {
  tier: CustomerTier;
  cartTotalQapik: Qapik;
  categoryNames?: string[];
  pointsToRedeem?: number;
  isBirthday?: boolean;
}

export interface LoyaltySimulationResult {
  basePointsEarned: number;
  bonusPointsEarned: number;
  totalPointsEarned: number;
  maxRedeemablePoints: number;
  requestedPointsRedeemed: number;
  redemptionDiscountQapik: Qapik;
  finalPayableQapik: Qapik;
}

