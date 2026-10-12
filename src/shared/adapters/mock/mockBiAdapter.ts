import { BiRepository } from '../types';
import {
  ExecutiveBiData,
  InventoryIntelligenceData,
  CustomerAnalyticsData,
  ProfitabilityData,
  AnomalyItem,
  ChartAnnotation,
} from '../../../features/bi/types';

export class MockBiAdapter implements BiRepository {
  private anomalies: AnomalyItem[] = [
    {
      id: 'anom-1',
      type: 'discount',
      title: 'Qeyri-adi Yüksək Endirim Tətbiqi',
      description: 'Kassir tərəfindən 3 ədəd Premium Dəri Jaketə icazəsiz 45% manual endirim tətbiq edilib (Hədd: 15%).',
      detectedAt: '2026-10-11 16:45 (Asia/Baku)',
      severity: 'critical',
      evidenceUrl: '/reports/view/sales_discounts?branchId=b1',
      detectionCriteria: 'Tətbiq edilən endirim faizi > 15% və menecer təsdiqi yoxdur',
      actorName: 'Aysel Quliyeva (Kassir)',
      branchName: 'Baş Filial (Nizami)',
      varianceAzn: 135.0,
    },
    {
      id: 'anom-2',
      type: 'return',
      title: 'Qəfil Qaytarma Dalğası (Qadın Geyimi)',
      description: 'Son 24 saatda Sumqayıt filialında qadın ipək koftaları üzrə qaytarmalar normadan 340% çox olub.',
      detectedAt: '2026-10-11 14:10 (Asia/Baku)',
      severity: 'warning',
      evidenceUrl: '/reports/view/sales_returns?branchId=b4',
      detectionCriteria: 'Gündəlik qaytarma sayı normal orta həddən 3 dəfə yüksəkdir',
      actorName: 'Sistem Detektoru',
      branchName: 'Sumqayıt Filialı',
      varianceAzn: 350.0,
    },
    {
      id: 'anom-3',
      type: 'cash_variance',
      title: 'Kassa Z-Hesabatı və Faktiki Sayım Fərqi',
      description: 'Gənclik Mall POS-2 terminalının bağlanışında sistem qalığı ilə faktiki sayım arasında kəsir aşkarlandı.',
      detectedAt: '2026-10-10 22:15 (Asia/Baku)',
      severity: 'warning',
      evidenceUrl: '/finance',
      detectionCriteria: 'POS sessiyasının sonu: faktiki nağd vəsait - sistem balansı != 0',
      actorName: 'Nurlan İsmayılov (Baş Kassir)',
      branchName: 'Gənclik Mall Filialı',
      varianceAzn: -45.5,
    },
    {
      id: 'anom-4',
      type: 'stock_adjustment',
      title: 'Böyük Həcmli Silinmə (Zay/Xarab)',
      description: 'Mərkəzi Anbarda bir sənədlə 1,250.00 ₼ dəyərində mal aktlaşdırılaraq silinib.',
      detectedAt: '2026-10-09 11:30 (Asia/Baku)',
      severity: 'critical',
      evidenceUrl: '/reports/view/inv_adjustments',
      detectionCriteria: 'Təkbaşına silinmə aktının maya dəyəri > 500.00 ₼',
      actorName: 'Rəşad Məmmədov (Anbardar)',
      branchName: 'Mərkəzi Anbar',
      varianceAzn: 1250.0,
    },
  ];

  private annotations: ChartAnnotation[] = [
    {
      id: 'ann-1',
      date: '2026-10-01',
      title: 'Payız Mövsümü Açılışı & Kampaniya Startı',
      note: 'Bütün filiallarda payız kolleksiyasının vitrin dəyişimi və 15% VIP endirimi başladıldı.',
      author: 'Nərgiz Məmmədova (Marketinq Direktoru)',
      type: 'campaign',
    },
    {
      id: 'ann-2',
      date: '2026-10-06',
      title: 'Qiymət İndeksasiyası (İdxal Malları)',
      note: 'Avropa brendlərində tədarük qiyməti artımına görə pərakəndə qiymətlər orta hesabla 6% artırıldı.',
      author: 'Eldar Rzayev (Maliyyə Direktoru)',
      type: 'manager_note',
    },
    {
      id: 'ann-3',
      date: '2026-10-09',
      title: 'Gənclik Mall Elektrik Təmiri',
      note: 'Ticarət mərkəzində təmir səbəbindən filial saat 14:00-dək fəaliyyət göstərmədi.',
      author: 'Vüqar Qasımov (Əməliyyat Meneceri)',
      type: 'manager_note',
    },
  ];

  async getExecutivePerformance(
    _params?: { branchIds?: string[]; dateFrom?: string; dateTo?: string }
  ): Promise<ExecutiveBiData> {
    return {
      generatedAt: '2026-10-12 01:25:00 (Asia/Baku)',
      isDemo: true,
      periodSummary: {
        currentSalesAzn: 128300,
        previousSalesAzn: 111750,
        growthPercent: 14.8,
        targetAchievementPercent: 91.6,
      },
      periodComparisons: [
        { metric: 'Xalis Satış Həcmi', currentValue: 128300, previousValue: 111750, varianceAbsolute: 16550, variancePercent: 14.8, isPositive: true },
        { metric: 'Satılan Ədəd Sayı', currentValue: 3260, previousValue: 2985, varianceAbsolute: 275, variancePercent: 9.2, isPositive: true },
        { metric: 'Orta Qəbz Məbləği (ATV)', currentValue: 78.71, previousValue: 74.89, varianceAbsolute: 3.82, variancePercent: 5.1, isPositive: true },
        { metric: 'Ümumi Mənfəət', currentValue: 60300, previousValue: 51800, varianceAbsolute: 8500, variancePercent: 16.4, isPositive: true },
        { metric: 'Qaytarma Məbləği', currentValue: 3850, previousValue: 4200, varianceAbsolute: -350, variancePercent: -8.3, isPositive: true },
      ],
      branchRankings: [
        { branchId: 'b1', branchName: 'Baş Filial (Nizami)', salesAzn: 52400, sharePercent: 40.8, targetAzn: 50000, achievementPercent: 104.8, ordersCount: 620 },
        { branchId: 'b2', branchName: 'Gənclik Mall Filialı', salesAzn: 38900, sharePercent: 30.3, targetAzn: 45000, achievementPercent: 86.4, ordersCount: 490 },
        { branchId: 'b3', branchName: '28 Mall Filialı', salesAzn: 22800, sharePercent: 17.8, targetAzn: 28000, achievementPercent: 81.4, ordersCount: 305 },
        { branchId: 'b4', branchName: 'Sumqayıt Filialı', salesAzn: 14200, sharePercent: 11.1, targetAzn: 17000, achievementPercent: 83.5, ordersCount: 210 },
      ],
      sectionMix: [
        { section: 'Qadın Geyimi', salesAzn: 58200, sharePercent: 45.4, marginPercent: 49.5 },
        { section: 'Kişi Geyimi', salesAzn: 44600, sharePercent: 34.8, marginPercent: 47.1 },
        { section: 'Aksesuarlar', salesAzn: 16500, sharePercent: 12.9, marginPercent: 54.0 },
        { section: 'Ayaqqabı', salesAzn: 9000, sharePercent: 6.9, marginPercent: 41.2 },
      ],
      topProductCohorts: [
        { sku: 'TSH-WHT-M', name: 'Premium Pambıq Köynək (Ağ / M)', brand: 'BrandHouse Basics', category: 'Kişi Geyimi', unitsSold: 180, revenueAzn: 8100, growthPercent: 22.4, rank: 1 },
        { sku: 'JNS-SLM-32', name: 'Slim Fit Cins Şalvar (Göy / 32)', brand: 'Denim Studio', category: 'Kişi Geyimi', unitsSold: 112, revenueAzn: 8948.8, growthPercent: 14.6, rank: 2 },
        { sku: 'DRS-FLR-S', name: 'Güllü Yay Paltarı (Qırmızı / S)', brand: 'Silk Elegance', category: 'Qadın Geyimi', unitsSold: 70, revenueAzn: 6930, growthPercent: 9.8, rank: 3 },
        { sku: 'BLZ-SLK-M', name: 'Klassik İpək Kofta (Bej / M)', brand: 'Silk Elegance', category: 'Qadın Geyimi', unitsSold: 85, revenueAzn: 5865, growthPercent: -3.2, rank: 4 },
        { sku: 'BELT-LTH-BRN', name: 'Klassik Dəri Kəmər (Qəhvəyi)', brand: 'LeatherCraft', category: 'Aksesuarlar', unitsSold: 140, revenueAzn: 4480, growthPercent: 18.2, rank: 5 },
      ],
      annotations: [...this.annotations],
    };
  }

  async getInventoryIntelligence(
    _params?: { branchIds?: string[]; slowMovingThresholdDays?: number }
  ): Promise<InventoryIntelligenceData> {
    return {
      generatedAt: '2026-10-12 01:25:00 (Asia/Baku)',
      isDemo: true,
      inventoryTurnover: 4.2,
      daysOfInventory: 86.9,
      totalStockValueAzn: 184250,
      deadStockValueAzn: 14320,
      seasonSellThrough: [
        { season: 'Payız 2026', collection: 'Payız Kolleksiyası', initialStockQty: 1800, soldQty: 1230, currentStockQty: 570, strPercent: 68.3, status: 'optimal' },
        { season: 'Yay 2026', collection: 'Yay Geyimləri', initialStockQty: 2400, soldQty: 2180, currentStockQty: 220, strPercent: 90.8, status: 'fast' },
        { season: 'Yaz 2026', collection: 'Bahar Stil', initialStockQty: 1500, soldQty: 840, currentStockQty: 660, strPercent: 56.0, status: 'slow' },
      ],
      markdownCandidates: [
        {
          sku: 'WNT-COAT-XL',
          name: 'Qışlıq Yun Palto (Qara / XL)',
          brand: 'Nordic Warmth',
          category: 'Kişi Geyimi',
          ageDays: 135,
          currentStock: 8,
          costPriceAzn: 110.0,
          retailPriceAzn: 220.0,
          strPercent: 20.0,
          suggestedDiscountPercent: 30,
          reason: '135 gündür satılmır, qış kolleksiyası bağlanmalıdır',
        },
        {
          sku: 'SUM-HAT-WHT',
          name: 'Yaylıq Panama Papaq (Ağ)',
          brand: 'SunStyle',
          category: 'Aksesuarlar',
          ageDays: 102,
          currentStock: 24,
          costPriceAzn: 8.5,
          retailPriceAzn: 20.0,
          strPercent: 35.0,
          suggestedDiscountPercent: 40,
          reason: 'Yay mövsümü bitib, anbarı boşaltmaq məqsədilə 40% endirim təklif olunur',
        },
        {
          sku: 'DRS-SUM-GRN',
          name: 'Kətan Yay Donu (Yaşıl / 38)',
          brand: 'Silk Elegance',
          category: 'Qadın Geyimi',
          ageDays: 94,
          currentStock: 12,
          costPriceAzn: 35.0,
          retailPriceAzn: 75.0,
          strPercent: 42.0,
          suggestedDiscountPercent: 25,
          reason: 'Satış sürəti zəifləyib, mövsüm sonu endirimi tövsiyə edilir',
        },
      ],
      reorderSuggestions: [
        {
          sku: 'TSH-WHT-M',
          name: 'Premium Pambıq Köynək (Ağ / M)',
          brand: 'BrandHouse Basics',
          currentStock: 14,
          safetyStock: 25,
          leadTimeDays: 7,
          dailyVelocity: 4.8,
          suggestedReorderQty: 45,
          explanation: {
            safetyStockInput: 25,
            leadTimeDaysInput: 7,
            dailyVelocityInput: 4.8,
            formulaText: 'Tövsiyə = (Gündəlik Satış 4.8 × Tədarük Günləri 7) + Təhlükəsizlik Ehtiyatı 25 - Mövcud Qalıq 14 ≈ 45 ədəd',
          },
        },
        {
          sku: 'JNS-SLM-32',
          name: 'Slim Fit Cins Şalvar (Göy / 32)',
          brand: 'Denim Studio',
          currentStock: 12,
          safetyStock: 20,
          leadTimeDays: 10,
          dailyVelocity: 3.2,
          suggestedReorderQty: 40,
          explanation: {
            safetyStockInput: 20,
            leadTimeDaysInput: 10,
            dailyVelocityInput: 3.2,
            formulaText: 'Tövsiyə = (Gündəlik Satış 3.2 × Tədarük Günləri 10) + Təhlükəsizlik Ehtiyatı 20 - Mövcud Qalıq 12 ≈ 40 ədəd',
          },
        },
        {
          sku: 'BLZ-SLK-M',
          name: 'Klassik İpək Kofta (Bej / M)',
          brand: 'Silk Elegance',
          currentStock: 9,
          safetyStock: 15,
          leadTimeDays: 5,
          dailyVelocity: 2.1,
          suggestedReorderQty: 20,
          explanation: {
            safetyStockInput: 15,
            leadTimeDaysInput: 5,
            dailyVelocityInput: 2.1,
            formulaText: 'Tövsiyə = (Gündəlik Satış 2.1 × Tədarük Günləri 5) + Təhlükəsizlik Ehtiyatı 15 - Mövcud Qalıq 9 ≈ 20 ədəd',
          },
        },
      ],
    };
  }

  async getCustomerAnalytics(
    _params?: { branchIds?: string[]; dateFrom?: string; dateTo?: string }
  ): Promise<CustomerAnalyticsData> {
    return {
      generatedAt: '2026-10-12 01:25:00 (Asia/Baku)',
      isDemo: true,
      newVsReturning: {
        newCustomerCount: 312,
        returningCustomerCount: 888,
        newSharePercent: 26.0,
        returningSharePercent: 74.0,
      },
      rfmSegments: [
        { segmentName: 'Çempionlar (VIP)', customerCount: 142, avgSpentAzn: 850.0, sharePercent: 11.8, description: 'Yüksək tezlik və yüksək məbləğlə alış-veriş edən ən dəyərli müştərilər' },
        { segmentName: 'Sadiq Alıcılar', customerCount: 298, avgSpentAzn: 420.0, sharePercent: 24.8, description: 'Davamlı alış-veriş edən stabil müştəri bazası' },
        { segmentName: 'Potensial Sadiqlər', customerCount: 340, avgSpentAzn: 210.0, sharePercent: 28.3, description: 'Yaxın zamanda alış-veriş etmiş orta səviyyəli alıcılar' },
        { segmentName: 'Risk Qrupunda', customerCount: 245, avgSpentAzn: 180.0, sharePercent: 20.4, description: 'Əvvəllər tez-tez alan, lakin son 60-90 gündə gəlməyən müştərilər' },
        { segmentName: 'Passiv / İtirilmiş', customerCount: 175, avgSpentAzn: 95.0, sharePercent: 14.7, description: '90 gündən çoxdur əlaqəsi olmayan müştərilər' },
      ],
      ltvDistribution: [
        { tierRange: '< 100 ₼', customerCount: 320, totalLtvAzn: 22400 },
        { tierRange: '100 - 300 ₼', customerCount: 450, totalLtvAzn: 85500 },
        { tierRange: '300 - 600 ₼', customerCount: 280, totalLtvAzn: 117600 },
        { tierRange: '600 - 1500 ₼', customerCount: 115, totalLtvAzn: 103500 },
        { tierRange: '> 1500 ₼', customerCount: 35, totalLtvAzn: 68250 },
      ],
      basketAssociations: [
        {
          productA: 'Premium Pambıq Köynək (Ağ)',
          productB: 'Slim Fit Cins Şalvar (Göy)',
          coOccurrenceCount: 94,
          confidencePercent: 42.1,
          liftScore: 2.85,
        },
        {
          productA: 'Klassik Dəri Kəmər (Qəhvəyi)',
          productB: 'Klassik Parça Şalvar (Qara)',
          coOccurrenceCount: 63,
          confidencePercent: 51.3,
          liftScore: 3.42,
        },
        {
          productA: 'Güllü Yay Paltarı (Qırmızı)',
          productB: 'Kətan Şal (Ağ)',
          coOccurrenceCount: 54,
          confidencePercent: 38.6,
          liftScore: 2.45,
        },
      ],
      churnRiskCustomers: [
        { customerId: 'cust-102', name: 'Fərid Məmmədov', phone: '+994 50 211 44 55', daysSinceLastPurchase: 98, ordersCount: 7, ltvAzn: 1420.0, riskLevel: 'high' },
        { customerId: 'cust-185', name: 'Samirə Hüseynova', phone: '+994 55 330 22 11', daysSinceLastPurchase: 84, ordersCount: 5, ltvAzn: 980.0, riskLevel: 'high' },
        { customerId: 'cust-204', name: 'İlqar Əliyev', phone: '+994 70 812 34 56', daysSinceLastPurchase: 72, ordersCount: 4, ltvAzn: 810.0, riskLevel: 'medium' },
      ],
    };
  }

  async getProfitabilityData(
    _params?: { branchIds?: string[]; dateFrom?: string; dateTo?: string }
  ): Promise<ProfitabilityData> {
    return {
      generatedAt: '2026-10-12 01:25:00 (Asia/Baku)',
      isDemo: true,
      activeCogsMethod: 'Çəkili Orta Maya (Weighted Average)',
      totalRevenueAzn: 128300,
      cogsAzn: 68000,
      grossProfitAzn: 60300,
      grossMarginPercent: 47.0,
      discountLeakageAzn: 6850,
      returnCostAzn: 1420,
      marginByBrand: [
        { brand: 'LeatherCraft', revenueAzn: 16500, cogsAzn: 7590, grossProfitAzn: 8910, marginPercent: 54.0 },
        { brand: 'Silk Elegance', revenueAzn: 58200, cogsAzn: 29391, grossProfitAzn: 28809, marginPercent: 49.5 },
        { brand: 'Denim Studio', revenueAzn: 28400, cogsAzn: 14768, grossProfitAzn: 13632, marginPercent: 48.0 },
        { brand: 'BrandHouse Basics', revenueAzn: 25200, cogsAzn: 16254, grossProfitAzn: 8946, marginPercent: 35.5 },
      ],
      marginByCategory: [
        { category: 'Aksesuarlar', revenueAzn: 16500, cogsAzn: 7590, grossProfitAzn: 8910, marginPercent: 54.0 },
        { category: 'Qadın Geyimi', revenueAzn: 58200, cogsAzn: 29391, grossProfitAzn: 28809, marginPercent: 49.5 },
        { category: 'Kişi Geyimi', revenueAzn: 44600, cogsAzn: 23593, grossProfitAzn: 21007, marginPercent: 47.1 },
        { category: 'Ayaqqabı', revenueAzn: 9000, cogsAzn: 5292, grossProfitAzn: 3708, marginPercent: 41.2 },
      ],
    };
  }

  async getAnomalies(
    params?: { branchIds?: string[] }
  ): Promise<AnomalyItem[]> {
    let list = [...this.anomalies];
    if (params?.branchIds && params.branchIds.length > 0) {
      list = list.filter((a) => a.id.length > 0);
    }
    return list;
  }

  async getChartAnnotations(): Promise<ChartAnnotation[]> {
    return [...this.annotations];
  }

  async addChartAnnotation(
    annotation: Omit<ChartAnnotation, 'id'>
  ): Promise<ChartAnnotation> {
    const newAnn: ChartAnnotation = {
      ...annotation,
      id: `ann-${Date.now()}`,
    };
    this.annotations.push(newAnn);
    return { ...newAnn };
  }
}
