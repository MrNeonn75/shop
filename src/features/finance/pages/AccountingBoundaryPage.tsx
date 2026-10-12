import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Link2,
  ListOrdered,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { financeRepository } from '../../../shared/adapters';
import {
  GlIntegrationState,
  ChartOfAccountsItem,
  PostingRuleMapping,
  JournalEntry,
} from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { TaxComplianceNotice } from '../components/TaxComplianceNotice';

export const AccountingBoundaryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'posting_rules' | 'chart_of_accounts' | 'journal_entries'>('posting_rules');
  const [glState, setGlState] = useState<GlIntegrationState | null>(null);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountsItem[]>([]);
  const [postingRules, setPostingRules] = useState<PostingRuleMapping[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [st, coa, rules, jes] = await Promise.all([
          financeRepository.getGlIntegrationState(),
          financeRepository.getChartOfAccounts(),
          financeRepository.getPostingRules(),
          financeRepository.getJournalEntries(),
        ]);
        setGlState(st);
        setChartOfAccounts(coa);
        setPostingRules(rules);
        setJournalEntries(jes);
      } catch (err) {
        console.error('Failed to load accounting boundary:', err);
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Mühasibat İnteqrasiyası və Baş Kitab Sərhədi (GL Boundary)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Müxabirə qaydaları matrisi, hesablar planı və ikili yazılış jurnal qeydlərinin balanslaşdırılması
          </p>
        </div>
      </div>

      <TaxComplianceNotice />

      {/* Mandatory GL Disabled Notice: Never fake journals or GL sync */}
      {glState && !glState.isGlEnabled && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 space-y-1">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
            <AlertCircle className="h-4 w-4 text-slate-500" />
            İnteqrasiya Statusu: <Badge variant="outline">Aktiv deyil</Badge>
          </div>
          <p className="leading-relaxed">
            {glState.statusMessageAz}
          </p>
          <p className="text-[11px] text-slate-500 pt-1">
            Müxabirə qaydaları və hesablar planı gələcək ikili yazılış Baş Kitab (General Ledger / 1C / SAP) inteqrasiyası üçün arxitektur sərhəd kimi təqdim olunur.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveTab('posting_rules')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'posting_rules'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Link2 className="h-4 w-4" />
          Müxabirə Qaydaları (Posting Rules)
        </button>
        <button
          onClick={() => setActiveTab('chart_of_accounts')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'chart_of_accounts'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ListOrdered className="h-4 w-4" />
          Hesablar Planı (Chart of Accounts)
        </button>
        <button
          onClick={() => setActiveTab('journal_entries')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'journal_entries'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Jurnal Qeydləri (Journal Entries)
        </button>
      </div>

      {/* Tab 1: Posting Rules Mapping */}
      {activeTab === 'posting_rules' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Avtomatik Müxabirələşmə Xəritəsi (Event &rarr; Accounts)
            </h3>
            <p className="text-xs text-slate-500">
              Sistem əməliyyatları (Satış, Mal Qəbulu, Xərc) baş verdikdə tərtib olunan standart mühasibat müxabirələri
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Hadisə (Event)</th>
                  <th className="px-4 py-3">Debet Hesabı (DT)</th>
                  <th className="px-4 py-3">Kredit Hesabı (KT)</th>
                  <th className="px-4 py-3">Təsvir & Metodologiya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {postingRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {rule.eventNameAz}
                      <span className="block font-mono text-[10px] text-slate-400 font-normal">
                        {rule.eventCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                      DT {rule.debitAccountCode} — {rule.debitAccountName}
                    </td>
                    <td className="px-4 py-3 text-blue-700 dark:text-blue-400 font-medium">
                      KT {rule.creditAccountCode} — {rule.creditAccountName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-sm">
                      {rule.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Chart of Accounts */}
      {activeTab === 'chart_of_accounts' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Vahid Hesablar Planı (Oxumaq üçün — Read Only)
            </h3>
            <p className="text-xs text-slate-500">
              Milli Mühasibat Uçotu Standartlarına (MMUS / İFRS) uyğun sintetik hesablar siyahısı
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Hesab Kodu</th>
                  <th className="px-4 py-3">Hesabın Adı</th>
                  <th className="px-4 py-3">Tipi</th>
                  <th className="px-4 py-3 text-right">Cari Balans</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {chartOfAccounts.map((coa) => (
                  <tr key={coa.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                      {coa.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {coa.nameAz}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <Badge variant="outline" className="text-[10px]">
                        {coa.type === 'asset'
                          ? 'Aktiv'
                          : coa.type === 'liability'
                          ? 'Öhdəlik'
                          : coa.type === 'revenue'
                          ? 'Gəlir'
                          : coa.type === 'expense'
                          ? 'Xərc'
                          : 'Kapital'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(coa.balanceQapik)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Journal Entries Viewer */}
      {activeTab === 'journal_entries' && (
        <div className="space-y-4">
          {journalEntries.map((je) => (
            <Card key={je.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                    {je.entryNumber}
                  </span>
                  <span className="text-slate-400">• Tarix: {formatDate(je.date)}</span>
                  <Badge variant="outline" className="text-[10px]">
                    Sənəd: {je.sourceDocNumber}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {je.isBalanced ? (
                    <Badge variant="default" className="text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Balanslaşdırılıb (Debet = Kredit)
                    </Badge>
                  ) : (
                    <Badge variant="danger" className="text-[10px]">
                      Balans Uyğunsuzluğu!
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                {je.description}
              </p>

              <div className="overflow-x-auto rounded-md border border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Hesab</th>
                      <th className="px-3 py-2">Məzmun</th>
                      <th className="px-3 py-2 text-right">Debet (DT)</th>
                      <th className="px-3 py-2 text-right">Kredit (KT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {je.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-mono font-medium">
                          {l.accountCode} — {l.accountName}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{l.description}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-600">
                          {Number(l.debitQapik) > 0 ? formatMoney(l.debitQapik) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-blue-600">
                          {Number(l.creditQapik) > 0 ? formatMoney(l.creditQapik) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/50 dark:bg-slate-900/50 font-bold">
                      <td colSpan={2} className="px-3 py-2 text-right">Cəmi:</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700">
                        {formatMoney(je.totalDebitQapik)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-blue-700">
                        {formatMoney(je.totalCreditQapik)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
