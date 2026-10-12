import { describe, it, expect } from 'vitest';
import {
  simulatePromotionEngine,
  detectRuleConflicts,
  areDatesOverlapping,
} from '../src/features/marketing/utils/promotionEngine';
import {
  PromotionRule,
  CartSimulationInput,
} from '../src/features/marketing/types';
import { campaignSchema, promoCodeSchema } from '../src/features/marketing/schemas/marketingSchemas';
import { MockMarketingAdapter } from '../src/shared/adapters/mock/mockMarketingAdapter';
import { toQapik } from '../src/shared/utils/money';

describe('Marketing Module — Promotion Engine & Simulator', () => {
  const baseCart: CartSimulationInput = {
    branchId: 'branch-1',
    customerTier: 'gold',
    items: [
      {
        id: 'it-1',
        productId: 'prod-suit',
        productName: 'Massimo Dutti Kostyum',
        brandId: 'brand-1',
        brandName: 'Massimo Dutti',
        categoryId: 'cat-clothing',
        categoryName: 'Geyim',
        quantity: 1,
        unitPriceQapik: toQapik(30000), // 300 AZN
        costPriceQapik: toQapik(18000), // 180 AZN
      },
      {
        id: 'it-2',
        productId: 'prod-shirt',
        productName: 'Zara Köynək',
        brandId: 'brand-2',
        brandName: 'Zara',
        categoryId: 'cat-clothing',
        categoryName: 'Geyim',
        quantity: 2,
        unitPriceQapik: toQapik(5000), // 50 AZN
        costPriceQapik: toQapik(2500), // 25 AZN
      },
    ],
  };

  it('calculates percentage discounts accurately', () => {
    const rules: PromotionRule[] = [
      {
        id: 'r-pct',
        code: 'PR-PCT',
        name: 'Geyimə 20% Endirim',
        ruleType: 'percentage',
        priorityRank: 1,
        canStack: true,
        isExclusive: false,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        isActive: true,
        targetBranchIds: ['*'],
        discountPercent: 20,
        eligibleProductIds: [],
        eligibleCategoryIds: ['cat-clothing'],
        eligibleBrandIds: [],
        excludedProductIds: [],
      },
    ];

    const result = simulatePromotionEngine(baseCart, rules, {
      simulationDate: '2026-03-15',
    });

    // Subtotal: 300 + 100 = 400 AZN (40,000 Qapik)
    expect(result.subtotalQapik).toBe(toQapik(40000));
    // 20% of 400 = 80 AZN (8,000 Qapik)
    expect(result.totalDiscountQapik).toBe(toQapik(8000));
    expect(result.finalPayableQapik).toBe(toQapik(32000));
    expect(result.appliedRules).toHaveLength(1);
    expect(result.appliedRules[0].ruleCode).toBe('PR-PCT');
  });

  it('calculates BOGO (Buy 1, Get 1 at 50% discount) accurately', () => {
    const bogoCart: CartSimulationInput = {
      branchId: 'branch-1',
      items: [
        {
          id: 'it-bogo',
          productId: 'prod-shirt',
          productName: 'Zara Köynək',
          brandId: 'brand-2',
          brandName: 'Zara',
          categoryId: 'cat-clothing',
          categoryName: 'Geyim',
          quantity: 2, // 2 items -> 1 full price, 1 at 50% off
          unitPriceQapik: toQapik(6000), // 60 AZN each = 120 AZN total
          costPriceQapik: toQapik(2500),
        },
      ],
    };

    const rules: PromotionRule[] = [
      {
        id: 'r-bogo',
        code: 'PR-BOGO',
        name: '2-ci köynəyə 50% Güzəşt',
        ruleType: 'bogo',
        priorityRank: 1,
        canStack: false,
        isExclusive: false,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        isActive: true,
        targetBranchIds: ['*'],
        bogoBuyQty: 1,
        bogoGetQty: 1,
        bogoDiscountPercent: 50,
        eligibleProductIds: [],
        eligibleCategoryIds: [],
        eligibleBrandIds: [],
        excludedProductIds: [],
      },
    ];

    const result = simulatePromotionEngine(bogoCart, rules, {
      simulationDate: '2026-03-15',
    });

    // Subtotal: 120 AZN
    // Discount: 50% of 60 AZN = 30 AZN (3,000 Qapik)
    expect(result.totalDiscountQapik).toBe(toQapik(3000));
    expect(result.finalPayableQapik).toBe(toQapik(9000));
  });

  it('respects priority order and exclusive rule blocking subsequent discounts', () => {
    const rules: PromotionRule[] = [
      {
        id: 'r-excl',
        code: 'PR-EXCL',
        name: 'Eksklüziv 15% Endirim',
        ruleType: 'percentage',
        priorityRank: 1,
        canStack: false,
        isExclusive: true, // Exclusive!
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        isActive: true,
        targetBranchIds: ['*'],
        discountPercent: 15,
        eligibleProductIds: [],
        eligibleCategoryIds: [],
        eligibleBrandIds: [],
        excludedProductIds: [],
      },
      {
        id: 'r-second',
        code: 'PR-SECOND',
        name: 'Əlavə 10% Endirim',
        ruleType: 'percentage',
        priorityRank: 2,
        canStack: true,
        isExclusive: false,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        isActive: true,
        targetBranchIds: ['*'],
        discountPercent: 10,
        eligibleProductIds: [],
        eligibleCategoryIds: [],
        eligibleBrandIds: [],
        excludedProductIds: [],
      },
    ];

    const result = simulatePromotionEngine(baseCart, rules, {
      simulationDate: '2026-03-15',
    });

    // Because rule 1 is exclusive, rule 2 cannot be applied to the locked items
    expect(result.appliedRules).toHaveLength(1);
    expect(result.appliedRules[0].ruleCode).toBe('PR-EXCL');
  });

  it('triggers margin warnings when selling price falls below cost (gated by canViewCost)', () => {
    const cheapCart: CartSimulationInput = {
      branchId: 'branch-1',
      items: [
        {
          id: 'it-cheap',
          productId: 'prod-special',
          productName: 'Massimo Dutti Dəri Palto',
          brandId: 'brand-1',
          brandName: 'Massimo Dutti',
          categoryId: 'cat-clothing',
          categoryName: 'Geyim',
          quantity: 1,
          unitPriceQapik: toQapik(10000), // 100 AZN
          costPriceQapik: toQapik(7000), // 70 AZN cost
        },
      ],
    };

    // 50% discount -> selling price becomes 50 AZN, which is < 70 AZN cost!
    const steepDiscountRule: PromotionRule[] = [
      {
        id: 'r-steep',
        code: 'PR-STEEP',
        name: '50% Dərin Endirim',
        ruleType: 'percentage',
        priorityRank: 1,
        canStack: false,
        isExclusive: false,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        isActive: true,
        targetBranchIds: ['*'],
        discountPercent: 50,
        eligibleProductIds: [],
        eligibleCategoryIds: [],
        eligibleBrandIds: [],
        excludedProductIds: [],
      },
    ];

    // 1. When canViewCost is TRUE: margin warning should be generated
    const authorizedResult = simulatePromotionEngine(cheapCart, steepDiscountRule, {
      canViewCost: true,
      simulationDate: '2026-03-15',
    });

    expect(authorizedResult.marginWarnings).toHaveLength(1);
    expect(authorizedResult.marginWarnings[0].productName).toBe('Massimo Dutti Dəri Palto');
    expect(authorizedResult.marginWarnings[0].deficitQapik).toBe(toQapik(2000)); // 70 - 50 = 20 AZN

    // 2. When canViewCost is FALSE: margin warnings are suppressed
    const unauthorizedResult = simulatePromotionEngine(cheapCart, steepDiscountRule, {
      canViewCost: false,
      simulationDate: '2026-03-15',
    });

    expect(unauthorizedResult.marginWarnings).toHaveLength(0);
    expect(unauthorizedResult.items[0].costPriceQapik).toBeUndefined();
  });

  it('detects rule conflicts and date overlaps', () => {
    expect(areDatesOverlapping('2026-03-01', '2026-03-31', '2026-03-15', '2026-04-15')).toBe(true);
    expect(areDatesOverlapping('2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28')).toBe(false);

    const conflictingRules: PromotionRule[] = [
      {
        id: 'r-1',
        code: 'PR-1',
        name: 'Qayda A',
        ruleType: 'percentage',
        priorityRank: 1,
        canStack: false,
        isExclusive: false,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        isActive: true,
        targetBranchIds: ['*'],
        discountPercent: 15,
        eligibleProductIds: [],
        eligibleCategoryIds: [],
        eligibleBrandIds: [],
        excludedProductIds: [],
      },
      {
        id: 'r-2',
        code: 'PR-2',
        name: 'Qayda B',
        ruleType: 'fixed_amount',
        priorityRank: 1, // Same priority tie!
        canStack: false,
        isExclusive: false,
        startDate: '2026-03-15',
        endDate: '2026-04-15',
        isActive: true,
        targetBranchIds: ['*'],
        discountAmountQapik: toQapik(2000),
        eligibleProductIds: [],
        eligibleCategoryIds: [],
        eligibleBrandIds: [],
        excludedProductIds: [],
      },
    ];

    const conflicts = detectRuleConflicts(conflictingRules);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflictType).toBe('priority_tie');
  });

  it('validates campaign schema properly (start <= end date)', () => {
    const valid = campaignSchema.safeParse({
      name: 'Yaz Kampaniyası 2026',
      objective: 'sales_volume',
      type: 'seasonal',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      budgetAzn: 5000,
      targetBranchIds: ['branch-1'],
    });
    expect(valid.success).toBe(true);

    const invalidDates = campaignSchema.safeParse({
      name: 'Xətalı Kampaniya',
      objective: 'sales_volume',
      type: 'seasonal',
      startDate: '2026-05-01',
      endDate: '2026-03-01', // start > end!
      budgetAzn: 5000,
      targetBranchIds: ['branch-1'],
    });
    expect(invalidDates.success).toBe(false);
  });

  it('validates promoCodeSchema properly', () => {
    const valid = promoCodeSchema.safeParse({
      code: 'SPRING2026',
      promotionRuleId: 'pr-1',
      discountDescription: 'Bahar endirimi 15%',
      totalUsageLimit: 100,
      perCustomerLimit: 1,
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      targetBranchIds: ['*'],
      targetSegmentIds: ['all'],
    });
    expect(valid.success).toBe(true);

    const invalid = promoCodeSchema.safeParse({
      code: 'ab', // too short
      promotionRuleId: '',
      discountDescription: '',
      totalUsageLimit: 0,
      perCustomerLimit: 0,
      startDate: '2026-05-01',
      endDate: '2026-03-01',
      targetBranchIds: [],
      targetSegmentIds: [],
    });
    expect(invalid.success).toBe(false);
  });
});

describe('Marketing Module — Adapter Operations', () => {
  const adapter = new MockMarketingAdapter();

  it('creates and lists campaigns', async () => {
    const created = await adapter.createCampaign({
      name: 'Test Kampaniyası',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      budgetQapik: toQapik(500000),
    });

    expect(created.id).toBeDefined();
    expect(created.code).toMatch(/^CMP-2026-/);
    expect(created.status).toBe('draft');

    const list = await adapter.getCampaigns();
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  it('updates campaign status with reason tracking', async () => {
    const list = await adapter.getCampaigns();
    const camp = list[0];
    const updated = await adapter.updateCampaignStatus(camp.id, 'approved');
    expect(updated.status).toBe('approved');
  });

  it('generates bulk alphanumeric promo codes', async () => {
    const bulk = await adapter.generateBulkPromoCodes('VIP', 5, {
      promotionRuleId: 'pr-1',
      discountDescription: 'VIP kupon',
    });

    expect(bulk).toHaveLength(5);
    bulk.forEach((code) => {
      expect(code.code).toMatch(/^VIP-[A-Z0-9]+$/);
      expect(code.totalUsageLimit).toBe(1);
    });
  });
});

