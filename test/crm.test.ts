import { describe, it, expect } from 'vitest';
import { maskPhone, maskEmail } from '../src/features/crm/utils/piiMasking';
import {
  matchesSegmentRules,
  findPotentialDuplicates,
} from '../src/features/crm/utils/segmentEvaluator';
import {
  simulateLoyaltyCalculation,
  evaluateCustomerTier,
  calculateReturnReversal,
} from '../src/features/crm/utils/loyaltyEngine';
import {
  Customer,
  LoyaltyProgramConfig,
  CustomerSegmentRules,
} from '../src/features/crm/types';
import {
  customerQuickCreateSchema,
  customerSegmentSchema,
  pointsAdjustmentSchema,
} from '../src/features/crm/schemas/crmSchemas';
import { MockCrmAdapter } from '../src/shared/adapters/mock/mockCrmAdapter';
import { toQapik } from '../src/shared/utils/money';

describe('CRM Module — PII Masking Utility', () => {
  it('masks phone number when reveal is false and reveals when true', () => {
    const phone = '+994 50 123 45 67';
    expect(maskPhone(phone, false)).toBe('+994 5 *** ** 67');
    expect(maskPhone(phone, true)).toBe('+994 50 123 45 67');
  });

  it('masks email when reveal is false and reveals when true', () => {
    const email = 'rashad.aliyev@example.com';
    expect(maskEmail(email, false)).toBe('r***v@example.com');
    expect(maskEmail(email, true)).toBe('rashad.aliyev@example.com');
  });

  it('handles empty or short contact strings gracefully', () => {
    expect(maskPhone('', false)).toBe('-');
    expect(maskEmail('', false)).toBe('-');
    expect(maskEmail('a@b.com', false)).toBe('a***@b.com');
  });
});

describe('CRM Module — Segment Evaluator & Duplicate Detector', () => {
  const sampleCustomer: Customer = {
    id: 'cust-1',
    customerCode: 'CUST-001',
    firstName: 'Leyla',
    lastName: 'Məmmədova',
    phone: '+994 50 222 33 44',
    email: 'leyla@example.com',
    tier: 'gold',
    pointsBalance: 450,
    totalSpentQapik: toQapik(150000), // 1500 AZN
    ordersCount: 8,
    averageOrderValueQapik: toQapik(18750),
    lastPurchaseDate: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().slice(0, 10), // 5 days ago
    primaryBranchId: 'branch-1',
    preferredCategories: ['Kostyumlar'],
    preferredSizes: ['M'],
    consent: {
      smsMarketing: true,
      emailMarketing: false,
      whatsappMarketing: true,
      dataProcessing: true,
      consentUpdatedAt: '2026-01-01T00:00:00Z',
      history: [],
    },
    segmentTags: ['vip', 'fashion'],
    notes: '',
    isAnonymized: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('matches customer matching spend, order, recency, and tier criteria', () => {
    const rules: CustomerSegmentRules = {
      minSpendQapik: toQapik(100000), // 1000 AZN
      minOrdersCount: 5,
      lastVisitWithinDays: 30,
      tiers: ['gold', 'platinum'],
      requiredConsentChannel: 'sms',
    };
    expect(matchesSegmentRules(sampleCustomer, rules)).toBe(true);
  });

  it('rejects customer failing consent channel requirement', () => {
    const rules: CustomerSegmentRules = {
      requiredConsentChannel: 'email', // customer has emailMarketing: false
    };
    expect(matchesSegmentRules(sampleCustomer, rules)).toBe(false);
  });

  it('rejects customer not meeting minimum spend threshold', () => {
    const rules: CustomerSegmentRules = {
      minSpendQapik: toQapik(300000), // 3000 AZN > 1500 AZN
    };
    expect(matchesSegmentRules(sampleCustomer, rules)).toBe(false);
  });

  it('detects duplicate customer by phone or email', () => {
    const list: Customer[] = [sampleCustomer];

    const dupPhone = findPotentialDuplicates({ phone: '+994 50 222 33 44' }, list);
    expect(dupPhone).toHaveLength(1);
    expect(dupPhone[0].id).toBe('cust-1');

    const dupEmail = findPotentialDuplicates({ phone: '+994 50 999 99 99', email: 'leyla@example.com' }, list);
    expect(dupEmail).toHaveLength(1);
    expect(dupEmail[0].id).toBe('cust-1');

    const noDup = findPotentialDuplicates({ phone: '+994 55 999 99 99', email: 'other@example.com' }, list);
    expect(noDup).toHaveLength(0);
  });
});

describe('CRM Module — Loyalty Engine Calculations', () => {
  const loyaltyConfig: LoyaltyProgramConfig = {
    programName: 'Brand House Loyallıq',
    version: 'v2.2',
    effectiveDate: '2026-01-01',
    earnRules: {
      qapikPerPoint: 1000, // 10 AZN = 1 point
      categoryMultipliers: {
        Kostyumlar: 2.0, // 2x on suits
      },
      tierMultipliers: {
        bronze: 1.0,
        silver: 1.2,
        gold: 1.5,
        platinum: 2.0,
      },
    },
    redemptionRules: {
      pointValueQapik: 50, // 50 Qapik = 0.50 AZN
      maxReceiptPercentage: 30, // 30% cap
      minPointsToRedeem: 10,
    },
    tierRules: {
      bronzeThresholdQapik: toQapik(0),
      silverThresholdQapik: toQapik(50000),
      goldThresholdQapik: toQapik(150000),
      platinumThresholdQapik: toQapik(300000),
      rollingPeriodMonths: 12,
    },
    expiryRules: {
      pointsExpireMonths: 12,
    },
    reversalRules: {
      autoReversePointsOnReturn: true,
      refundRedeemedPointsOnReturn: true,
    },
    birthdayRules: {
      bonusPoints: 50,
      validityDays: 30,
    },
    rewardsCatalog: [],
  };

  it('calculates points accrual with tier and category multipliers', () => {
    // 100 AZN (10000 Qapik) -> 10 raw points. For gold customer (1.5x) -> 10 + 5 bonus = 15 points
    const res1 = simulateLoyaltyCalculation(
      {
        cartTotalQapik: toQapik(10000),
        tier: 'gold',
        categoryNames: ['Köynəklər'],
        pointsToRedeem: 0,
        isBirthday: false,
      },
      loyaltyConfig
    );
    expect(res1.basePointsEarned).toBe(10);
    expect(res1.totalPointsEarned).toBe(15);

    // With category multiplier 2.0x (higher than gold 1.5x) -> 10 raw * 2.0 = 20 points
    const res2 = simulateLoyaltyCalculation(
      {
        cartTotalQapik: toQapik(10000),
        tier: 'gold',
        categoryNames: ['Kostyumlar'],
        pointsToRedeem: 0,
        isBirthday: false,
      },
      loyaltyConfig
    );
    expect(res2.totalPointsEarned).toBe(20);

    // With birthday bonus (+50 points)
    const resBirthday = simulateLoyaltyCalculation(
      {
        cartTotalQapik: toQapik(10000),
        tier: 'gold',
        categoryNames: ['Köynəklər'],
        pointsToRedeem: 0,
        isBirthday: true,
      },
      loyaltyConfig
    );
    expect(resBirthday.totalPointsEarned).toBe(65); // 15 + 50
  });

  it('enforces 30% receipt cap on points redemption', () => {
    // 200 AZN receipt total (20000 Qapik) -> max 30% = 60 AZN (6000 Qapik)
    // At 50 Qapik per point, maxRedeemablePoints = 6000 / 50 = 120 points
    const res = simulateLoyaltyCalculation(
      {
        cartTotalQapik: toQapik(20000),
        tier: 'gold',
        pointsToRedeem: 150, // exceeds cap
        isBirthday: false,
      },
      loyaltyConfig
    );
    expect(res.maxRedeemablePoints).toBe(120);
    expect(res.requestedPointsRedeemed).toBe(120); // capped
    expect(res.redemptionDiscountQapik).toBe(toQapik(6000)); // 60 AZN
    expect(res.finalPayableQapik).toBe(toQapik(14000)); // 200 - 60 = 140 AZN
  });

  it('evaluates customer tier transitions accurately', () => {
    expect(evaluateCustomerTier(toQapik(25000), loyaltyConfig)).toBe('bronze');
    expect(evaluateCustomerTier(toQapik(75000), loyaltyConfig)).toBe('silver');
    expect(evaluateCustomerTier(toQapik(180000), loyaltyConfig)).toBe('gold');
    expect(evaluateCustomerTier(toQapik(350000), loyaltyConfig)).toBe('platinum');
  });

  it('calculates proportional points reversal on return', () => {
    // 20 points earned, 0 redeemed, 50% returned (ratio 0.5)
    const { pointsToDeduct, pointsToRefund } = calculateReturnReversal(20, 10, 0.5);
    expect(pointsToDeduct).toBe(10);
    expect(pointsToRefund).toBe(5);
  });
});

describe('CRM Module — Zod Schema Validations', () => {
  it('validates customer quick-create schema with minimal fields', () => {
    const valid = customerQuickCreateSchema.safeParse({
      firstName: 'Kamran',
      lastName: 'Hüseynov',
      phone: '+994501234567',
      primaryBranchId: 'branch-1',
      email: 'kamran@example.com',
      smsMarketing: true,
      emailMarketing: false,
      whatsappMarketing: true,
      dataProcessing: true,
    });
    expect(valid.success).toBe(true);

    const invalid = customerQuickCreateSchema.safeParse({
      firstName: '',
      lastName: 'H',
      phone: '123', // invalid phone length
      primaryBranchId: '',
      smsMarketing: false,
      emailMarketing: false,
      whatsappMarketing: false,
      dataProcessing: false, // data processing consent is mandatory
    });
    expect(invalid.success).toBe(false);
  });

  it('validates customer segment schema', () => {
    const valid = customerSegmentSchema.safeParse({
      name: 'Yüksək Dəyərli Müştərilər',
      description: 'Son 3 ayda 1000 AZN-dən çox xərcləyənlər',
      rules: {
        minSpendQapik: 100000,
        minOrdersCount: 3,
        lastVisitWithinDays: 90,
      },
    });
    expect(valid.success).toBe(true);

    const invalid = customerSegmentSchema.safeParse({
      name: '',
      rules: {},
    });
    expect(invalid.success).toBe(false);
  });

  it('validates points adjustment schema', () => {
    const valid = pointsAdjustmentSchema.safeParse({
      pointsDelta: 50,
      reason: 'Müştəri məmnuniyyəti kompensasiyası',
    });
    expect(valid.success).toBe(true);

    const invalidZero = pointsAdjustmentSchema.safeParse({
      pointsDelta: 0, // cannot be 0
      reason: 'Səbəb yoxdur',
    });
    expect(invalidZero.success).toBe(false);
  });
});

describe('CRM Module — Adapter Operations', () => {
  const adapter = new MockCrmAdapter();

  it('creates and lists customers', async () => {
    const created = await adapter.createCustomer({
      firstName: 'Aynur',
      lastName: 'Əliyeva',
      phone: '+994 55 888 77 66',
      email: 'aynur@example.com',
      primaryBranchId: 'branch-1',
    });

    expect(created.id).toBeDefined();
    expect(created.customerCode).toMatch(/^CUST-\d+/);
    expect(created.tier).toBe('bronze');
    expect(created.pointsBalance).toBe(0);

    const list = await adapter.getCustomers({ search: 'Aynur' });
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  it('adjusts customer points and appends to points ledger and audit log', async () => {
    const customers = await adapter.getCustomers();
    const cust = customers[0];
    const initialPoints = cust.pointsBalance;

    const entry = await adapter.adjustCustomerPoints(
      cust.id,
      50,
      'Loyallıq aksiyası bonusu',
      'Admin'
    );
    expect(entry.pointsDelta).toBe(50);
    expect(entry.balanceAfter).toBe(initialPoints + 50);

    const updated = await adapter.getCustomerById(cust.id);
    expect(updated?.pointsBalance).toBe(initialPoints + 50);

    const ledger = await adapter.getPointsLedger(cust.id);
    expect(ledger[0].pointsDelta).toBe(50);
    expect(ledger[0].note).toContain('Loyallıq');

    const logs = await adapter.getCustomerAuditLogs(cust.id);
    expect(logs.some((l) => l.action === 'points_adjust')).toBe(true);
  });

  it('updates consent channels and preserves audit trail', async () => {
    const customers = await adapter.getCustomers();
    const cust = customers[0];

    const updated = await adapter.updateCustomerConsent(
      cust.id,
      { smsMarketing: false },
      'customer_call_center'
    );
    expect(updated.consent.smsMarketing).toBe(false);

    const logs = await adapter.getCustomerAuditLogs(cust.id);
    expect(logs.some((l) => l.action === 'consent_change')).toBe(true);
  });

  it('handles customer anonymization request with 5-year fiscal retention note', async () => {
    const created = await adapter.createCustomer({
      firstName: 'Silinəcək',
      lastName: 'Şəxs',
      phone: '+994 51 000 00 00',
      email: 'delete@example.com',
    });

    const result = await adapter.requestCustomerAnonymization(
      created.id,
      'GDPR unutulma hüququ tələbi',
      'Hüquqşünas'
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('Maliyyə və əməliyyat arxivi saxlanıldı');

    const anonymized = await adapter.getCustomerById(created.id);
    expect(anonymized?.firstName).toBe('Anonim');
    expect(anonymized?.lastName).toBe('Müştəri');
    expect(anonymized?.phone).toBe('+994000000000');
    expect(anonymized?.email).toBeUndefined();
    expect(anonymized?.isAnonymized).toBe(true);
    expect(anonymized?.notes).toContain('GDPR/AR Qanunvericiliyi');
  });

  it('merges customers, transferring points and logging audit reason', async () => {
    const source = await adapter.createCustomer({
      firstName: 'Dublikat',
      lastName: 'Müştəri',
      phone: '+994 50 111 11 01',
    });
    await adapter.adjustCustomerPoints(source.id, 40, 'Köhnə kart balansı', 'Sistem');

    const target = await adapter.createCustomer({
      firstName: 'Əsas',
      lastName: 'Müştəri',
      phone: '+994 50 111 11 02',
    });

    const merged = await adapter.mergeCustomers(
      source.id,
      target.id,
      'Dublikat nömrələrin birləşdirilməsi',
      'Menecer'
    );

    expect(merged.pointsBalance).toBe(40); // 40 points transferred from source to target
    expect(merged.notes).toContain('Birləşdirildi');

    // Source customer marked as merged
    const updatedSource = await adapter.getCustomerById(source.id);
    expect(updatedSource?.notes).toContain('Bu profil birləşdirilib');
  });
});
