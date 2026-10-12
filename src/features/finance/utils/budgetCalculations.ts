import { Qapik, toQapik } from '../../../shared/utils/money';
import { BudgetAlertLevel } from '../types';

export interface BudgetVarianceResult {
  varianceQapik: Qapik; // actual - budgeted
  variancePercent: number; // ((actual - budgeted) / budgeted) * 100
  utilizationPercent: number; // (actual / budgeted) * 100
  alertLevel: BudgetAlertLevel;
  isOverBudget: boolean;
}

/**
 * Calculates budget variance, utilization %, and determines alert level
 * according to financial governance rules.
 * - normal: < 90% utilization
 * - warning: 90% - 100% utilization
 * - exceeded: > 100% utilization (actual > budgeted)
 */
export function calculateBudgetVariance(
  budgetedAmountQapik: Qapik | number,
  actualSpentQapik: Qapik | number
): BudgetVarianceResult {
  const budgeted = Math.max(0, Number(budgetedAmountQapik));
  const actual = Math.max(0, Number(actualSpentQapik));

  const diff = actual - budgeted;
  const varianceQapik = toQapik(diff);

  let utilizationPercent = 0;
  let variancePercent = 0;

  if (budgeted > 0) {
    utilizationPercent = Math.round((actual / budgeted) * 10000) / 100;
    variancePercent = Math.round(((actual - budgeted) / budgeted) * 10000) / 100;
  } else if (actual > 0) {
    utilizationPercent = 100;
    variancePercent = 100;
  }

  let alertLevel: BudgetAlertLevel = 'normal';
  const isOverBudget = actual > budgeted;

  if (isOverBudget) {
    alertLevel = 'exceeded';
  } else if (budgeted > 0 && actual >= budgeted * 0.9) {
    alertLevel = 'warning';
  }

  return {
    varianceQapik,
    variancePercent,
    utilizationPercent,
    alertLevel,
    isOverBudget,
  };
}

