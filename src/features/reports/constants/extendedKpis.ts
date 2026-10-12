import { KPI_DEFINITIONS, KpiDefinition } from '../../dashboard/kpiDefinitions';

/**
 * BRAND HOUSE ERP — Extended Centralized KPI Definitions Registry
 *
 * Expands the core KPI registry from Milestone F3 with operational, accounting,
 * inventory intelligence, and customer analytics formulas.
 *
 * STRICT PRINCIPLE:
 * Every KPI displayed in reports and BI has a documented definition (tooltip + drawer)
 * referencing this registry. Definitions are not duplicated.
 */

export interface ExtendedKpiDefinition extends KpiDefinition {
  isSensitive?: boolean;
}

export const EXTENDED_KPI_REGISTRY: Record<string, ExtendedKpiDefinition> = {
  // Inherit all core F3 KPIs
  ...KPI_DEFINITIONS,

  // Reports & BI Additions
  cogsWeightedAverage: {
    id: 'grossProfit',
    nameAz: 'Satılan Malların Maya Dəyəri (COGS)',
    shortNameAz: 'COGS (Maya)',
    formulaText: '∑ (Satılmış Məhsul Sayı × Həmin Filialdakı Çəkili Orta Maya Qiyməti)',
    unit: 'azn',
    dataSource: 'Kataloq Maya Qeydiyyatı və Anbar Mədaxil Partiyaları (FIFO/Weighted Average)',
    description:
      'Dövr ərzində satılmış malların birbaşa alış və ya idxal maya dəyəri. Şirkət parametrlərində təyin olunmuş Çəkili Orta Maya (Weighted Average) metodologiyasına əsaslanır.',
    category: 'profitability',
    isSensitive: true,
  },

  netProfitManagement: {
    id: 'netProfit',
    nameAz: 'Xalis İdarəetmə Mənfəəti (Net Profit)',
    shortNameAz: 'Xalis Mənfəət',
    formulaText: 'Ümumi Mənfəət (Gross Profit) − Bütün Əməliyyat Xərcləri (İcarə + Əməkhaqqı + Kommunal + Digər OPEX)',
    unit: 'azn',
    dataSource: 'İdarəetmə P&L Hesabatı (Management P&L)',
    description:
      'Yalnız bütün xərc maddələri (maya dəyəri, işçi haqqı, icarə, vergilər) mövcud olduqda hesablanır. Hər hansı xərc məlumatı çatışmadıqda sistem bu rəqəmi hesablamır və "Hesablanmayıb" qeydi göstərir.',
    category: 'profitability',
    isSensitive: true,
  },

  inventoryTurnoverDays: {
    id: 'inventoryTurnover',
    nameAz: 'Ehtiyatların Dövriyyə Müddəti (Days of Inventory - DIO)',
    shortNameAz: 'Dövriyyə Günü (DIO)',
    formulaText: '(Orta Stok Maya Dəyəri ÷ Dövrün COGS) × Dövrün Gün Sayı (məs: 365)',
    unit: 'ratio',
    dataSource: 'Anbar Qalıqları və Satış COGS',
    description:
      'Məhsulların anbarda qaldığı orta gün sayı. Rəqəm nə qədər kiçikdirsə, pərakəndə ehtiyatlar bir o qədər sürətlə pula çevrilir.',
    category: 'inventory',
  },

  sellThroughRate: {
    id: 'unitsSold',
    nameAz: 'Satılma Əmsalı (Sell-Through Rate - STR)',
    shortNameAz: 'Satılma (STR %)',
    formulaText: '(Satılmış Ədədlər ÷ (Dövrün Əvvəli Qalıq + Daxil Olmuş Mədaxil Ədədləri)) × 100%',
    unit: 'percent',
    dataSource: 'POS Satış və Anbar Hərəkətləri Kitabı',
    description:
      'Mövsüm və ya kolleksiya üzrə qəbul edilmiş malların hansı faizinin artıq satıldığını göstərir. Moda pərakəndəsində endirim (markdown) qərarları üçün əsas göstəricidir.',
    category: 'inventory',
  },

  deadStockValue: {
    id: 'inventoryValue',
    nameAz: 'Hərəkətsiz Stok Dəyəri (Dead Stock)',
    shortNameAz: 'Ölü Stok Dəyəri',
    formulaText: '∑ (Son 90/180 gündə heç bir satışı olmayan SKU-ların Qalıq Sayı × Maya Qiyməti)',
    unit: 'azn',
    dataSource: 'Anbar Qalıqları və Satış Tarixçəsi',
    description:
      'Müəyyən edilmiş kritik dövr ərzində filiallarda və mərkəzi anbarlarda heç bir hərəkəti olmayan malların maya dəyəri ilə dondurulmuş kapital həcmi.',
    category: 'inventory',
    isSensitive: true,
  },

  discountLeakage: {
    id: 'discountCost',
    nameAz: 'Endirim Sızması (Discount Leakage)',
    shortNameAz: 'Endirim Sızması',
    formulaText: '∑ (Standart Pərakəndə Satış Qiyməti − Faktiki Kassada Vurulmuş Qiymət)',
    unit: 'azn',
    dataSource: 'POS Satış Çekləri və Endirim Jurnalı',
    description:
      'Aksiyalar, promokodlar və kassir əl endirimləri nəticəsində şirkətin imtina etdiyi ümumi potensial gəlir və ya itirilmiş marja həcmi.',
    category: 'sales',
  },

  customerRetentionRate: {
    id: 'returnRate',
    nameAz: 'Müştəri Saxlanma Əmsalı (Retention Rate)',
    shortNameAz: 'Saxlanma (CRR %)',
    formulaText: '((Dövr Sonu Aktiv Müştərilər − Yeni Qeydiyyatlar) ÷ Dövr Əvvəli Aktiv Müştərilər) × 100%',
    unit: 'percent',
    dataSource: 'CRM Müştəri Kartotekası və Alış Tezliyi',
    description:
      'Mövcud müştərilərin Brand House mağazalarına təkrar səfər etmə və loyallıq dərəcəsi.',
    category: 'sales',
  },

  basketSizeUnits: {
    id: 'averageOrderValue',
    nameAz: 'Orta Səbət Tutumu (Basket Size / UPT)',
    shortNameAz: 'Səbət Tutumu (UPT)',
    formulaText: 'Cəmi Satılmış Məhsul Ədədi ÷ Cəmi Alış Çeki Sayı',
    unit: 'ratio',
    dataSource: 'POS Kassa Əməliyyatları',
    description:
      'Hər bir satış çekinə orta hesabla neçə ədəd məhsulun daxil olduğunu göstərir (Units Per Transaction).',
    category: 'sales',
  },

  priceVariancePurchasing: {
    id: 'supplierLiabilities',
    nameAz: 'Satınalma Qiymət Sapması (PPV)',
    shortNameAz: 'Qiymət Sapması (PPV)',
    formulaText: '∑ ((Faktiki Alış Faktura Qiyməti − Standart Müqavilə Qiyməti) × Mədaxil Sayı)',
    unit: 'azn',
    dataSource: 'Satınalma Qaimələri və Təchizatçı Qiymət Siyahısı',
    description:
      'Təchizatçının kəsdiyi faktura qiyməti ilə razılaşdırılmış baza müqavilə qiyməti arasındakı maliyyə fərqi.',
    category: 'finance',
    isSensitive: true,
  },

  cashVarianceDrawer: {
    id: 'totalSales',
    nameAz: 'Kassa Fərqi (Cash Over/Short)',
    shortNameAz: 'Kassa Fərqi',
    formulaText: 'Faktiki Sayılmış Nağd Pul − POS Reyestrində Gözlənilən Nağd Qalıq',
    unit: 'azn',
    dataSource: 'Növbə Bağlanışı və Kassa Z-Hesabatları',
    description:
      'Kassa növbəsinin təhvili zamanı kassir tərəfindən faktiki təhvil verilən məbləğlə sistemin hesabladığı nəzəri qalıq arasındakı kənarlaşma.',
    category: 'finance',
  },
};

export function getKpiDefinition(id: string): ExtendedKpiDefinition | undefined {
  return EXTENDED_KPI_REGISTRY[id];
}

