import { Qapik, toQapik } from '../../../shared/utils/money';
import { ManagementPnlReport, ManagementPnlLine } from '../types';

export interface PnlInputData {
  period: string;
  branchFilterName: string;
  cogsMethodLabel?: string;
  grossSalesQapik: Qapik;
  returnsQapik: Qapik;
  cogsQapik: Qapik;
  operatingExpenses: Array<{
    categoryId: string;
    categoryName: string;
    amountQapik: Qapik;
    drillDownCount?: number;
  }>;
  // Cost validation inputs
  hasMissingCostData?: boolean;
  unapprovedExpenseCount?: number;
  unclosedCountSessions?: number;
  pendingInvoiceCount?: number;
}

/**
 * Calculates Management P&L metrics with strict compliance to financial principles:
 * - Net Revenue = Gross Sales − Returns
 * - Gross Profit = Net Revenue − COGS
 * - Operating Expenses grouped by category with % of revenue
 * - Net Profit conditional calculation: only computed when all required cost data exists;
 *   otherwise marked as "Hesablanmayıb" with explicit missing-data reason list.
 */
export function calculateManagementPnl(input: PnlInputData): ManagementPnlReport {
  const netRevenueQapik = toQapik(Math.max(0, Number(input.grossSalesQapik) - Number(input.returnsQapik)));
  const cogsQapik = toQapik(Math.max(0, Number(input.cogsQapik)));
  const grossProfitQapik = toQapik(Number(netRevenueQapik) - Number(cogsQapik));

  const grossProfitMarginPercent =
    Number(netRevenueQapik) > 0
      ? Math.round((Number(grossProfitQapik) / Number(netRevenueQapik)) * 10000) / 100
      : 0;

  let totalOpex = 0;
  const opexLines: ManagementPnlLine[] = input.operatingExpenses.map((exp) => {
    const amt = Number(exp.amountQapik);
    totalOpex += amt;
    const pct =
      Number(netRevenueQapik) > 0
        ? Math.round((amt / Number(netRevenueQapik)) * 10000) / 100
        : 0;
    return {
      lineId: exp.categoryId,
      titleAz: exp.categoryName,
      amountQapik: exp.amountQapik,
      percentageOfRevenue: pct,
      drillDownCount: exp.drillDownCount || 1,
    };
  });

  const totalOpexQapik = toQapik(totalOpex);

  // Check data completeness for Net Profit
  const missingReasons: string[] = [];
  if (input.hasMissingCostData) {
    missingReasons.push('Kataloqda bəzi satılmış SKU-lar üzrə alış maya dəyəri (Cost Price) təyin edilməyib.');
  }
  if (input.unapprovedExpenseCount && input.unapprovedExpenseCount > 0) {
    missingReasons.push(`${input.unapprovedExpenseCount} sayda təsdiqlənməmiş xərc qaralaması mövcuddur.`);
  }
  if (input.unclosedCountSessions && input.unclosedCountSessions > 0) {
    missingReasons.push(`${input.unclosedCountSessions} sayda açıq inventarizasiya (sayım) sessiyası tamamlanmayıb.`);
  }
  if (input.pendingInvoiceCount && input.pendingInvoiceCount > 0) {
    missingReasons.push(`${input.pendingInvoiceCount} sayda təchizatçı fakturası üzrə 3-Way Match tamamlanmayıb.`);
  }

  const isNetProfitComputable = missingReasons.length === 0;

  let netProfitQapik: Qapik | undefined = undefined;
  let netProfitMarginPercent: number | undefined = undefined;

  if (isNetProfitComputable) {
    netProfitQapik = toQapik(Number(grossProfitQapik) - Number(totalOpexQapik));
    netProfitMarginPercent =
      Number(netRevenueQapik) > 0
        ? Math.round((Number(netProfitQapik) / Number(netRevenueQapik)) * 10000) / 100
        : 0;
  }

  return {
    period: input.period,
    branchFilterName: input.branchFilterName,
    cogsMethodLabel: input.cogsMethodLabel || 'Çəkili Orta Maya (Weighted Average)',
    netRevenueQapik,
    cogsQapik,
    grossProfitQapik,
    grossProfitMarginPercent,
    operatingExpenses: opexLines,
    totalOpexQapik,
    isNetProfitComputable,
    missingDataReasons: missingReasons,
    netProfitQapik,
    netProfitMarginPercent,
    generatedAt: new Date().toISOString(),
  };
}

