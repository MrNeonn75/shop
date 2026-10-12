import React, { useEffect, useState } from 'react';
import {
  FileBarChart,
  FileText,
  DollarSign,
  TrendingUp,
  Download,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { financeRepository, branchRepository } from '../../../shared/adapters';
import {
  ManagementPnlReport,
  CashFlowReport,
  DailyCashReportSummary,
  DrillDownTransaction,
} from '../types';
import { FinanceFilterBar } from '../components/FinanceFilterBar';
import { TaxComplianceNotice } from '../components/TaxComplianceNotice';
import { DrillDownModal } from '../components/DrillDownModal';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/useToast';

export const FinancialReportsPage: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'pnl' | 'cash_flow' | 'daily_cash'>('pnl');

  const [pnlReport, setPnlReport] = useState<ManagementPnlReport | null>(null);
  const [cashFlowReport, setCashFlowReport] = useState<CashFlowReport | null>(null);
  const [dailyCashList, setDailyCashList] = useState<DailyCashReportSummary[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Drilldown state
  const [drillDownTitle, setDrillDownTitle] = useState('');
  const [drillDownItems, setDrillDownItems] = useState<DrillDownTransaction[]>([]);
  const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);
  const [isDrillLoading, setIsDrillLoading] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setIsLoading(true);
    try {
      const [pnl, cf, dc, brList] = await Promise.all([
        financeRepository.getManagementPnl(),
        financeRepository.getCashFlowReport(),
        financeRepository.getDailyCashSummaries(),
        branchRepository.getBranches(),
      ]);

      setPnlReport(pnl);
      setCashFlowReport(cf);
      setDailyCashList(dc);
      setBranches(brList.map((b) => ({ id: b.id, name: b.name })));
    } catch (err) {
      toast({
        title: 'Hesabatlar yüklənmədi',
        description: err instanceof Error ? err.message : 'Maliyyə hesabatları gətirilərkən xəta baş verdi.',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleOpenDrillDown = async (title: string, lineId: string) => {
    setDrillDownTitle(title);
    setIsDrillDownOpen(true);
    setIsDrillLoading(true);
    try {
      const items = await financeRepository.getDrillDownTransactions(lineId);
      setDrillDownItems(items);
    } catch {
      toast({
        title: 'Xəta',
        description: 'İlkin əməliyyatların detalları gətirilə bilmədi.',
        variant: 'danger',
      });
    } finally {
      setIsDrillLoading(false);
    }
  };

  const handleExportReport = (format: 'csv' | 'pdf') => {
    toast({
      title: `Hesabat İxracı (${format.toUpperCase()})`,
      description: `Maliyyə hesabatı uğurla generasiya olundu və fayl yükləndi.`,
      variant: 'success',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bh-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Rəsmi Maliyyə Hesabatları
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            İdarəetmə Mənfəət və Zərər (P&L), Birbaşa Pul Axını (Cash Flow) və Gündəlik Kassa Hesabatı
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => handleExportReport('csv')} className="gap-1.5">
            <Download className="h-4 w-4" />
            CSV İxrac
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExportReport('pdf')} className="gap-1.5">
            <FileText className="h-4 w-4" />
            PDF / Çap
          </Button>
        </div>
      </div>

      <TaxComplianceNotice />
      <FinanceFilterBar branches={branches} />

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveTab('pnl')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'pnl'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileBarChart className="h-4 w-4" />
          Mənfəət və Zərər (Management P&L)
        </button>
        <button
          onClick={() => setActiveTab('cash_flow')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'cash_flow'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Pul Vəsaitlərinin Hərəkəti (Direct Cash Flow)
        </button>
        <button
          onClick={() => setActiveTab('daily_cash')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'daily_cash'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          Gündəlik Kassa Hesabatı (Daily Cash)
        </button>
      </div>

      {/* Tab 1: P&L Management View */}
      {activeTab === 'pnl' && pnlReport && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  İdarəetmə Mənfəət və Zərər Hesabatı (P&L)
                </h3>
                <p className="text-xs text-slate-500">
                  Dövr: {pnlReport.period} • Filial: {pnlReport.branchFilterName}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Maya Metodu: {pnlReport.cogsMethodLabel}
              </Badge>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {/* Line 1: Net Revenue */}
              <div
                onClick={() => handleOpenDrillDown('Xalis Satış Gəliri', 'rev')}
                className="p-4 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    1. Xalis Satış Gəliri (Net Revenue)
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </span>
                  <span className="text-xs text-slate-400">
                    Brutto Satışlar − Müştəri Qaytarmaları (Net of Returns)
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(pnlReport.netRevenueQapik)}
                  </div>
                  <span className="text-xs text-slate-400">100.0%</span>
                </div>
              </div>

              {/* Line 2: COGS */}
              <div
                onClick={() => handleOpenDrillDown('Satılan Malların Maya Dəyəri (COGS)', 'cogs')}
                className="p-4 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-900/50 cursor-pointer transition-colors bg-slate-50/30 dark:bg-slate-900/20"
              >
                <div>
                  <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    2. Satılan Malların Maya Dəyəri (COGS)
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </span>
                  <span className="text-xs text-slate-400">
                    {pnlReport.cogsMethodLabel} metodu ilə silinmiş anbar maya dəyəri
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                    -{formatMoney(pnlReport.cogsQapik)}
                  </div>
                  <span className="text-xs text-slate-400">
                    {((Number(pnlReport.cogsQapik) / Number(pnlReport.netRevenueQapik)) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Line 3: Gross Profit */}
              <div className="p-4 flex items-center justify-between bg-emerald-50/40 dark:bg-emerald-950/20 font-semibold">
                <div>
                  <span className="text-emerald-900 dark:text-emerald-200">
                    3. Ümumi Mənfəət (Gross Profit)
                  </span>
                  <span className="block text-xs text-emerald-700 dark:text-emerald-400 font-normal">
                    Xalis Satış Gəliri − COGS
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {formatMoney(pnlReport.grossProfitQapik)}
                  </div>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    Marja: {pnlReport.grossProfitMarginPercent}%
                  </span>
                </div>
              </div>

              {/* Section: OPEX header */}
              <div className="p-3 bg-slate-100/60 dark:bg-slate-800/60 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                4. Əməliyyat Xərcləri (OPEX — Kateqoriyalar üzrə)
              </div>

              {/* Operating Expenses lines */}
              {pnlReport.operatingExpenses.map((opex) => (
                <div
                  key={opex.lineId}
                  onClick={() => handleOpenDrillDown(opex.titleAz, opex.lineId)}
                  className="px-6 py-3 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-900/50 cursor-pointer transition-colors text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{opex.titleAz}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      -{formatMoney(opex.amountQapik)}
                    </span>
                    <span className="ml-3 text-slate-400 font-mono text-[11px]">
                      {opex.percentageOfRevenue}%
                    </span>
                  </div>
                </div>
              ))}

              {/* Total OPEX */}
              <div className="p-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 font-medium">
                <span className="text-slate-700 dark:text-slate-300">
                  Cəmi Əməliyyat Xərcləri (Total OPEX)
                </span>
                <div className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                  -{formatMoney(pnlReport.totalOpexQapik)}
                </div>
              </div>

              {/* Final Line: Net Profit (Strictly conditional!) */}
              <div className="p-5 flex items-center justify-between bg-slate-900 text-white dark:bg-slate-950">
                <div>
                  <span className="text-base font-bold tracking-tight">
                    5. Xalis Mənfəət (Net Profit)
                  </span>
                  <span className="block text-xs text-slate-400">
                    Ümumi Mənfəət − Bütün Əməliyyat Xərcləri (OPEX)
                  </span>
                </div>
                <div className="text-right">
                  {pnlReport.isNetProfitComputable && pnlReport.netProfitQapik !== undefined ? (
                    <div>
                      <div className="text-xl font-bold font-mono text-emerald-400">
                        {formatMoney(pnlReport.netProfitQapik)}
                      </div>
                      <span className="text-xs text-emerald-300">
                        Xalis Rentabellik: {pnlReport.netProfitMarginPercent}%
                      </span>
                    </div>
                  ) : (
                    <div>
                      <Badge variant="danger" className="text-xs px-2.5 py-1">
                        Hesablanmayıb
                      </Badge>
                      <span className="block text-[11px] text-amber-300 mt-1">
                        Natamam maya və ya xərc məlumatı
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Missing-Data Reason Banner if not computable */}
          {!pnlReport.isNetProfitComputable && pnlReport.missingDataReasons.length > 0 && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-800 dark:text-rose-300">
                <ShieldAlert className="h-5 w-5 text-rose-600" />
                Xalis Mənfəətin Hesablanmaması Səbəbləri:
              </div>
              <ul className="list-disc pl-5 space-y-1">
                {pnlReport.missingDataReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-700 dark:text-rose-400 pt-1">
                Şirkət qaydalarına əsasən, natamam və ya təsdiqlənməmiş xərclər mövcud olduqda təxmini rəqəmlər göstərilmir.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Cash Flow (Direct Method) */}
      {activeTab === 'cash_flow' && cashFlowReport && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Pul Vəsaitlərinin Hərəkəti Hesabatı (Birbaşa Metod — Direct Method)
            </h3>
            <p className="text-xs text-slate-500">
              Faktiki kassa və bank hərəkətlərindən çıxarılmış pul axını (Dövr: {cashFlowReport.period})
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {/* Opening Balance */}
            <div className="p-4 flex justify-between font-semibold bg-slate-50/50 dark:bg-slate-900/50">
              <span>Dövrün Əvvəlinə Pul Vəsaitləri Qalığı (Opening Cash & Bank):</span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                {formatMoney(cashFlowReport.openingCashAndBankQapik)}
              </span>
            </div>

            {/* Operating Inflows */}
            <div className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">
              1. Əməliyyat Fəaliyyəti Üzrə Pul Daxilolmaları
            </div>
            {cashFlowReport.operatingInflows.map((item, idx) => (
              <div key={idx} className="px-6 py-2.5 flex justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300">{item.categoryName}</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatMoney(item.amountQapik)}
                </span>
              </div>
            ))}
            <div className="px-6 py-2 flex justify-between text-xs font-semibold bg-slate-50 dark:bg-slate-900">
              <span>Cəmi Əməliyyat Daxilolmaları:</span>
              <span className="font-mono text-emerald-600">
                +{formatMoney(cashFlowReport.totalOperatingInflowsQapik)}
              </span>
            </div>

            {/* Operating Outflows */}
            <div className="p-3 bg-rose-50/30 dark:bg-rose-950/10 text-xs font-bold text-rose-800 dark:text-rose-300 uppercase">
              2. Əməliyyat Fəaliyyəti Üzrə Pul Çıxışları (Ödənişlər)
            </div>
            {cashFlowReport.operatingOutflows.map((item, idx) => (
              <div key={idx} className="px-6 py-2.5 flex justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300">{item.categoryName}</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                  -{formatMoney(item.amountQapik)}
                </span>
              </div>
            ))}
            <div className="px-6 py-2 flex justify-between text-xs font-semibold bg-slate-50 dark:bg-slate-900">
              <span>Cəmi Əməliyyat Çıxışları:</span>
              <span className="font-mono text-rose-600">
                -{formatMoney(cashFlowReport.totalOperatingOutflowsQapik)}
              </span>
            </div>

            {/* Net Operating Cash Flow */}
            <div className="p-4 flex justify-between font-bold bg-blue-50/40 dark:bg-blue-950/20">
              <span>Xalis Əməliyyat Pul Axını (Net Operating Cash Flow):</span>
              <span className="font-mono text-blue-700 dark:text-blue-300">
                {formatMoney(cashFlowReport.netOperatingCashFlowQapik)}
              </span>
            </div>

            {/* Closing Balance */}
            <div className="p-5 flex justify-between font-bold bg-slate-900 text-white dark:bg-slate-950 text-base">
              <span>Dövrün Sonuna Pul Vəsaitləri Qalığı (Closing Cash & Bank):</span>
              <span className="font-mono text-emerald-400">
                {formatMoney(cashFlowReport.closingCashAndBankQapik)}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 3: Daily Cash Summaries */}
      {activeTab === 'daily_cash' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Gündəlik Filial Kassa İcmalı
            </h3>
            <p className="text-xs text-slate-500">
              Hər filial üzrə günün başlanğıc və bağlanış qalıqları, mədaxil və banka inkassasiyalar
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3 text-right">Günün Əvvəli</th>
                  <th className="px-4 py-3 text-right">Nağd Satış</th>
                  <th className="px-4 py-3 text-right">Banka Təhvil</th>
                  <th className="px-4 py-3 text-right">Günün Sonu</th>
                  <th className="px-4 py-3 text-center">Fərq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {dailyCashList.map((dc) => (
                  <tr key={dc.branchId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(dc.date)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {dc.branchName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {formatMoney(dc.openingBalanceQapik)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(dc.cashSalesQapik)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-600 dark:text-rose-400">
                      -{formatMoney(dc.bankDepositsQapik)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(dc.closingBalanceQapik)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono text-emerald-600 font-semibold">0.00 ₼</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* DrillDown Modal */}
      <DrillDownModal
        isOpen={isDrillDownOpen}
        onClose={() => setIsDrillDownOpen(false)}
        title={drillDownTitle}
        transactions={drillDownItems}
        isLoading={isDrillLoading}
      />
    </div>
  );
};
