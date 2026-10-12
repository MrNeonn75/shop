import { MarketingRepository } from '../types';
import {
  Campaign,
  CampaignStatus,
  PromotionRule,
  PromoCode,
  PromoCodeRedemption,
  CampaignPerformance,
  CommunicationTemplate,
  CommunicationCampaign,
} from '../../../features/marketing/types';
import { toQapik } from '../../utils/money';

export class MockMarketingAdapter implements MarketingRepository {
  private campaigns: Campaign[] = [
    {
      id: 'cmp-1',
      code: 'CMP-2026-001',
      name: 'Yaz-Yay 2026 Kolleksiya Açılışı',
      objective: 'new_collection',
      type: 'seasonal',
      status: 'active',
      startDate: '2026-03-01',
      endDate: '2026-05-31',
      budgetQapik: toQapik(1200000), // 12,000 AZN
      spentQapik: toQapik(450000), // 4,500 AZN
      attributedSalesQapik: toQapik(3850000), // 38,500 AZN
      targetBranchIds: ['*'],
      targetSegmentIds: ['*'],
      eligibleBrandIds: ['brand-1', 'brand-2'],
      eligibleCategoryIds: [],
      eligibleProductIds: [],
      excludedProductIds: [],
      description: 'Yeni mövsüm geyim və ayaqqabı kolleksiyasının təqdimatı və filial vitrinlərinin yenilənməsi.',
      createdBy: 'Elmir Əliyev',
      createdAt: '2026-02-15T10:00:00Z',
      updatedAt: '2026-03-01T09:00:00Z',
    },
    {
      id: 'cmp-2',
      code: 'CMP-2026-002',
      name: 'Novruz Bayramı Şənliyi və Endirimlər',
      objective: 'sales_volume',
      type: 'promo_code',
      status: 'active',
      startDate: '2026-03-15',
      endDate: '2026-03-28',
      budgetQapik: toQapik(600000), // 6,000 AZN
      spentQapik: toQapik(220000), // 2,200 AZN
      attributedSalesQapik: toQapik(1840000), // 18,400 AZN
      targetBranchIds: ['branch-1', 'branch-2', 'branch-3'],
      targetSegmentIds: ['seg-1', 'seg-2'],
      eligibleBrandIds: [],
      eligibleCategoryIds: [],
      eligibleProductIds: [],
      excludedProductIds: [],
      description: 'Novruz bayramı ərəfəsində xüsusi promokodlar və hədiyyəli aksiyalar.',
      createdBy: 'Nigar Məmmədova',
      createdAt: '2026-03-01T11:00:00Z',
      updatedAt: '2026-03-15T08:00:00Z',
    },
    {
      id: 'cmp-3',
      code: 'CMP-2026-003',
      name: 'Massimo Dutti Premium Klassik Həftəsi',
      objective: 'brand_awareness',
      type: 'brand',
      status: 'pending_approval',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
      budgetQapik: toQapik(850000), // 8,500 AZN
      spentQapik: toQapik(0),
      attributedSalesQapik: toQapik(0),
      targetBranchIds: ['branch-1', 'branch-2'],
      targetSegmentIds: ['seg-3'],
      eligibleBrandIds: ['brand-1'],
      eligibleCategoryIds: [],
      eligibleProductIds: [],
      excludedProductIds: [],
      description: 'Massimo Dutti zərif dəri və kostyum çeşidlərinə xüsusi VIP təqdimat.',
      createdBy: 'Leyla Rəhimova',
      createdAt: '2026-03-20T14:30:00Z',
      updatedAt: '2026-03-20T14:30:00Z',
    },
    {
      id: 'cmp-4',
      code: 'CMP-2026-004',
      name: 'Qış Kolleksiyası Son Likvidasiya',
      objective: 'clearance',
      type: 'category',
      status: 'ended',
      startDate: '2026-01-15',
      endDate: '2026-02-28',
      budgetQapik: toQapik(500000),
      spentQapik: toQapik(490000),
      attributedSalesQapik: toQapik(2460000),
      targetBranchIds: ['*'],
      targetSegmentIds: ['*'],
      eligibleBrandIds: [],
      eligibleCategoryIds: ['cat-jackets', 'cat-coats'],
      eligibleProductIds: [],
      excludedProductIds: [],
      description: 'Qış gödəkçələri və palto modellərinə mövsüm sonu 50%-dək endirimlər.',
      createdBy: 'Elmir Əliyev',
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-02-28T22:00:00Z',
    },
  ];

  private promotionRules: PromotionRule[] = [
    {
      id: 'pr-1',
      code: 'PR-2026-01',
      name: '2-ci Məhsula 50% Endirim (BOGO)',
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
      description: 'Eyni kateqoriyadan alınan 2-ci məhsula 50% güzəşt tətbiq olunur.',
    },
    {
      id: 'pr-2',
      code: 'PR-2026-02',
      name: 'Bahar Geyimlərinə 20% Mövsümi Endirim',
      ruleType: 'percentage',
      priorityRank: 2,
      canStack: true,
      isExclusive: false,
      startDate: '2026-03-01',
      endDate: '2026-04-30',
      isActive: true,
      targetBranchIds: ['*'],
      discountPercent: 20,
      eligibleProductIds: [],
      eligibleCategoryIds: ['cat-clothing'],
      eligibleBrandIds: [],
      excludedProductIds: [],
      description: 'Bütün yaz geyimlərinə 20% birbaşa endirim.',
    },
    {
      id: 'pr-3',
      code: 'PR-2026-03',
      name: '150 ₼ üzəri Səbətə 25 ₼ Sabit Endirim',
      ruleType: 'fixed_amount',
      priorityRank: 3,
      canStack: false,
      isExclusive: false,
      startDate: '2026-03-10',
      endDate: '2026-04-10',
      isActive: true,
      targetBranchIds: ['*'],
      minCartAmountQapik: toQapik(15000), // 150 AZN
      discountAmountQapik: toQapik(2500), // 25 AZN
      eligibleProductIds: [],
      eligibleCategoryIds: [],
      eligibleBrandIds: [],
      excludedProductIds: [],
      description: 'Səbət məbləği 150 ₼-i keçdikdə avtomatik 25 ₼ endirim.',
    },
    {
      id: 'pr-4',
      code: 'PR-2026-04',
      name: 'VIP Loyallıq (Qızıl və Platin) 10% Əlavə Endirim',
      ruleType: 'loyalty_discount',
      priorityRank: 4,
      canStack: true,
      isExclusive: false,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      isActive: true,
      targetBranchIds: ['*'],
      discountPercent: 10,
      targetTiers: ['gold', 'platinum'],
      eligibleProductIds: [],
      eligibleCategoryIds: [],
      eligibleBrandIds: [],
      excludedProductIds: [],
      description: 'Qızıl və Platin dərəcəli müştərilərə xüsusi 10% üstünlük.',
    },
    {
      id: 'pr-5',
      code: 'PR-2026-05',
      name: 'Aksessuarlar Dəsti Xüsusi Qiymət (Bundle)',
      ruleType: 'bundle',
      priorityRank: 5,
      canStack: false,
      isExclusive: true,
      startDate: '2026-03-01',
      endDate: '2026-05-31',
      isActive: false,
      targetBranchIds: ['branch-1'],
      bundleProducts: ['prod-tie-1', 'prod-belt-1'],
      bundlePriceQapik: toQapik(4500), // 45 AZN bundle price
      eligibleProductIds: [],
      eligibleCategoryIds: [],
      eligibleBrandIds: [],
      excludedProductIds: [],
      description: 'Qalstuk və kəmər birgə alındıqda cəmi 45 ₼.',
    },
  ];

  private promoCodes: PromoCode[] = [
    {
      id: 'pc-1',
      code: 'NOVRUZ2026',
      campaignId: 'cmp-2',
      promotionRuleId: 'pr-2',
      discountDescription: 'Bahar geyimlərinə 20% endirim',
      totalUsageLimit: 500,
      usedCount: 142,
      perCustomerLimit: 1,
      startDate: '2026-03-15',
      endDate: '2026-03-28',
      targetBranchIds: ['*'],
      targetSegmentIds: ['*'],
      status: 'active',
      createdAt: '2026-03-10T12:00:00Z',
    },
    {
      id: 'pc-2',
      code: 'BAKU25',
      campaignId: 'cmp-2',
      promotionRuleId: 'pr-3',
      discountDescription: '150 ₼ üzəri alışa 25 ₼ endirim',
      totalUsageLimit: 200,
      usedCount: 89,
      perCustomerLimit: 1,
      startDate: '2026-03-10',
      endDate: '2026-04-10',
      targetBranchIds: ['*'],
      targetSegmentIds: ['*'],
      status: 'active',
      createdAt: '2026-03-08T15:00:00Z',
    },
    {
      id: 'pc-3',
      code: 'SPRINGVIP',
      campaignId: 'cmp-1',
      promotionRuleId: 'pr-4',
      discountDescription: 'VIP müştərilərə 10% əlavə endirim',
      totalUsageLimit: 50,
      usedCount: 50,
      perCustomerLimit: 1,
      startDate: '2026-03-01',
      endDate: '2026-03-15',
      targetBranchIds: ['*'],
      targetSegmentIds: ['seg-3'],
      status: 'exhausted',
      createdAt: '2026-02-28T09:00:00Z',
    },
  ];

  private redemptions: PromoCodeRedemption[] = [
    {
      id: 'red-1',
      promoCode: 'NOVRUZ2026',
      orderId: 'ORD-2026-9041',
      customerPhone: '+994501234567',
      customerName: 'Anar Qasımov',
      discountAppliedQapik: toQapik(3400),
      branchName: 'Mall 28 Filialı',
      redeemedAt: '2026-03-16T14:22:00Z',
    },
    {
      id: 'red-2',
      promoCode: 'BAKU25',
      orderId: 'ORD-2026-9042',
      customerPhone: '+994557654321',
      customerName: 'Günel Əliyeva',
      discountAppliedQapik: toQapik(2500),
      branchName: 'Gənclik Mall Filialı',
      redeemedAt: '2026-03-16T16:45:00Z',
    },
    {
      id: 'red-3',
      promoCode: 'NOVRUZ2026',
      orderId: 'ORD-2026-9043',
      customerPhone: '+994709876543',
      customerName: 'Rəşad Məmmədov',
      discountAppliedQapik: toQapik(4200),
      branchName: 'Dəniz Mall Filialı',
      redeemedAt: '2026-03-17T11:10:00Z',
    },
  ];

  private communicationTemplates: CommunicationTemplate[] = [
    {
      id: 'tpl-1',
      name: 'Novruz Təbriki & Şəxsi Promokod',
      channel: 'sms',
      body: 'Hörmətli {{customer_name}}, Novruz bayramınız mübarək! Sizin üçün {{promo_code}} kodu ilə 20% bahar endirimi aktivdir. Brand House.',
      category: 'promotional',
      updatedAt: '2026-03-12T10:00:00Z',
    },
    {
      id: 'tpl-2',
      name: 'Yeni Kolleksiya VIP Dəvətnaməsi',
      channel: 'email',
      subject: 'Brand House — Yeni Yaz-Yay 2026 Kolleksiyası ilə Tanış Olun',
      body: 'Salam {{customer_name}}, Brand House mağazalarında yeni kolleksiya vitrinlərdədir. Sizin {{points}} loyallıq balınız mövcuddur.',
      category: 'promotional',
      updatedAt: '2026-03-05T14:00:00Z',
    },
    {
      id: 'tpl-3',
      name: 'Loyallıq Balı İstifadə Xatırlatması',
      channel: 'whatsapp',
      body: 'Hörmətli {{customer_name}}, Brand House hesabınızda {{points}} toplanmış bal var. Alış-verişinizin 30%-dək hissəsini ballarla ödəyə bilərsiniz.',
      category: 'loyalty',
      updatedAt: '2026-03-10T11:30:00Z',
    },
  ];

  private communicationCampaigns: CommunicationCampaign[] = [
    {
      id: 'comm-1',
      title: 'Novruz SMS Kampaniyası',
      channel: 'sms',
      templateId: 'tpl-1',
      targetSegmentId: 'seg-1',
      audienceTotalCount: 3500,
      consentingCount: 2890,
      optedOutCount: 610,
      providerStatus: 'unconfigured',
      status: 'draft',
      createdAt: '2026-03-14T10:00:00Z',
    },
    {
      id: 'comm-2',
      title: 'VIP Müştərilərə WhatsApp Xatırlatma',
      channel: 'whatsapp',
      templateId: 'tpl-3',
      targetSegmentId: 'seg-3',
      audienceTotalCount: 420,
      consentingCount: 395,
      optedOutCount: 25,
      providerStatus: 'unconfigured',
      status: 'draft',
      createdAt: '2026-03-15T12:00:00Z',
    },
  ];

  async getCampaigns(params?: { status?: string; branchId?: string }): Promise<Campaign[]> {
    let result = [...this.campaigns];
    if (params?.status && params.status !== 'all') {
      result = result.filter((c) => c.status === params.status);
    }
    if (params?.branchId && params.branchId !== 'all') {
      result = result.filter(
        (c) => c.targetBranchIds.includes('*') || c.targetBranchIds.includes(params.branchId!)
      );
    }
    return result;
  }

  async getCampaignById(id: string): Promise<Campaign | null> {
    return this.campaigns.find((c) => c.id === id) || null;
  }

  async createCampaign(payload: Partial<Campaign>): Promise<Campaign> {
    const id = `cmp-${Date.now()}`;
    const code = `CMP-2026-${String(this.campaigns.length + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const newCamp: Campaign = {
      id,
      code,
      name: payload.name || 'Yeni Kampaniya',
      objective: payload.objective || 'sales_volume',
      type: payload.type || 'seasonal',
      status: 'draft',
      startDate: payload.startDate || now.split('T')[0],
      endDate: payload.endDate || now.split('T')[0],
      budgetQapik: payload.budgetQapik || toQapik(0),
      spentQapik: toQapik(0),
      attributedSalesQapik: toQapik(0),
      targetBranchIds: payload.targetBranchIds || ['*'],
      targetSegmentIds: payload.targetSegmentIds || ['*'],
      eligibleBrandIds: payload.eligibleBrandIds || [],
      eligibleCategoryIds: payload.eligibleCategoryIds || [],
      eligibleProductIds: payload.eligibleProductIds || [],
      excludedProductIds: payload.excludedProductIds || [],
      description: payload.description || '',
      createdBy: 'İstifadəçi',
      createdAt: now,
      updatedAt: now,
    };
    this.campaigns.unshift(newCamp);
    return newCamp;
  }

  async updateCampaign(id: string, payload: Partial<Campaign>): Promise<Campaign> {
    const idx = this.campaigns.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Kampaniya tapılmadı');
    this.campaigns[idx] = {
      ...this.campaigns[idx],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    return this.campaigns[idx];
  }

  async updateCampaignStatus(id: string, status: CampaignStatus, reason?: string): Promise<Campaign> {
    const camp = await this.getCampaignById(id);
    if (!camp) throw new Error('Kampaniya tapılmadı');
    camp.status = status;
    if (reason) camp.rejectionReason = reason;
    camp.updatedAt = new Date().toISOString();
    return camp;
  }

  async getPromotionRules(params?: { activeOnly?: boolean }): Promise<PromotionRule[]> {
    let res = [...this.promotionRules].sort((a, b) => a.priorityRank - b.priorityRank);
    if (params?.activeOnly) {
      res = res.filter((r) => r.isActive);
    }
    return res;
  }

  async createPromotionRule(payload: Partial<PromotionRule>): Promise<PromotionRule> {
    const id = `pr-${Date.now()}`;
    const code = `PR-2026-${String(this.promotionRules.length + 1).padStart(2, '0')}`;
    const newRule: PromotionRule = {
      id,
      code,
      name: payload.name || 'Yeni Qayda',
      ruleType: payload.ruleType || 'percentage',
      priorityRank: payload.priorityRank || this.promotionRules.length + 1,
      canStack: Boolean(payload.canStack),
      isExclusive: Boolean(payload.isExclusive),
      startDate: payload.startDate || new Date().toISOString().split('T')[0],
      endDate: payload.endDate || new Date().toISOString().split('T')[0],
      isActive: true,
      targetBranchIds: payload.targetBranchIds || ['*'],
      minCartAmountQapik: payload.minCartAmountQapik,
      maxDiscountAmountQapik: payload.maxDiscountAmountQapik,
      discountPercent: payload.discountPercent,
      discountAmountQapik: payload.discountAmountQapik,
      bogoBuyQty: payload.bogoBuyQty,
      bogoGetQty: payload.bogoGetQty,
      bogoDiscountPercent: payload.bogoDiscountPercent,
      eligibleProductIds: payload.eligibleProductIds || [],
      eligibleCategoryIds: payload.eligibleCategoryIds || [],
      eligibleBrandIds: payload.eligibleBrandIds || [],
      excludedProductIds: payload.excludedProductIds || [],
      description: payload.description || '',
    };
    this.promotionRules.push(newRule);
    return newRule;
  }

  async updatePromotionRule(id: string, payload: Partial<PromotionRule>): Promise<PromotionRule> {
    const idx = this.promotionRules.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Endirim qaydası tapılmadı');
    this.promotionRules[idx] = { ...this.promotionRules[idx], ...payload };
    return this.promotionRules[idx];
  }

  async updateRulePriorities(orderedIds: string[]): Promise<PromotionRule[]> {
    orderedIds.forEach((id, index) => {
      const rule = this.promotionRules.find((r) => r.id === id);
      if (rule) rule.priorityRank = index + 1;
    });
    return this.getPromotionRules();
  }

  async getPromoCodes(): Promise<PromoCode[]> {
    return [...this.promoCodes];
  }

  async createPromoCode(payload: Partial<PromoCode>): Promise<PromoCode> {
    const id = `pc-${Date.now()}`;
    const newCode: PromoCode = {
      id,
      code: (payload.code || 'CODE').toUpperCase(),
      campaignId: payload.campaignId,
      promotionRuleId: payload.promotionRuleId || 'pr-1',
      discountDescription: payload.discountDescription || 'Xüsusi endirim',
      totalUsageLimit: payload.totalUsageLimit || 100,
      usedCount: 0,
      perCustomerLimit: payload.perCustomerLimit || 1,
      startDate: payload.startDate || new Date().toISOString().split('T')[0],
      endDate: payload.endDate || new Date().toISOString().split('T')[0],
      targetBranchIds: payload.targetBranchIds || ['*'],
      targetSegmentIds: payload.targetSegmentIds || ['*'],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.promoCodes.unshift(newCode);
    return newCode;
  }

  async generateBulkPromoCodes(
    prefix: string,
    count: number,
    template: Partial<PromoCode>
  ): Promise<PromoCode[]> {
    const generated: PromoCode[] = [];
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const now = new Date().toISOString();

    for (let i = 0; i < count; i++) {
      let rand = '';
      for (let j = 0; j < 5; j++) {
        rand += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      const code = `${prefix}-${rand}`;
      const newPc: PromoCode = {
        id: `pc-${Date.now()}-${i}`,
        code,
        campaignId: template.campaignId,
        promotionRuleId: template.promotionRuleId || 'pr-1',
        discountDescription: template.discountDescription || 'Kütləvi promokod',
        totalUsageLimit: template.totalUsageLimit || 1,
        usedCount: 0,
        perCustomerLimit: template.perCustomerLimit || 1,
        startDate: template.startDate || now.split('T')[0],
        endDate: template.endDate || now.split('T')[0],
        targetBranchIds: template.targetBranchIds || ['*'],
        targetSegmentIds: template.targetSegmentIds || ['*'],
        status: 'active',
        createdAt: now,
      };
      this.promoCodes.push(newPc);
      generated.push(newPc);
    }
    return generated;
  }

  async getRedemptions(code?: string): Promise<PromoCodeRedemption[]> {
    if (code) {
      return this.redemptions.filter((r) => r.promoCode === code);
    }
    return [...this.redemptions];
  }

  async getCampaignPerformance(campaignId: string): Promise<CampaignPerformance> {
    const camp = await this.getCampaignById(campaignId);
    const campaignName = camp?.name || 'Kampaniya Performansı';

    return {
      campaignId,
      campaignName,
      period: { start: camp?.startDate || '2026-03-01', end: camp?.endDate || '2026-03-31' },
      totalRevenueQapik: toQapik(3850000), // 38,500.00 AZN
      unitsSold: 412,
      totalDiscountCostQapik: toQapik(620000), // 6,200.00 AZN
      grossMarginQapik: toQapik(1450000), // 14,500.00 AZN
      grossMarginPercent: 37.6,
      spendRoiPercent: 222.2, // (Revenue - Spend) / Spend
      hasSufficientCostData: true,
      missingDataReasons: [],
      baselineRevenueQapik: toQapik(2750000), // 27,500.00 AZN
      revenueLiftPercent: 40.0,
      branchBreakdown: [
        {
          branchId: 'branch-1',
          branchName: 'Mall 28 Filialı',
          revenueQapik: toQapik(1820000),
          discountCostQapik: toQapik(290000),
          units: 195,
        },
        {
          branchId: 'branch-2',
          branchName: 'Gənclik Mall Filialı',
          revenueQapik: toQapik(1340000),
          discountCostQapik: toQapik(210000),
          units: 142,
        },
        {
          branchId: 'branch-3',
          branchName: 'Dəniz Mall Filialı',
          revenueQapik: toQapik(690000),
          discountCostQapik: toQapik(120000),
          units: 75,
        },
      ],
      funnel: {
        impressionsOrAudience: 12500,
        codesIssuedOrEngaged: 1850,
        redemptions: 412,
        conversions: 385,
      },
    };
  }

  async getCommunicationTemplates(): Promise<CommunicationTemplate[]> {
    return [...this.communicationTemplates];
  }

  async createCommunicationTemplate(
    payload: Partial<CommunicationTemplate>
  ): Promise<CommunicationTemplate> {
    const newTpl: CommunicationTemplate = {
      id: `tpl-${Date.now()}`,
      name: payload.name || 'Yeni Şablon',
      channel: payload.channel || 'sms',
      subject: payload.subject,
      body: payload.body || '',
      category: payload.category || 'promotional',
      updatedAt: new Date().toISOString(),
    };
    this.communicationTemplates.push(newTpl);
    return newTpl;
  }

  async getCommunicationCampaigns(): Promise<CommunicationCampaign[]> {
    return [...this.communicationCampaigns];
  }

  async createCommunicationCampaign(
    payload: Partial<CommunicationCampaign>
  ): Promise<CommunicationCampaign> {
    const newComm: CommunicationCampaign = {
      id: `comm-${Date.now()}`,
      title: payload.title || 'Yeni Kampaniya',
      channel: payload.channel || 'sms',
      templateId: payload.templateId || 'tpl-1',
      targetSegmentId: payload.targetSegmentId || 'seg-1',
      audienceTotalCount: payload.audienceTotalCount || 100,
      consentingCount: payload.consentingCount || 85,
      optedOutCount: payload.optedOutCount || 15,
      providerStatus: 'unconfigured',
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    this.communicationCampaigns.unshift(newComm);
    return newComm;
  }
}

