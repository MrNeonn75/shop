import { KPI_DEFINITIONS } from '../../dashboard/kpiDefinitions';

/**
 * BRAND HOUSE ERP — Finance Module KPI Definitions
 *
 * Grounded in the central KPI registry while providing specialized operational
 * financial definitions for liquid balances, corporate receivables, payables, and period OPEX.
 */

export interface FinanceKpiDefinition {
  id: string;
  nameAz: string;
  shortNameAz: string;
  formulaText: string;
  unit: 'azn' | 'count' | 'percent';
  dataSource: string;
  description: string;
}

export const FINANCE_KPIS: Record<string, FinanceKpiDefinition> = {
  cashAndBankBalances: {
    id: 'cashAndBankBalances',
    nameAz: 'Cəmi Pul Vəsaitləri (Kassa və Bank)',
    shortNameAz: 'Kassa və Bank',
    formulaText: '∑ Filial Kassa Qalıqları + ∑ Bank Cari Hesabları + ∑ POS Klirinq Qalıqları',
    unit: 'azn',
    dataSource: 'Maliyyə Hesabları və Hərəkət Jurnalı (Cash & Bank Ledger)',
    description:
      'Bütün filial kassalarında mövcud olan nağd pul, bank hesablarındakı sərbəst vəsaitlər və POS terminal klirinq tranzitində olan məbləğlərin ümumi cəmi.',
  },

  customerReceivables: {
    id: 'customerReceivables',
    nameAz: 'Müştəri Debitor Borcları (Receivables)',
    shortNameAz: 'Debitor Borclar',
    formulaText: '∑ Korporativ / Nisyə Satış Fakturaları − ∑ Daxil Olmuş Ödənişlər',
    unit: 'azn',
    dataSource: 'Debitor Borclar Kitabı (Accounts Receivable)',
    description:
      'Korporativ müştərilərə və tərəfdaşlara kreditlə təqdim edilmiş mallar üzrə vaxtı çatmış və cari ödənilməmiş borc qalıqları.',
  },

  supplierPayables: {
    id: 'supplierPayables',
    nameAz: KPI_DEFINITIONS.supplierLiabilities.nameAz,
    shortNameAz: KPI_DEFINITIONS.supplierLiabilities.shortNameAz,
    formulaText: KPI_DEFINITIONS.supplierLiabilities.formulaText,
    unit: 'azn',
    dataSource: KPI_DEFINITIONS.supplierLiabilities.dataSource,
    description: KPI_DEFINITIONS.supplierLiabilities.description,
  },

  periodExpenses: {
    id: 'periodExpenses',
    nameAz: 'Dövrün Əməliyyat Xərcləri (OPEX)',
    shortNameAz: 'Dövrün Xərcləri',
    formulaText: '∑ Təsdiqlənmiş və Ödənilmiş Əməliyyat Xərcləri (İcarə + Əməkhaqqı + Kommunal + Digər)',
    unit: 'azn',
    dataSource: 'Xərc Qeydiyyatı Jurnalı (Expense Records Ledger)',
    description:
      'Seçilmiş filial və dövr ərzində formalaşmış və təsdiq olunmuş bütün birbaşa və dolayı əməliyyat xərclərinin ümumi məbləği (Maya dəyəri / COGS bura daxil deyil).',
  },

  pendingApprovals: {
    id: 'pendingApprovals',
    nameAz: 'Təsdiq Gözləyən Maliyyə Əməliyyatları',
    shortNameAz: 'Təsdiq Gözləyən',
    formulaText: 'Say(Status = "submitted" və ya "pending_approval" olan xərc, ödəniş və büdcə tələbləri)',
    unit: 'count',
    dataSource: 'Vahid Təsdiq Növbəsi (Unified Approvals Queue)',
    description:
      'Filial menecerləri, baş mühasib və ya baş menecer tərəfindən baxılmalı və təsdiqlənməli olan açıq xərc sənədləri və limitdən artıq ödənişlər.',
  },
};
