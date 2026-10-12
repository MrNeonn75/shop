import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Building2,
  TrendingUp,
  Receipt,
  CheckCircle2,
  FileText,
  Clock,
  Info,
} from 'lucide-react';
import { financeRepository, branchRepository } from '../../../shared/adapters';
import {
  FinanceAccount,
  AccountMovement,
  ApprovalInboxItem,
} from '../types';
import { FINANCE_KPIS } from '../constants/financeKpis';
import { FinanceFilterBar } from '../components/FinanceFilterBar';
import { TaxComplianceNotice } from '../components/TaxComplianceNotice';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { toQapik } from '../../../shared/utils/money';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';

export const FinanceOverviewPage: React.FC = () => {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [recentMovements, setRecentMovements] = useState<AccountMovement[]>([]);
  const [approvals, setApprovals] = useState<ApprovalInboxItem[]>([]);
  const [receivablesTotalQapik, setReceivablesTotalQapik] = useState(0);
  const [periodExpensesQapik, setPeriodExpensesQapik] = useState(0);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [accList, movList, appList, recAging, expList, brList] = await Promise.all([
          financeRepository.getAccounts(),
          financeRepository.getMovements(),
          financeRepository.getPendingApprovals(),
          financeRepository.getReceivablesAging(),
          financeRepository.getExpenses({ status: 'paid' }),
          branchRepository.getBranches(),
        ]);

        setAccounts(accList);
        setRecentMovements(movList.slice(0, 6));
        setApprovals(appList);
        setReceivablesTotalQapik(Number(recAging.totalQapik));

        const totalExp = expList.reduce((sum, e) => sum + Number(e.totalAmountQapik), 0);
        setPeriodExpensesQapik(totalExp);

        setBranches(brList.map((b) => ({ id: b.id, name: b.name })));
      } catch (err) {
        console.error('Failed to load finance overview:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bh-accent" />
      </div>
    );
  }

  const totalCashQapik = accounts
    .filter((a) => a.type === 'cash')
    .reduce((sum, a) => sum + Number(a.currentBalanceQapik), 0);

  const totalBankQapik = accounts
    .filter((a) => a.type === 'bank')
    .reduce((sum, a) => sum + Number(a.currentBalanceQapik), 0);

  const totalCardClearingQapik = accounts
    .filter((a) => a.type === 'card_settlement')
    .reduce((sum, a) => sum + Number(a.currentBalanceQapik), 0);

  const totalLiquidFundsQapik = totalCashQapik + totalBankQapik + totalCardClearingQapik;
  const supplierPayablesQapik = 16500000; // 165,000.00 ₼ demo liability

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Maliyyə və Kassa İdarəetməsi
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Operativ pul vəsaitləri, kassa qalıqları, gəlir-xərc nəzarəti və təsdiq növbəsi
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link to="/finance/expenses">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Receipt className="h-4 w-4" />
              Xərc Daxil Et
            </Button>
          </Link>
          <Link to="/finance/accounts">
            <Button size="sm" className="gap-1.5">
              <Wallet className="h-4 w-4" />
              Köçürmə / Mədaxil
            </Button>
          </Link>
        </div>
      </div>

      {/* Principle Callout: Cash Received != Revenue */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            <strong>Maliyyə Qaydası:</strong> Nağd Daxilolma (Cash Received) ≠ Satış Gəliri (Revenue).
            Gəlir alqı-satqı qaiməsi və ya çek kəsildikdə yaranır, nağd pul isə faktiki ödənildikdə kassaya oturur.
          </span>
        </div>
        <TaxComplianceNotice compact />
      </div>

      {/* Sticky Filter Bar */}
      <FinanceFilterBar branches={branches} />

      {/* Top 5 KPI Cards with Registry Tooltips */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* KPI 1: Cash & Bank */}
        <Card className="p-4 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {FINANCE_KPIS.cashAndBankBalances.shortNameAz}
            </span>
            <div
              className="text-slate-400 hover:text-slate-600 cursor-help"
              title={`${FINANCE_KPIS.cashAndBankBalances.nameAz}\nFormul: ${FINANCE_KPIS.cashAndBankBalances.formulaText}\nMənbə: ${FINANCE_KPIS.cashAndBankBalances.dataSource}`}
            >
              <Info className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {formatMoney(toQapik(totalLiquidFundsQapik))}
          </div>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Bütün kassa və banklar
          </p>
        </Card>

        {/* KPI 2: Customer Receivables */}
        <Card className="p-4 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {FINANCE_KPIS.customerReceivables.shortNameAz}
            </span>
            <div
              className="text-slate-400 hover:text-slate-600 cursor-help"
              title={`${FINANCE_KPIS.customerReceivables.nameAz}\nFormul: ${FINANCE_KPIS.customerReceivables.formulaText}\nMənbə: ${FINANCE_KPIS.customerReceivables.dataSource}`}
            >
              <Info className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {formatMoney(toQapik(receivablesTotalQapik))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Korporativ & nisyə satışlar
          </p>
        </Card>

        {/* KPI 3: Supplier Payables */}
        <Card className="p-4 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {FINANCE_KPIS.supplierPayables.shortNameAz}
            </span>
            <div
              className="text-slate-400 hover:text-slate-600 cursor-help"
              title={`${FINANCE_KPIS.supplierPayables.nameAz}\nFormul: ${FINANCE_KPIS.supplierPayables.formulaText}\nMənbə: ${FINANCE_KPIS.supplierPayables.dataSource}`}
            >
              <Info className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatMoney(toQapik(supplierPayablesQapik))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Təchizatçılara açıq borclar
          </p>
        </Card>

        {/* KPI 4: Period Expenses */}
        <Card className="p-4 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {FINANCE_KPIS.periodExpenses.shortNameAz}
            </span>
            <div
              className="text-slate-400 hover:text-slate-600 cursor-help"
              title={`${FINANCE_KPIS.periodExpenses.nameAz}\nFormul: ${FINANCE_KPIS.periodExpenses.formulaText}\nMənbə: ${FINANCE_KPIS.periodExpenses.dataSource}`}
            >
              <Info className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {formatMoney(toQapik(periodExpensesQapik))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Təsdiqlənmiş əməliyyat OPEX
          </p>
        </Card>

        {/* KPI 5: Pending Approvals */}
        <Card className="p-4 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {FINANCE_KPIS.pendingApprovals.shortNameAz}
            </span>
            <div
              className="text-slate-400 hover:text-slate-600 cursor-help"
              title={`${FINANCE_KPIS.pendingApprovals.nameAz}\nFormul: ${FINANCE_KPIS.pendingApprovals.formulaText}\nMənbə: ${FINANCE_KPIS.pendingApprovals.dataSource}`}
            >
              <Info className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
            {approvals.length} ədəd
          </div>
          <p className="mt-1 text-xs text-purple-600 dark:text-purple-400 font-medium">
            <Link to="/finance/approvals" className="hover:underline">
              Növbəyə baxış &rarr;
            </Link>
          </p>
        </Card>
      </div>

      {/* Main Grid: Liquid Balances Breakdown + Approvals Queue + Recent Movements */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Accounts Summary */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary-600" />
                Pul Vəsaitlərinin Strukturu
              </h3>
              <Link to="/finance/accounts" className="text-xs text-primary-600 hover:underline">
                Hamısına bax
              </Link>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm mt-2">
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-600 dark:text-slate-400">Filial Kassaları (Nağd):</span>
                </div>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {formatMoney(toQapik(totalCashQapik))}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-slate-600 dark:text-slate-400">Bank Hesabları (ABB & PAŞA):</span>
                </div>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {formatMoney(toQapik(totalBankQapik))}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="text-slate-600 dark:text-slate-400">POS Klirinq Tranziti:</span>
                </div>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {formatMoney(toQapik(totalCardClearingQapik))}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm font-bold">
              <span>Cəmi Likvid Aktivlər:</span>
              <span className="font-mono text-base text-emerald-600 dark:text-emerald-400">
                {formatMoney(toQapik(totalLiquidFundsQapik))}
              </span>
            </div>
          </Card>

          {/* Pending Approvals Summary Widget */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-600" />
                Təsdiq Gözləyən Əməliyyatlar
              </h3>
              <Badge variant={approvals.length > 0 ? 'warning' : 'outline'}>
                {approvals.length} açıq sorğu
              </Badge>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs mt-2">
              {approvals.length === 0 ? (
                <div className="py-6 text-center text-slate-400">
                  Təsdiq gözləyən maliyyə sorğusu yoxdur.
                </div>
              ) : (
                approvals.map((app) => (
                  <div key={app.id} className="py-2.5 space-y-1">
                    <div className="flex justify-between font-medium">
                      <span className="text-slate-800 dark:text-slate-200 line-clamp-1">{app.title}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(app.amountQapik)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{app.branchName} • {app.submittedBy}</span>
                      <span className="text-purple-600 dark:text-purple-400 font-medium">{app.thresholdNote}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
              <Link to="/finance/approvals">
                <Button variant="outline" size="sm" className="w-full">
                  Vahid Təsdiq Mərkəzinə Keç
                </Button>
              </Link>
            </div>
          </Card>
        </div>

        {/* Right Column: Recent Movements Table */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Son Kassa və Bank Hərəkətləri
                </h3>
                <p className="text-xs text-slate-500">
                  Real vaxt rejimində qeydə alınmış mədaxil, məxaric və köçürmələr
                </p>
              </div>
              <Link to="/finance/accounts">
                <Button variant="ghost" size="sm" className="text-xs">
                  Bütün hərəkətlər &rarr;
                </Button>
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Sənəd №</th>
                    <th className="px-4 py-3">Tarix</th>
                    <th className="px-4 py-3">Növ</th>
                    <th className="px-4 py-3">Təsvir</th>
                    <th className="px-4 py-3">Məxaric / Mədaxil</th>
                    <th className="px-4 py-3 text-right">Məbləğ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {recentMovements.map((m) => {
                    const isIncoming =
                      m.type === 'pos_closing' ||
                      m.type === 'customer_collection' ||
                      m.type === 'other_income' ||
                      m.type === 'deposit';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                          {m.documentNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDate(m.date)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="capitalize text-[11px]">
                            {m.type === 'pos_closing'
                              ? 'Kassa Bağlanışı'
                              : m.type === 'expense_payment'
                              ? 'Xərc Ödənişi'
                              : m.type === 'supplier_payment'
                              ? 'Təchizatçı Ödənişi'
                              : m.type === 'customer_collection'
                              ? 'Debitor Yığımı'
                              : m.type === 'deposit'
                              ? 'Banka İnkassasiya'
                              : m.type === 'withdrawal'
                              ? 'Nağdlaşdırma'
                              : 'Köçürmə'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                          {m.description}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">
                          {m.fromAccountName && m.toAccountName
                            ? `${m.fromAccountName} → ${m.toAccountName}`
                            : m.toAccountName || m.fromAccountName}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono font-semibold ${
                            isIncoming
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isIncoming ? '+' : '-'}{formatMoney(m.amountQapik)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Quick Links Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link to="/finance/reports" className="block">
              <Card className="p-4 hover:border-primary-400 transition-colors">
                <FileText className="h-5 w-5 text-primary-600 mb-2" />
                <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Maliyyə Hesabatları (P&L)
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Mənfəət və Zərər, Birbaşa Pul Axını və gündəlik kassa hesabatı
                </p>
              </Card>
            </Link>

            <Link to="/finance/reconciliation" className="block">
              <Card className="p-4 hover:border-primary-400 transition-colors">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mb-2" />
                <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Bank və POS Üzləşməsi
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  CSV bank çıxarışı idxalı və POS tender fərqlərinin araşdırılması
                </p>
              </Card>
            </Link>

            <Link to="/finance/budgets" className="block">
              <Card className="p-4 hover:border-primary-400 transition-colors">
                <TrendingUp className="h-5 w-5 text-blue-600 mb-2" />
                <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Büdcə və Limitlər
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Filial büdcələri, faktiki xərc kənarlaşması və limit xəbərdarlıqları
                </p>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
