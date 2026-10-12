import { CrmRepository } from '../types';
import {
  Customer,
  CustomerPurchaseHistoryItem,
  CustomerReturnHistoryItem,
  PointsLedgerEntry,
  CustomerConsent,
  CustomerSegment,
  LoyaltyProgramConfig,
  CustomerAuditLogEntry,
} from '../../../features/crm/types';
import { toQapik } from '../../utils/money';

export class MockCrmAdapter implements CrmRepository {
  private customers: Customer[] = [
    {
      id: 'cust-1',
      customerCode: 'CUST-00101',
      firstName: 'Elmir',
      lastName: 'Əliyev',
      phone: '+994501234567',
      email: 'elmir.aliyev@example.com',
      birthDate: '1988-06-14',
      tier: 'platinum',
      pointsBalance: 420,
      totalSpentQapik: toQapik(345000), // 3,450.00 AZN
      ordersCount: 18,
      averageOrderValueQapik: toQapik(19167),
      lastPurchaseDate: '2026-03-12',
      segmentTags: ['vip', 'premium_buyer', 'menswear'],
      primaryBranchId: 'branch-1',
      preferredCategories: ['Kostyumlar', 'Ayaqqabı'],
      preferredSizes: ['L', '43'],
      consent: {
        smsMarketing: true,
        emailMarketing: true,
        whatsappMarketing: true,
        dataProcessing: true,
        consentUpdatedAt: '2026-01-10T11:00:00Z',
        history: [
          {
            channel: 'data_processing',
            granted: true,
            timestamp: '2025-05-12T09:00:00Z',
            source: 'pos_registration',
          },
          {
            channel: 'sms',
            granted: true,
            timestamp: '2025-05-12T09:00:00Z',
            source: 'pos_registration',
          },
        ],
      },
      notes: 'Daimi VIP müştəri. Klassik Massimo Dutti və Zara Man kolleksiyalarına üstünlük verir.',
      isAnonymized: false,
      createdAt: '2025-05-12T09:00:00Z',
      updatedAt: '2026-03-12T14:30:00Z',
    },
    {
      id: 'cust-2',
      customerCode: 'CUST-00102',
      firstName: 'Leyla',
      lastName: 'Məmmədova',
      phone: '+994552345678',
      email: 'leyla.m@example.com',
      birthDate: '1994-03-22',
      tier: 'gold',
      pointsBalance: 190,
      totalSpentQapik: toQapik(182000), // 1,820.00 AZN
      ordersCount: 11,
      averageOrderValueQapik: toQapik(16545),
      lastPurchaseDate: '2026-03-05',
      segmentTags: ['frequent_shopper', 'womenswear'],
      primaryBranchId: 'branch-2',
      preferredCategories: ['Donlar', 'Çantalar'],
      preferredSizes: ['S', '37'],
      consent: {
        smsMarketing: true,
        emailMarketing: false,
        whatsappMarketing: true,
        dataProcessing: true,
        consentUpdatedAt: '2026-02-01T15:20:00Z',
        history: [
          {
            channel: 'sms',
            granted: true,
            timestamp: '2025-08-10T12:00:00Z',
            source: 'pos_registration',
          },
          {
            channel: 'email',
            granted: false,
            timestamp: '2026-02-01T15:20:00Z',
            source: 'customer_request',
          },
        ],
      },
      notes: 'E-mail bildirişlərindən imtina edib, WhatsApp təkliflərinə açıqdır.',
      isAnonymized: false,
      createdAt: '2025-08-10T12:00:00Z',
      updatedAt: '2026-03-05T17:10:00Z',
    },
    {
      id: 'cust-3',
      customerCode: 'CUST-00103',
      firstName: 'Rəşad',
      lastName: 'Qasımov',
      phone: '+994703456789',
      email: 'rashad.q@example.com',
      birthDate: '1991-11-05',
      tier: 'silver',
      pointsBalance: 75,
      totalSpentQapik: toQapik(78000), // 780.00 AZN
      ordersCount: 5,
      averageOrderValueQapik: toQapik(15600),
      lastPurchaseDate: '2026-02-18',
      segmentTags: ['casual'],
      primaryBranchId: 'branch-1',
      preferredCategories: ['Cins şalvarlar', 'Köynəklər'],
      preferredSizes: ['M', '41'],
      consent: {
        smsMarketing: true,
        emailMarketing: true,
        whatsappMarketing: false,
        dataProcessing: true,
        consentUpdatedAt: '2025-11-20T10:00:00Z',
        history: [],
      },
      notes: '',
      isAnonymized: false,
      createdAt: '2025-11-20T10:00:00Z',
      updatedAt: '2026-02-18T16:00:00Z',
    },
    {
      id: 'cust-4',
      customerCode: 'CUST-00104',
      firstName: 'Nigar',
      lastName: 'Həsənova',
      phone: '+994504567890',
      email: '',
      birthDate: '1999-09-18',
      tier: 'bronze',
      pointsBalance: 15,
      totalSpentQapik: toQapik(14500), // 145.00 AZN
      ordersCount: 2,
      averageOrderValueQapik: toQapik(7250),
      lastPurchaseDate: '2026-01-20',
      segmentTags: ['new'],
      primaryBranchId: 'branch-3',
      preferredCategories: ['Aksessuarlar'],
      preferredSizes: ['M'],
      consent: {
        smsMarketing: false,
        emailMarketing: false,
        whatsappMarketing: false,
        dataProcessing: true,
        consentUpdatedAt: '2026-01-20T11:45:00Z',
        history: [
          {
            channel: 'sms',
            granted: false,
            timestamp: '2026-01-20T11:45:00Z',
            source: 'pos_registration',
          },
        ],
      },
      notes: 'Marketinq bildirişlərinə razılıq verməyib.',
      isAnonymized: false,
      createdAt: '2026-01-20T11:45:00Z',
      updatedAt: '2026-01-20T11:45:00Z',
    },
  ];

  private purchases: Record<string, CustomerPurchaseHistoryItem[]> = {
    'cust-1': [
      {
        orderId: 'ord-101',
        orderNumber: 'ORD-2026-9041',
        date: '2026-03-12 14:30',
        branchName: 'Mall 28 Filialı',
        itemsCount: 3,
        itemsSummary: 'Massimo Dutti İtalyan Yundan Kostyum (1x), Klassik İpək Qalstuk (2x)',
        totalAmountQapik: toQapik(32000),
        discountAmountQapik: toQapik(3200),
        pointsEarned: 32,
        pointsRedeemed: 20,
        paymentMethod: 'Bank kartı',
      },
      {
        orderId: 'ord-102',
        orderNumber: 'ORD-2026-8812',
        date: '2026-02-14 18:15',
        branchName: 'Mall 28 Filialı',
        itemsCount: 2,
        itemsSummary: 'Dəri Oksford Ayaqqabı (1x), Dəri Kəmər (1x)',
        totalAmountQapik: toQapik(24500),
        discountAmountQapik: toQapik(0),
        pointsEarned: 24,
        pointsRedeemed: 0,
        paymentMethod: 'Nağd',
      },
    ],
  };

  private returns: Record<string, CustomerReturnHistoryItem[]> = {
    'cust-1': [
      {
        returnId: 'ret-101',
        returnNumber: 'RET-2026-0042',
        originalOrderNumber: 'ORD-2026-8812',
        date: '2026-02-16 11:00',
        branchName: 'Mall 28 Filialı',
        itemsReturned: 'Dəri Kəmər (Ölçü uyğun gəlmədi)',
        refundAmountQapik: toQapik(4500),
        pointsReversed: 4,
        reason: 'Ölçü uyğunsuzluğu',
      },
    ],
  };

  private pointsLedgers: Record<string, PointsLedgerEntry[]> = {
    'cust-1': [
      {
        id: 'ple-1',
        customerId: 'cust-1',
        date: '2026-03-12 14:30',
        type: 'earned',
        pointsDelta: 32,
        balanceAfter: 420,
        referenceType: 'order',
        referenceId: 'ORD-2026-9041',
        note: 'Mall 28 alış-verişindən toplanan ballar (Platin x2.0)',
        createdBy: 'Sistem POS',
      },
      {
        id: 'ple-2',
        customerId: 'cust-1',
        date: '2026-03-12 14:30',
        type: 'redeemed',
        pointsDelta: -20,
        balanceAfter: 388,
        referenceType: 'order',
        referenceId: 'ORD-2026-9041',
        note: 'Çek üzrə 10.00 ₼ endirim üçün silinən bal',
        createdBy: 'Sistem POS',
      },
      {
        id: 'ple-3',
        customerId: 'cust-1',
        date: '2026-02-16 11:00',
        type: 'return_reversal',
        pointsDelta: -4,
        balanceAfter: 408,
        referenceType: 'return',
        referenceId: 'RET-2026-0042',
        note: 'Qaytarılan kəmər üzrə hesablanmış balların ləğvi',
        createdBy: 'Sistem POS',
      },
      {
        id: 'ple-4',
        customerId: 'cust-1',
        date: '2026-01-01 00:00',
        type: 'birthday_bonus',
        pointsDelta: 50,
        balanceAfter: 412,
        referenceType: 'system',
        note: 'Yeni il / Ad günü bonusu',
        createdBy: 'Loyallıq Mühərriki',
      },
    ],
  };

  private segments: CustomerSegment[] = [
    {
      id: 'seg-1',
      name: 'Bütün Aktiv Müştərilər',
      description: 'Son 90 gündə ən azı 1 alış etmiş müştərilər',
      isDynamic: true,
      rules: {
        minOrdersCount: 1,
        lastVisitWithinDays: 90,
      },
      matchedCount: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'seg-2',
      name: 'SMS Bildiriş Razılığı Olanlar',
      description: 'SMS xəbərdarlıqlarına aktiv icazə verən müştərilər',
      isDynamic: true,
      rules: {
        requiredConsentChannel: 'sms',
      },
      matchedCount: 3,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'seg-3',
      name: 'VIP Loyallıq (Qızıl & Platin)',
      description: 'İllik xərcləməsi 1,500 ₼-dən çox olan xüsusi müştərilər',
      isDynamic: true,
      rules: {
        tiers: ['gold', 'platinum'],
        minSpendQapik: toQapik(150000),
      },
      matchedCount: 2,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
  ];

  private loyaltyConfig: LoyaltyProgramConfig = {
    programName: 'Brand House Premium Club',
    version: 'v2.2',
    effectiveDate: '2026-01-01',
    earnRules: {
      qapikPerPoint: 1000, // 10 AZN = 1 pt
      categoryMultipliers: {
        'Ayaqqabı': 1.5,
        'Aksessuarlar': 1.2,
      },
      tierMultipliers: {
        bronze: 1.0,
        silver: 1.2,
        gold: 1.5,
        platinum: 2.0,
      },
    },
    redemptionRules: {
      pointValueQapik: 50, // 1 bal = 0.50 AZN
      maxReceiptPercentage: 30, // max 30% of order total
      minPointsToRedeem: 10,
    },
    tierRules: {
      bronzeThresholdQapik: toQapik(0),
      silverThresholdQapik: toQapik(50000), // 500 AZN
      goldThresholdQapik: toQapik(150000), // 1,500 AZN
      platinumThresholdQapik: toQapik(300000), // 3,000 AZN
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
    rewardsCatalog: [
      {
        id: 'rew-1',
        title: 'Brend Loqolu Dəri Kartvizit Qabı',
        pointsRequired: 80,
        category: 'Aksessuar',
        availableQty: 25,
        description: 'Təbii dəridən hazırlanmış eleqant kart sahibi.',
      },
      {
        id: 'rew-2',
        title: 'Ödənişsiz Fərdi Dərzi Xidməti Kuponu',
        pointsRequired: 50,
        category: 'Xidmət',
        availableQty: 50,
        description: 'Alınan şalvar və ya kostyumun bədənə uyğunlaşdırılması.',
      },
      {
        id: 'rew-3',
        title: '50 ₼ Dəyərində Hədiyyə Kuponu',
        pointsRequired: 100,
        category: 'Hədiyyə Kartı',
        availableQty: 15,
        description: 'Bütün Brand House filiallarında keçərli hədiyyə kartı.',
      },
    ],
  };

  private auditLogs: Record<string, CustomerAuditLogEntry[]> = {};

  async getCustomers(params?: {
    search?: string;
    tier?: string;
    segmentId?: string;
    branchId?: string;
  }): Promise<Customer[]> {
    let result = [...this.customers].filter((c) => !c.isAnonymized);

    if (params?.search) {
      const q = params.search.trim().toLowerCase();
      // Search by phone first (exact or partial digits), then name, code, email
      const cleanPhoneQuery = q.replace(/\D/g, '');
      result = result.filter((c) => {
        const cPhone = c.phone.replace(/\D/g, '');
        if (cleanPhoneQuery && cPhone.includes(cleanPhoneQuery)) return true;
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
        if (fullName.includes(q)) return true;
        if (c.customerCode.toLowerCase().includes(q)) return true;
        if (c.email && c.email.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    if (params?.tier && params.tier !== 'all') {
      result = result.filter((c) => c.tier === params.tier);
    }

    if (params?.branchId && params.branchId !== 'all') {
      result = result.filter((c) => c.primaryBranchId === params.branchId);
    }

    return result;
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    return this.customers.find((c) => c.id === id) || null;
  }

  async createCustomer(payload: Partial<Customer>): Promise<Customer> {
    const id = `cust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const customerCode = `CUST-${String(this.customers.length + 101).padStart(5, '0')}`;
    const now = new Date().toISOString();

    const newCust: Customer = {
      id,
      customerCode,
      firstName: payload.firstName || '',
      lastName: payload.lastName || '',
      phone: payload.phone || '',
      email: payload.email || '',
      birthDate: payload.birthDate,
      tier: 'bronze',
      pointsBalance: 0,
      totalSpentQapik: toQapik(0),
      ordersCount: 0,
      averageOrderValueQapik: toQapik(0),
      segmentTags: payload.segmentTags || ['new'],
      primaryBranchId: payload.primaryBranchId || 'branch-1',
      preferredCategories: [],
      preferredSizes: [],
      consent: payload.consent || {
        smsMarketing: false,
        emailMarketing: false,
        whatsappMarketing: false,
        dataProcessing: true,
        consentUpdatedAt: now,
        history: [
          {
            channel: 'data_processing',
            granted: true,
            timestamp: now,
            source: 'quick_create',
          },
        ],
      },
      notes: payload.notes || '',
      isAnonymized: false,
      createdAt: now,
      updatedAt: now,
    };

    this.customers.unshift(newCust);
    this.addAuditLog(newCust.id, 'create', 'Admin / Kassir', 'admin', 'Müştəri qeydiyyatı yaradıldı');
    return newCust;
  }

  async updateCustomer(id: string, payload: Partial<Customer>): Promise<Customer> {
    const idx = this.customers.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Müştəri tapılmadı');

    this.customers[idx] = {
      ...this.customers[idx],
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    this.addAuditLog(id, 'update', 'İstifadəçi', 'admin', 'Profil məlumatları yeniləndi');
    return this.customers[idx];
  }

  async mergeCustomers(
    sourceId: string,
    targetId: string,
    reason: string,
    actor: string
  ): Promise<Customer> {
    const source = await this.getCustomerById(sourceId);
    const target = await this.getCustomerById(targetId);

    if (!source || !target) throw new Error('Birləşdiriləcək müştəri tapılmadı');

    // Transfer points, spend, orders to target
    target.pointsBalance += source.pointsBalance;
    target.totalSpentQapik = toQapik(target.totalSpentQapik + source.totalSpentQapik);
    target.ordersCount += source.ordersCount;
    if (target.ordersCount > 0) {
      target.averageOrderValueQapik = toQapik(
        Math.round(target.totalSpentQapik / target.ordersCount)
      );
    }
    target.notes += ` [Birləşdirildi: ${source.customerCode} (${source.firstName} ${source.lastName}) - ${reason}]`;
    target.updatedAt = new Date().toISOString();

    // Mark source as merged
    source.isAnonymized = true;
    source.anonymizedAt = new Date().toISOString();
    source.notes = `${source.notes || ''} [Bu profil birləşdirilib: ${target.customerCode} (${target.firstName} ${target.lastName})]`.trim();
    source.pointsBalance = 0;

    this.addAuditLog(
      target.id,
      'merge',
      actor,
      'manager',
      `Müştəri ${source.customerCode} ilə birləşdirildi. Səbəb: ${reason}`
    );

    return target;
  }

  async getCustomerPurchases(customerId: string): Promise<CustomerPurchaseHistoryItem[]> {
    return this.purchases[customerId] || [];
  }

  async getCustomerReturns(customerId: string): Promise<CustomerReturnHistoryItem[]> {
    return this.returns[customerId] || [];
  }

  async getPointsLedger(customerId: string): Promise<PointsLedgerEntry[]> {
    return this.pointsLedgers[customerId] || [];
  }

  async adjustCustomerPoints(
    customerId: string,
    delta: number,
    reason: string,
    actor: string
  ): Promise<PointsLedgerEntry> {
    const cust = await this.getCustomerById(customerId);
    if (!cust) throw new Error('Müştəri tapılmadı');

    cust.pointsBalance += delta;
    cust.updatedAt = new Date().toISOString();

    const entry: PointsLedgerEntry = {
      id: `ple-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      customerId,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      type: 'manual_adjustment',
      pointsDelta: delta,
      balanceAfter: cust.pointsBalance,
      referenceType: 'manual',
      note: reason,
      createdBy: actor,
    };

    if (!this.pointsLedgers[customerId]) {
      this.pointsLedgers[customerId] = [];
    }
    this.pointsLedgers[customerId].unshift(entry);

    this.addAuditLog(
      customerId,
      'points_adjust',
      actor,
      'manager',
      `Bal düzəlişi: ${delta > 0 ? '+' : ''}${delta} bal. Əsaslandırma: ${reason}`
    );

    return entry;
  }

  async updateCustomerConsent(
    customerId: string,
    consent: Partial<CustomerConsent>,
    source: string
  ): Promise<Customer> {
    const cust = await this.getCustomerById(customerId);
    if (!cust) throw new Error('Müştəri tapılmadı');

    const now = new Date().toISOString();
    const historyEntries = [...cust.consent.history];

    if (consent.smsMarketing !== undefined && consent.smsMarketing !== cust.consent.smsMarketing) {
      historyEntries.push({
        channel: 'sms',
        granted: consent.smsMarketing,
        timestamp: now,
        source,
      });
    }
    if (consent.emailMarketing !== undefined && consent.emailMarketing !== cust.consent.emailMarketing) {
      historyEntries.push({
        channel: 'email',
        granted: consent.emailMarketing,
        timestamp: now,
        source,
      });
    }
    if (
      consent.whatsappMarketing !== undefined &&
      consent.whatsappMarketing !== cust.consent.whatsappMarketing
    ) {
      historyEntries.push({
        channel: 'whatsapp',
        granted: consent.whatsappMarketing,
        timestamp: now,
        source,
      });
    }

    cust.consent = {
      ...cust.consent,
      ...consent,
      consentUpdatedAt: now,
      history: historyEntries,
    };
    cust.updatedAt = now;

    this.addAuditLog(
      customerId,
      'consent_change',
      source,
      'system',
      'Bildiriş və marketinq razılıq statusu dəyişdirildi'
    );

    return cust;
  }

  async requestCustomerAnonymization(
    customerId: string,
    reason: string,
    actor: string
  ): Promise<{ success: boolean; message: string }> {
    const cust = await this.getCustomerById(customerId);
    if (!cust) throw new Error('Müştəri tapılmadı');

    // In accordance with Azerbaijani commercial & tax law and retention policy:
    // Transactions must be preserved for 5 years. Personal PII is stripped/anonymized.
    cust.firstName = 'Anonim';
    cust.lastName = 'Müştəri';
    cust.phone = `+994000000000`;
    cust.email = undefined;
    cust.birthDate = undefined;
    cust.notes = `Fərdi məlumat silinməsi (GDPR/AR Qanunvericiliyi) tələbi ilə ${new Date().toISOString()} tarixində anonimləşdirildi. Səbəb: ${reason}`;
    cust.isAnonymized = true;
    cust.anonymizedAt = new Date().toISOString();
    cust.consent = {
      smsMarketing: false,
      emailMarketing: false,
      whatsappMarketing: false,
      dataProcessing: false,
      consentUpdatedAt: new Date().toISOString(),
      history: cust.consent.history,
    };

    this.addAuditLog(
      customerId,
      'anonymize_request',
      actor,
      'dpo',
      `Fərdi məlumatların silinməsi / anonimləşdirilməsi icra edildi. Əsaslandırma: ${reason}`
    );

    return {
      success: true,
      message: 'Müştərinin fərdi əlaqə məlumatları anonimləşdirildi. Maliyyə və əməliyyat arxivi saxlanıldı.',
    };
  }

  async getCustomerSegments(): Promise<CustomerSegment[]> {
    return [...this.segments];
  }

  async createCustomerSegment(payload: Partial<CustomerSegment>): Promise<CustomerSegment> {
    const newSeg: CustomerSegment = {
      id: `seg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: payload.name || 'Yeni Seqment',
      description: payload.description || '',
      isDynamic: Boolean(payload.isDynamic ?? true),
      rules: payload.rules || {},
      matchedCount: payload.matchedCount || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.segments.push(newSeg);
    return newSeg;
  }

  async updateCustomerSegment(
    id: string,
    payload: Partial<CustomerSegment>
  ): Promise<CustomerSegment> {
    const idx = this.segments.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Seqment tapılmadı');
    this.segments[idx] = {
      ...this.segments[idx],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    return this.segments[idx];
  }

  async getLoyaltyConfig(): Promise<LoyaltyProgramConfig> {
    return { ...this.loyaltyConfig };
  }

  async updateLoyaltyConfig(payload: Partial<LoyaltyProgramConfig>): Promise<LoyaltyProgramConfig> {
    this.loyaltyConfig = { ...this.loyaltyConfig, ...payload };
    return { ...this.loyaltyConfig };
  }

  async getCustomerAuditLogs(customerId: string): Promise<CustomerAuditLogEntry[]> {
    return this.auditLogs[customerId] || [];
  }

  private addAuditLog(
    customerId: string,
    action: CustomerAuditLogEntry['action'],
    actorName: string,
    actorRole: string,
    details: string
  ) {
    if (!this.auditLogs[customerId]) {
      this.auditLogs[customerId] = [];
    }
    this.auditLogs[customerId].unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      customerId,
      action,
      actorName,
      actorRole,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}

