import { Qapik, toQapik } from '../../../shared/utils/money';
import {
  PromotionRule,
  CartSimulationInput,
  PromotionSimulationResult,
  ItemSimulationResult,
  AppliedPromotionDetail,
} from '../types';

export interface PromotionConflictWarning {
  rule1Id: string;
  rule1Code: string;
  rule1Name: string;
  rule2Id: string;
  rule2Code: string;
  rule2Name: string;
  conflictType: 'dates_and_scope_overlap' | 'exclusive_overlap' | 'priority_tie';
  message: string;
}

/**
 * Checks if two date intervals [start1, end1] and [start2, end2] overlap
 */
export function areDatesOverlapping(start1: string, end1: string, start2: string, end2: string): boolean {
  return start1 <= end2 && end1 >= start2;
}

/**
 * Detects overlapping or conflicting active promotion rules
 */
export function detectRuleConflicts(rules: PromotionRule[]): PromotionConflictWarning[] {
  const activeRules = rules.filter((r) => r.isActive);
  const conflicts: PromotionConflictWarning[] = [];

  for (let i = 0; i < activeRules.length; i++) {
    for (let j = i + 1; j < activeRules.length; j++) {
      const r1 = activeRules[i];
      const r2 = activeRules[j];

      // Check date overlap
      if (!areDatesOverlapping(r1.startDate, r1.endDate, r2.startDate, r2.endDate)) {
        continue;
      }

      // Check branch overlap
      const branchOverlap =
        r1.targetBranchIds.includes('*') ||
        r2.targetBranchIds.includes('*') ||
        r1.targetBranchIds.some((b) => r2.targetBranchIds.includes(b));

      if (!branchOverlap) {
        continue;
      }

      // Check product / category overlap
      const hasDirectProductOverlap =
        (r1.eligibleProductIds.length === 0 && r2.eligibleProductIds.length === 0) ||
        r1.eligibleProductIds.some((p) => r2.eligibleProductIds.includes(p));

      const hasCategoryOverlap =
        (r1.eligibleCategoryIds.length === 0 && r2.eligibleCategoryIds.length === 0) ||
        r1.eligibleCategoryIds.some((c) => r2.eligibleCategoryIds.includes(c));

      const hasScopeOverlap = hasDirectProductOverlap || hasCategoryOverlap;

      if (hasScopeOverlap) {
        if (r1.priorityRank === r2.priorityRank) {
          conflicts.push({
            rule1Id: r1.id,
            rule1Code: r1.code,
            rule1Name: r1.name,
            rule2Id: r2.id,
            rule2Code: r2.code,
            rule2Name: r2.name,
            conflictType: 'priority_tie',
            message: `"${r1.name}" və "${r2.name}" eyni prioritetə (${r1.priorityRank}) və üst-üstə düşən tarix/məhsul sahəsinə malikdir.`,
          });
        } else if (r1.isExclusive || r2.isExclusive) {
          conflicts.push({
            rule1Id: r1.id,
            rule1Code: r1.code,
            rule1Name: r1.name,
            rule2Id: r2.id,
            rule2Code: r2.code,
            rule2Name: r2.name,
            conflictType: 'exclusive_overlap',
            message: `Eksklüziv qayda ilə paralel tətbiq: "${r1.name}" və "${r2.name}". Yalnız yüksək prioritetli qayda tətbiq olunacaq.`,
          });
        } else if (!r1.canStack && !r2.canStack) {
          conflicts.push({
            rule1Id: r1.id,
            rule1Code: r1.code,
            rule1Name: r1.name,
            rule2Id: r2.id,
            rule2Code: r2.code,
            rule2Name: r2.name,
            conflictType: 'dates_and_scope_overlap',
            message: `Qaydaların hər ikisi "Üst-üstə tətbiq edilmir" təyin edilib. Prioritetə əsasən tənzimlənəcək.`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Pure server-rule engine simulation for promotion rules and cart calculation.
 * The client simulator executes this exact deterministic logic without mutating cart state.
 */
export function simulatePromotionEngine(
  cart: CartSimulationInput,
  rules: PromotionRule[],
  options: {
    canViewCost?: boolean;
    simulationDate?: string;
  } = {}
): PromotionSimulationResult {
  const currentDate = options.simulationDate || new Date().toISOString().split('T')[0];
  const canViewCost = Boolean(options.canViewCost);

  // Initialize line item states
  const itemStates = new Map<
    string,
    {
      item: CartSimulationInput['items'][0];
      originalTotalQapik: Qapik;
      currentTotalQapik: Qapik;
      discountQapik: Qapik;
      isLockedExclusive: boolean;
      appliedRuleIds: string[];
    }
  >();

  let cartSubtotalQapik: Qapik = toQapik(0);

  for (const item of cart.items) {
    const itemTotal = toQapik(item.unitPriceQapik * item.quantity);
    cartSubtotalQapik = toQapik(cartSubtotalQapik + itemTotal);
    itemStates.set(item.id, {
      item,
      originalTotalQapik: itemTotal,
      currentTotalQapik: itemTotal,
      discountQapik: toQapik(0),
      isLockedExclusive: false,
      appliedRuleIds: [],
    });
  }

  // Filter and sort active rules by priorityRank ascending (1 is highest priority)
  const applicableRules = rules
    .filter((r) => {
      if (!r.isActive) return false;
      if (r.startDate > currentDate || r.endDate < currentDate) return false;
      if (
        !r.targetBranchIds.includes('*') &&
        cart.branchId &&
        !r.targetBranchIds.includes(cart.branchId)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.priorityRank - b.priorityRank);

  const appliedRulesList: AppliedPromotionDetail[] = [];

  for (const rule of applicableRules) {
    // Check minimum cart amount condition
    if (rule.minCartAmountQapik && cartSubtotalQapik < rule.minCartAmountQapik) {
      continue;
    }

    // Check loyalty tier condition if applicable
    if (rule.ruleType === 'loyalty_discount' && rule.targetTiers && rule.targetTiers.length > 0) {
      if (!cart.customerTier || !rule.targetTiers.includes(cart.customerTier.toLowerCase())) {
        continue;
      }
    }

    // Find eligible items for this rule
    const eligibleItemIds: string[] = [];

    for (const [id, state] of itemStates.entries()) {
      if (state.isLockedExclusive) continue;
      // If rule cannot stack, skip items that already have discounts
      if (!rule.canStack && state.appliedRuleIds.length > 0) continue;

      // Exclusions check
      if (rule.excludedProductIds.includes(state.item.productId)) continue;

      // Eligibility checks
      const matchesProduct =
        rule.eligibleProductIds.length === 0 ||
        rule.eligibleProductIds.includes(state.item.productId);
      const matchesCategory =
        rule.eligibleCategoryIds.length === 0 ||
        rule.eligibleCategoryIds.includes(state.item.categoryId);
      const matchesBrand =
        rule.eligibleBrandIds.length === 0 ||
        rule.eligibleBrandIds.includes(state.item.brandId);

      if (matchesProduct && matchesCategory && matchesBrand) {
        eligibleItemIds.push(id);
      }
    }

    if (eligibleItemIds.length === 0) {
      continue;
    }

    let ruleDiscountTotalQapik = toQapik(0);
    const affectedItemIds: string[] = [];

    // Calculate discount based on rule type
    if (rule.ruleType === 'percentage' || rule.ruleType === 'loyalty_discount') {
      const percent = rule.discountPercent || 0;
      if (percent > 0) {
        for (const itemId of eligibleItemIds) {
          const state = itemStates.get(itemId)!;
          if (state.currentTotalQapik <= 0) continue;

          const itemDisc = toQapik(Math.round((state.currentTotalQapik * percent) / 100));
          if (itemDisc > 0) {
            state.discountQapik = toQapik(state.discountQapik + itemDisc);
            state.currentTotalQapik = toQapik(Math.max(0, state.currentTotalQapik - itemDisc));
            state.appliedRuleIds.push(rule.id);
            if (rule.isExclusive) state.isLockedExclusive = true;
            ruleDiscountTotalQapik = toQapik(ruleDiscountTotalQapik + itemDisc);
            affectedItemIds.push(itemId);
          }
        }
      }
    } else if (rule.ruleType === 'fixed_amount') {
      const maxDiscount = rule.discountAmountQapik || toQapik(0);
      if (maxDiscount > 0) {
        let remainingDisc = maxDiscount;
        for (const itemId of eligibleItemIds) {
          const state = itemStates.get(itemId)!;
          if (state.currentTotalQapik <= 0 || remainingDisc <= 0) continue;

          const toApply = toQapik(Math.min(state.currentTotalQapik, remainingDisc));
          state.discountQapik = toQapik(state.discountQapik + toApply);
          state.currentTotalQapik = toQapik(state.currentTotalQapik - toApply);
          state.appliedRuleIds.push(rule.id);
          if (rule.isExclusive) state.isLockedExclusive = true;
          remainingDisc = toQapik(remainingDisc - toApply);
          ruleDiscountTotalQapik = toQapik(ruleDiscountTotalQapik + toApply);
          affectedItemIds.push(itemId);
        }
      }
    } else if (rule.ruleType === 'bogo') {
      // Buy X, Get Y free / discounted
      const buyQty = rule.bogoBuyQty || 1;
      const getQty = rule.bogoGetQty || 1;
      const discPercent = rule.bogoDiscountPercent || 100;

      for (const itemId of eligibleItemIds) {
        const state = itemStates.get(itemId)!;
        const totalEligibleSets = Math.floor(state.item.quantity / (buyQty + getQty));
        if (totalEligibleSets > 0) {
          const discountedUnits = totalEligibleSets * getQty;
          const discountPerUnit = toQapik(Math.round((state.item.unitPriceQapik * discPercent) / 100));
          const totalBogoDisc = toQapik(Math.min(state.currentTotalQapik, discountedUnits * discountPerUnit));
          if (totalBogoDisc > 0) {
            state.discountQapik = toQapik(state.discountQapik + totalBogoDisc);
            state.currentTotalQapik = toQapik(Math.max(0, state.currentTotalQapik - totalBogoDisc));
            state.appliedRuleIds.push(rule.id);
            if (rule.isExclusive) state.isLockedExclusive = true;
            ruleDiscountTotalQapik = toQapik(ruleDiscountTotalQapik + totalBogoDisc);
            affectedItemIds.push(itemId);
          }
        }
      }
    } else if (rule.ruleType === 'quantity_tier') {
      // Find highest tier matching quantity
      for (const itemId of eligibleItemIds) {
        const state = itemStates.get(itemId)!;
        const matchingTier = (rule.quantityTiers || [])
          .filter((t) => state.item.quantity >= t.minQty)
          .sort((a, b) => b.minQty - a.minQty)[0];

        if (matchingTier && matchingTier.discountPercent > 0) {
          const tierDisc = toQapik(
            Math.round((state.currentTotalQapik * matchingTier.discountPercent) / 100)
          );
          if (tierDisc > 0) {
            state.discountQapik = toQapik(state.discountQapik + tierDisc);
            state.currentTotalQapik = toQapik(Math.max(0, state.currentTotalQapik - tierDisc));
            state.appliedRuleIds.push(rule.id);
            if (rule.isExclusive) state.isLockedExclusive = true;
            ruleDiscountTotalQapik = toQapik(ruleDiscountTotalQapik + tierDisc);
            affectedItemIds.push(itemId);
          }
        }
      }
    } else if (rule.ruleType === 'bundle') {
      // Bundle price check
      if (rule.bundleProducts && rule.bundleProducts.length > 0 && rule.bundlePriceQapik) {
        const hasAllProducts = rule.bundleProducts.every((pId) =>
          cart.items.some((it) => it.productId === pId)
        );
        if (hasAllProducts) {
          const bundleItems = cart.items.filter((it) => rule.bundleProducts!.includes(it.productId));
          const regularTotal = bundleItems.reduce(
            (sum, it) => sum + it.unitPriceQapik * it.quantity,
            0
          );
          if (regularTotal > rule.bundlePriceQapik) {
            const bundleDisc = toQapik(regularTotal - rule.bundlePriceQapik);
            ruleDiscountTotalQapik = bundleDisc;
            for (const bIt of bundleItems) {
              const state = itemStates.get(bIt.id);
              if (state) {
                const ratio = (bIt.unitPriceQapik * bIt.quantity) / regularTotal;
                const portion = toQapik(Math.round(bundleDisc * ratio));
                state.discountQapik = toQapik(state.discountQapik + portion);
                state.currentTotalQapik = toQapik(Math.max(0, state.currentTotalQapik - portion));
                state.appliedRuleIds.push(rule.id);
                if (rule.isExclusive) state.isLockedExclusive = true;
                affectedItemIds.push(bIt.id);
              }
            }
          }
        }
      }
    }

    // Apply max discount ceiling if rule has one
    if (rule.maxDiscountAmountQapik && ruleDiscountTotalQapik > rule.maxDiscountAmountQapik) {
      // Rescale discount to match cap
      const capRatio = rule.maxDiscountAmountQapik / ruleDiscountTotalQapik;
      ruleDiscountTotalQapik = rule.maxDiscountAmountQapik;
      for (const affId of affectedItemIds) {
        const state = itemStates.get(affId)!;
        state.discountQapik = toQapik(Math.round(state.discountQapik * capRatio));
        state.currentTotalQapik = toQapik(state.originalTotalQapik - state.discountQapik);
      }
    }

    if (ruleDiscountTotalQapik > 0) {
      appliedRulesList.push({
        ruleId: rule.id,
        ruleCode: rule.code,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        priorityRank: rule.priorityRank,
        discountAmountQapik: ruleDiscountTotalQapik,
        affectedItemIds,
      });
    }
  }

  // Compile final results & margin warnings
  const itemsResult: ItemSimulationResult[] = [];
  const marginWarnings: PromotionSimulationResult['marginWarnings'] = [];
  let totalDiscountQapik: Qapik = toQapik(0);

  for (const state of itemStates.values()) {
    const finalTotal = state.currentTotalQapik;
    const discount = state.discountQapik;
    totalDiscountQapik = toQapik(totalDiscountQapik + discount);

    const effectiveUnitPrice = toQapik(
      state.item.quantity > 0 ? Math.round(finalTotal / state.item.quantity) : 0
    );

    let isBelowCost = false;
    let costDeficitQapik: Qapik | undefined;

    if (canViewCost && state.item.costPriceQapik !== undefined) {
      if (effectiveUnitPrice < state.item.costPriceQapik) {
        isBelowCost = true;
        costDeficitQapik = toQapik(state.item.costPriceQapik - effectiveUnitPrice);
        marginWarnings.push({
          itemId: state.item.id,
          productName: state.item.productName,
          effectiveUnitPriceQapik: effectiveUnitPrice,
          costPriceQapik: state.item.costPriceQapik,
          deficitQapik: costDeficitQapik,
        });
      }
    }

    itemsResult.push({
      itemId: state.item.id,
      productName: state.item.productName,
      quantity: state.item.quantity,
      unitPriceQapik: state.item.unitPriceQapik,
      originalTotalQapik: state.originalTotalQapik,
      discountQapik: discount,
      finalTotalQapik: finalTotal,
      effectiveUnitPriceQapik: effectiveUnitPrice,
      costPriceQapik: canViewCost ? state.item.costPriceQapik : undefined,
      isBelowCost,
      costDeficitQapik,
    });
  }

  const conflicts = detectRuleConflicts(rules).map((c) => c.message);

  return {
    items: itemsResult,
    subtotalQapik: cartSubtotalQapik,
    totalDiscountQapik,
    finalPayableQapik: toQapik(Math.max(0, cartSubtotalQapik - totalDiscountQapik)),
    appliedRules: appliedRulesList,
    marginWarnings,
    conflictsDetected: conflicts,
  };
}

