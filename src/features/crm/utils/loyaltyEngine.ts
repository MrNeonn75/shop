import { Qapik, toQapik } from '../../../shared/utils/money';
import {
  CustomerTier,
  LoyaltyProgramConfig,
  LoyaltySimulationInput,
  LoyaltySimulationResult,
} from '../types';

/**
 * Pure deterministic calculation for loyalty point accrual and redemption.
 */
export function simulateLoyaltyCalculation(
  input: LoyaltySimulationInput,
  config: LoyaltyProgramConfig
): LoyaltySimulationResult {
  const { cartTotalQapik, tier, categoryNames = [], pointsToRedeem = 0, isBirthday = false } = input;

  // 1. Accrual Calculation
  const qapikPerPoint = config.earnRules.qapikPerPoint || 1000; // default 10 AZN = 1 pt
  const rawPoints = Math.floor(cartTotalQapik / qapikPerPoint);

  // Tier multiplier
  const tierMultiplier = config.earnRules.tierMultipliers[tier] || 1.0;

  // Category multiplier (highest applicable)
  let maxCatMultiplier = 1.0;
  for (const cat of categoryNames) {
    if (config.earnRules.categoryMultipliers[cat] && config.earnRules.categoryMultipliers[cat] > maxCatMultiplier) {
      maxCatMultiplier = config.earnRules.categoryMultipliers[cat];
    }
  }

  const combinedMultiplier = Math.max(tierMultiplier, maxCatMultiplier);
  const basePointsEarned = Math.floor(rawPoints * 1.0);
  const bonusFromMultiplier = Math.floor(rawPoints * (combinedMultiplier - 1.0));
  const birthdayBonus = isBirthday ? config.birthdayRules.bonusPoints : 0;
  const totalPointsEarned = basePointsEarned + bonusFromMultiplier + birthdayBonus;

  // 2. Redemption Calculation
  const pointValueQapik = config.redemptionRules.pointValueQapik; // e.g. 50 Qapik
  const maxReceiptPercent = config.redemptionRules.maxReceiptPercentage; // e.g. 30%
  const maxRedeemableAmountQapik = toQapik(
    Math.round((cartTotalQapik * maxReceiptPercent) / 100)
  );

  const maxRedeemablePoints =
    pointValueQapik > 0
      ? Math.floor(maxRedeemableAmountQapik / pointValueQapik)
      : 0;

  const actualPointsToRedeem = Math.max(0, Math.min(pointsToRedeem, maxRedeemablePoints));
  const redemptionDiscountQapik = toQapik(actualPointsToRedeem * pointValueQapik);
  const finalPayableQapik = toQapik(Math.max(0, cartTotalQapik - redemptionDiscountQapik));

  return {
    basePointsEarned,
    bonusPointsEarned: bonusFromMultiplier + birthdayBonus,
    totalPointsEarned,
    maxRedeemablePoints,
    requestedPointsRedeemed: actualPointsToRedeem,
    redemptionDiscountQapik,
    finalPayableQapik,
  };
}

/**
 * Determine customer tier from rolling 12-month spend
 */
export function evaluateCustomerTier(
  spend12MonthsQapik: Qapik,
  config: LoyaltyProgramConfig
): CustomerTier {
  if (spend12MonthsQapik >= config.tierRules.platinumThresholdQapik) {
    return 'platinum';
  }
  if (spend12MonthsQapik >= config.tierRules.goldThresholdQapik) {
    return 'gold';
  }
  if (spend12MonthsQapik >= config.tierRules.silverThresholdQapik) {
    return 'silver';
  }
  return 'bronze';
}

/**
 * Calculate reversed points and refunded points on return
 */
export function calculateReturnReversal(
  orderPointsEarned: number,
  orderPointsRedeemed: number,
  returnRatio: number
): {
  pointsToDeduct: number;
  pointsToRefund: number;
} {
  const pointsToDeduct = Math.round(orderPointsEarned * returnRatio);
  const pointsToRefund = Math.round(orderPointsRedeemed * returnRatio);
  return { pointsToDeduct, pointsToRefund };
}

