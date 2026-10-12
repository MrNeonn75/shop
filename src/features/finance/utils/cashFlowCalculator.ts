import { Qapik, toQapik } from '../../../shared/utils/money';
import { CashFlowReport, CashFlowCategoryLine, AccountMovement } from '../types';

export interface CashFlowDerivationInput {
  period: string;
  branchFilterName: string;
  openingCashAndBankQapik: Qapik;
  movements: AccountMovement[];
}

/**
 * Derives a Direct Method Cash Flow statement from actual cash and bank movements.
 * Enforces the core accounting principle: Cash received is NOT revenue!
 * (e.g. advances and loans are cash received without being earned revenue).
 */
export function deriveCashFlowDirectMethod(input: CashFlowDerivationInput): CashFlowReport {
  let totalOperatingIn = 0;
  let totalOperatingOut = 0;
  let totalInvesting = 0;
  let totalFinancing = 0;

  const inflowCategoryMap: Record<string, number> = {
    'Nağd və Kart Satış Daxilolmaları': 0,
    'Müştəri Debitor Yığımları': 0,
    'Digər Əməliyyat Gəlirləri': 0,
  };

  const outflowCategoryMap: Record<string, number> = {
    'Təchizatçılara Mallar Üçün Ödənişlər': 0,
    'İcarə və Kommunal Ödənişləri': 0,
    'Əməkhaqqı və Mükafatlar': 0,
    'Marketinq və Reklam Xərcləri': 0,
    'Digər Əməliyyat Xərcləri': 0,
  };

  for (const m of input.movements) {
    if (m.isReversed) continue; // Skip reversed movements

    const amt = Number(m.amountQapik);

    switch (m.type) {
      case 'pos_closing':
        inflowCategoryMap['Nağd və Kart Satış Daxilolmaları'] += amt;
        totalOperatingIn += amt;
        break;

      case 'customer_collection':
        inflowCategoryMap['Müştəri Debitor Yığımları'] += amt;
        totalOperatingIn += amt;
        break;

      case 'other_income':
        inflowCategoryMap['Digər Əməliyyat Gəlirləri'] += amt;
        totalOperatingIn += amt;
        break;

      case 'supplier_payment':
        outflowCategoryMap['Təchizatçılara Mallar Üçün Ödənişlər'] += amt;
        totalOperatingOut += amt;
        break;

      case 'expense_payment':
        // Categorize based on description or default
        if (m.description.toLowerCase().includes('icarə') || m.description.toLowerCase().includes('kommunal')) {
          outflowCategoryMap['İcarə və Kommunal Ödənişləri'] += amt;
        } else if (m.description.toLowerCase().includes('maaş') || m.description.toLowerCase().includes('əməkhaqqı')) {
          outflowCategoryMap['Əməkhaqqı və Mükafatlar'] += amt;
        } else if (m.description.toLowerCase().includes('marketinq') || m.description.toLowerCase().includes('reklam')) {
          outflowCategoryMap['Marketinq və Reklam Xərcləri'] += amt;
        } else {
          outflowCategoryMap['Digər Əməliyyat Xərcləri'] += amt;
        }
        totalOperatingOut += amt;
        break;

      // Internal movements (transfer, deposit, withdrawal) do not alter consolidated cash balance
      case 'transfer':
      case 'deposit':
      case 'withdrawal':
      default:
        break;
    }
  }

  const operatingInflows: CashFlowCategoryLine[] = Object.entries(inflowCategoryMap)
    .filter(([_, val]) => val > 0)
    .map(([cat, val]) => ({
      categoryName: cat,
      amountQapik: toQapik(val),
      isPositive: true,
    }));

  const operatingOutflows: CashFlowCategoryLine[] = Object.entries(outflowCategoryMap)
    .filter(([_, val]) => val > 0)
    .map(([cat, val]) => ({
      categoryName: cat,
      amountQapik: toQapik(val),
      isPositive: false,
    }));

  const totalOperatingInflowsQapik = toQapik(totalOperatingIn);
  const totalOperatingOutflowsQapik = toQapik(totalOperatingOut);
  const netOperatingCashFlowQapik = toQapik(totalOperatingIn - totalOperatingOut);

  const netCashChangeQapik = toQapik(
    Number(netOperatingCashFlowQapik) + totalInvesting + totalFinancing
  );

  const closingCashAndBankQapik = toQapik(
    Number(input.openingCashAndBankQapik) + Number(netCashChangeQapik)
  );

  return {
    period: input.period,
    branchFilterName: input.branchFilterName,
    openingCashAndBankQapik: input.openingCashAndBankQapik,
    operatingInflows,
    totalOperatingInflowsQapik,
    operatingOutflows,
    totalOperatingOutflowsQapik,
    netOperatingCashFlowQapik,
    investingCashFlowQapik: toQapik(totalInvesting),
    financingCashFlowQapik: toQapik(totalFinancing),
    netCashChangeQapik,
    closingCashAndBankQapik,
    generatedAt: new Date().toISOString(),
  };
}

