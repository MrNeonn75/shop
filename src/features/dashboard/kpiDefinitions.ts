/**
 * BRAND HOUSE ERP — KPI Definitions Registry
 *
 * Centralized catalogue of executive and operational KPI metrics.
 * Every KPI includes an Azerbaijani title, exact mathematical/accounting formula text,
 * measurement unit, authoritative data source, and clear distinction between
 * revenue, cash received, operating expenses, COGS, gross profit, and net profit.
 */

export type KpiUnit = 'azn' | 'percent' | 'qty' | 'ratio';

export type KpiMetricId =
  | 'totalSales'
  | 'grossProfit'
  | 'netProfit'
  | 'salesGrowth'
  | 'averageOrderValue'
  | 'unitsSold'
  | 'returnRate'
  | 'inventoryValue'
  | 'inventoryTurnover'
  | 'supplierLiabilities'
  | 'discountCost';

export interface KpiDefinition {
  id: KpiMetricId;
  nameAz: string;
  shortNameAz: string;
  formulaText: string;
  unit: KpiUnit;
  dataSource: string;
  description: string;
  category: 'sales' | 'profitability' | 'inventory' | 'finance';
}

export const KPI_DEFINITIONS: Record<KpiMetricId, KpiDefinition> = {
  totalSales: {
    id: 'totalSales',
    nameAz: 'Ümumi Xalis Satış',
    shortNameAz: 'Xalis Satış',
    formulaText: 'Brutto Satış Məbləği − Qaytarılan Çeklərin Məbləği (Net of Returns)',
    unit: 'azn',
    dataSource: 'Kassa və Satış Modulu (POS / Sales Transactions)',
    description:
      'Dövr ərzində bütün filiallar və ya seçilmiş filial üzrə vurulmuş satış çeklərinin ümumi məbləğindən müştəri qaytarmaları çıxıldıqdan sonra qalan faktiki xalis satış həcmi.',
    category: 'sales',
  },

  grossProfit: {
    id: 'grossProfit',
    nameAz: 'Ümumi Mənfəət (Gross Profit)',
    shortNameAz: 'Ümumi Mənfəət',
    formulaText:
      'Xalis Satış Gəliri − COGS (Satılan Malların Maya Dəyəri; Çəkili Orta / Weighted Average metodu ilə)',
    unit: 'azn',
    dataSource: 'Satış Modulu və Kataloq Maya Qiymətləri (COGS Registry)',
    description:
      'Malların birbaşa alış / idxal maya dəyəri çıxıldıqdan sonra əldə edilən əsas ticarət mənfəəti. Maya dəyəri çəkili orta maya metodologiyası ilə hesablanır.',
    category: 'profitability',
  },

  netProfit: {
    id: 'netProfit',
    nameAz: 'Xalis Mənfəət (Net Profit)',
    shortNameAz: 'Xalis Mənfəət',
    formulaText:
      'Ümumi Mənfəət − Əməliyyat Xərcləri (OPEX: İcarə, Əməkhaqqı, Kommunal, Marketinq, İnzibati xərclər və Vergilər)',
    unit: 'azn',
    dataSource: 'Maliyyə və Xərc Kitabı (General Ledger & Expenses)',
    description:
      'Bütün təsdiqlənmiş əməliyyat xərcləri, icarə və inzibati məsrəflər çıxıldıqdan sonra şirkətin xalis gəliri. Yalnız bütün xərc maddələri qeydiyyata alındıqda tam hesablanır, əks halda "Hesablanmayıb" vəziyyəti göstərilir.',
    category: 'profitability',
  },

  salesGrowth: {
    id: 'salesGrowth',
    nameAz: 'Satış Artım Tempu (Sales Growth)',
    shortNameAz: 'Satış Artımı',
    formulaText:
      '((Cari Dövrün Xalis Satışı − Müqayisə Dövrünün Xalis Satışı) / Müqayisə Dövrünün Xalis Satışı) × 100',
    unit: 'percent',
    dataSource: 'Müqayisəli Satış Hesabatları (Historical Sales Analytics)',
    description:
      'Cari seçilmiş dövrün xalis satış həcminin əvvəlki dövrə və ya keçən ilin eyni dövrünə nisbətən faizlə artım və ya azalma dinamikası.',
    category: 'sales',
  },

  averageOrderValue: {
    id: 'averageOrderValue',
    nameAz: 'Orta Çek Məbləği (AOV)',
    shortNameAz: 'Orta Çek',
    formulaText: 'Xalis Satış Məbləği / Uğurlu Satış Çeklərinin Sayı',
    unit: 'azn',
    dataSource: 'Kassa Əməliyyatları (POS Receipts Count & Totals)',
    description:
      'Bir müştəri tərəfindən tək bir alış-veriş zamanı orta hesabla xərclənən pul məbləği.',
    category: 'sales',
  },

  unitsSold: {
    id: 'unitsSold',
    nameAz: 'Satılan Məhsul Sayı',
    shortNameAz: 'Satılan Ədəd',
    formulaText: 'Satılmış Ədədlər − Qaytarılmış Ədədlər',
    unit: 'qty',
    dataSource: 'Satış Sənədləri və Kassa Detalları (Sales Order Items)',
    description:
      'Dövr ərzində bütün bölmələr (Kişi, Qadın, Uşaq, Digər) üzrə satılmış xalis geyim, ayaqqabı və aksesuar vahidlərinin ümumi fiziki sayı.',
    category: 'sales',
  },

  returnRate: {
    id: 'returnRate',
    nameAz: 'Qaytarılma Faizi (Return Rate)',
    shortNameAz: 'Qaytarılma %',
    formulaText: '(Qaytarılan Məhsulların Məbləği / Brutto Satış Məbləği) × 100',
    unit: 'percent',
    dataSource: 'Qaytarılma Qaimələri və Kassa İadələri (Refund Transactions)',
    description:
      'Müştərilər tərəfindən geri qaytarılmış malların ümumi brutto satışa nisbətini göstərən faiz göstəricisi.',
    category: 'sales',
  },

  inventoryValue: {
    id: 'inventoryValue',
    nameAz: 'İnventar Stok Dəyəri',
    shortNameAz: 'Stok Dəyəri',
    formulaText: '∑ (Mövcud Qalıq Qalıq Sayı × Maya Qiyməti / Cost Price)',
    unit: 'azn',
    dataSource: 'Anbar Qalıqları və Alış Maya Dəyərləri (Inventory Valuation)',
    description:
      'Bütün mərkəzi anbar və filial vitrinlərində mövcud olan cari fiziki malların alış/maya dəyəri üzrə ümumi pul ekvivalenti.',
    category: 'inventory',
  },

  inventoryTurnover: {
    id: 'inventoryTurnover',
    nameAz: 'İnventar Dövriyyə Sürəti (Turnover Ratio)',
    shortNameAz: 'Stok Dövriyyəsi',
    formulaText: 'Dövrün COGS Dəyəri / Dövr Ərzindəki Orta İnventar Dəyəri',
    unit: 'ratio',
    dataSource: 'Məhsul Hərəkəti və Maya Balansı (Inventory Movement History)',
    description:
      'Məhsul ehtiyatlarının nə qədər tez satıldığını və yeniləndiyini ölçən əmsal. Əmsalın yüksək olması likvidliyin yüksək olduğunu bildirir.',
    category: 'inventory',
  },

  supplierLiabilities: {
    id: 'supplierLiabilities',
    nameAz: 'Təchizatçılara Borclar (Payables)',
    shortNameAz: 'Təchizatçı Borcu',
    formulaText: '∑ Qəbul Edilmiş Təchizat Qaimələri − ∑ Təchizatçılara Ödənilmiş Məbləğ',
    unit: 'azn',
    dataSource: 'Satınalma və Kreditor Borclar Kitabı (Accounts Payable)',
    description:
      'Yerli və xarici geyim brendləri üzrə tədarük edilmiş mallara görə ödənilməmiş açıq kreditor borclarının yekun balansı.',
    category: 'finance',
  },

  discountCost: {
    id: 'discountCost',
    nameAz: 'Endirim Xərci (Discount Expense)',
    shortNameAz: 'Endirim Xərci',
    formulaText: '∑ (İlkin Pərakəndə Qiymət − Faktiki Satış Qiyməti)',
    unit: 'azn',
    dataSource: 'Kassa Promosiyaları və Endirim Logu (Discount Journal)',
    description:
      'Mövsümi endirimlər, loyallıq kartları və xüsusi aksiyalar nəticəsində təqdim edilmiş ümumi güzəşt məbləği.',
    category: 'sales',
  },
};

export const KPI_DEFINITIONS_LIST: KpiDefinition[] = Object.values(KPI_DEFINITIONS);

export function getKpiDefinition(id: KpiMetricId): KpiDefinition {
  return KPI_DEFINITIONS[id];
}

