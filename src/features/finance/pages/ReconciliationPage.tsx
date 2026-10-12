import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Upload,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  Check,
} from 'lucide-react';
import { financeRepository } from '../../../shared/adapters';
import {
  TenderReconciliation,
  BankStatementImport,
  BankStatementLine,
  AccountMovement,
} from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { toQapik } from '../../../shared/utils/money';

export const ReconciliationPage: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'bank_import' | 'pos_tender'>('bank_import');

  // Tender Reconciliation State
  const [tenders, setTenders] = useState<TenderReconciliation[]>([]);
  const [resolvingTender, setResolvingTender] = useState<TenderReconciliation | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  // Bank Statement State
  const [bankImports, setBankImports] = useState<BankStatementImport[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');
  const [statementLines, setStatementLines] = useState<BankStatementLine[]>([]);
  const [availableMovements, setAvailableMovements] = useState<AccountMovement[]>([]);
  const [lineFilter, setLineFilter] = useState<'all' | 'unmatched' | 'matched'>('all');

  // Manual Matching Modal
  const [manualMatchLine, setManualMatchLine] = useState<BankStatementLine | null>(null);
  const [selectedMovementId, setSelectedMovementId] = useState<string>('');
  const [manualMatchNotes, setManualMatchNotes] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setIsLoading(true);
    try {
      const [tList, impList, movList] = await Promise.all([
        financeRepository.getTenderReconciliations(),
        financeRepository.getBankStatementImports(),
        financeRepository.getMovements(),
      ]);

      setTenders(tList);
      setBankImports(impList);
      setAvailableMovements(movList.filter((m) => !m.isReversed));

      if (impList.length > 0) {
        setSelectedImportId(impList[0].id);
        const lines = await financeRepository.getBankStatementLines(impList[0].id);
        setStatementLines(lines);
      }
    } catch (err) {
      toast({
        title: 'Məlumat yüklənmədi',
        description: err instanceof Error ? err.message : 'Üzləşmə məlumatları yüklənərkən xəta baş verdi.',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleSelectImport = async (id: string) => {
    setSelectedImportId(id);
    const lines = await financeRepository.getBankStatementLines(id);
    setStatementLines(lines);
  };

  const handleAutoMatch = async () => {
    if (!selectedImportId) return;
    setIsMatching(true);
    try {
      const result = await financeRepository.autoMatchStatementLines(selectedImportId);
      setStatementLines(result.lines);

      // Refresh imports list for updated counts
      const impList = await financeRepository.getBankStatementImports();
      setBankImports(impList);

      toast({
        title: 'Avtomatik Üzləşmə Tamamlandı',
        description: `${result.matchedCount} sətir uğurla uzlaşdırıldı. ${result.unmatchedCount} sətir manual baxış tələb edir.`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Üzləşmə zamanı xəta baş verdi.',
        variant: 'danger',
      });
    } finally {
      setIsMatching(false);
    }
  };

  const handleConfirmManualMatch = async () => {
    if (!manualMatchLine || !selectedMovementId) return;
    try {
      const updatedLine = await financeRepository.manualMatchStatementLine(
        manualMatchLine.id,
        selectedMovementId,
        manualMatchNotes
      );

      setStatementLines((prev) =>
        prev.map((l) => (l.id === updatedLine.id ? updatedLine : l))
      );

      // Refresh imports list
      const impList = await financeRepository.getBankStatementImports();
      setBankImports(impList);

      toast({
        title: 'Manual Üzləşmə Təsdiqləndi',
        description: 'Bank çıxarışı sətiri kassa/bank əməliyyatı ilə əlaqələndirildi.',
        variant: 'success',
      });
      setManualMatchLine(null);
      setSelectedMovementId('');
      setManualMatchNotes('');
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Manual uzlaşdırma uğursuz oldu.',
        variant: 'danger',
      });
    }
  };

  const handleResolveTender = async () => {
    if (!resolvingTender || !resolveNotes.trim()) return;
    try {
      const updated = await financeRepository.resolveTenderMismatch(
        resolvingTender.id,
        resolveNotes.trim(),
        'Cari Menecer'
      );
      setTenders((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast({
        title: 'Fərq Araşdırıldı və Qeydə Alındı',
        description: 'Kassa və POS slip uyğunsuzluğu aradan qaldırıldı.',
        variant: 'success',
      });
      setResolvingTender(null);
      setResolveNotes('');
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Xəta baş verdi.',
        variant: 'danger',
      });
    }
  };

  const handleSimulateNewCsvUpload = async () => {
    try {
      const newImp = await financeRepository.importBankStatement(
        'acc-4',
        'pasha_bank_statement_new.csv',
        [
          {
            date: '2026-04-09',
            reference: 'CSH-2026-0001',
            counterparty: '28 May Flaman Filialı',
            description: '28 May filialı gün sonu nağd inkassasiyası',
            amountQapik: toQapik(200000),
          },
          {
            date: '2026-04-08',
            reference: 'POS-SETTLE-4820',
            counterparty: 'AzeriCard Klirinq Mərkəzi',
            description: 'POS terminalları gün sonu avtomatik settlement',
            amountQapik: toQapik(315000),
          },
          {
            date: '2026-04-07',
            reference: 'OFFICE-SUPPLIES-99',
            counterparty: 'Office Line MMC',
            description: 'Kassa lentləri və barkod kağızı sifarişi',
            amountQapik: toQapik(-15000),
          },
        ]
      );

      const impList = await financeRepository.getBankStatementImports();
      setBankImports(impList);
      setSelectedImportId(newImp.id);
      const lines = await financeRepository.getBankStatementLines(newImp.id);
      setStatementLines(lines);

      toast({
        title: 'CSV Çıxarış İdxal Edildi',
        description: `${newImp.fileName} faylından ${newImp.totalLines} sətir uğurla oxundu.`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'İdxal xətası',
        description: err instanceof Error ? err.message : 'CSV oxunmadı.',
        variant: 'danger',
      });
    }
  };

  const activeImport = bankImports.find((i) => i.id === selectedImportId);

  const filteredLines = statementLines.filter((l) => {
    if (lineFilter === 'unmatched') return l.matchStatus === 'unmatched';
    if (lineFilter === 'matched') return l.matchStatus !== 'unmatched';
    return true;
  });

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
            Bank və Kassa Üzləşməsi (Reconciliation)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bank çıxarışlarının CSV idxalı, intellektual uzlaşdırma və POS ödəniş metodları fərqlərinin nəzarəti
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSimulateNewCsvUpload}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            Bank CSV Çıxarışı Yüklə
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveTab('bank_import')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'bank_import'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Bank Çıxarışı İdxalı & Uzlaşdırma (CSV Matcher)
        </button>
        <button
          onClick={() => setActiveTab('pos_tender')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'pos_tender'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          POS Tender & Slip Üzləşməsi (Sales vs Settled)
        </button>
      </div>

      {/* Tab 1: Bank Statement CSV Matcher */}
      {activeTab === 'bank_import' && (
        <div className="space-y-6">
          {/* Statement Select & Summary Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                İdxal Edilmiş Çıxarış
              </label>
              <select
                value={selectedImportId}
                onChange={(e) => handleSelectImport(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {bankImports.map((imp) => (
                  <option key={imp.id} value={imp.id}>
                    {imp.fileName} ({imp.accountName})
                  </option>
                ))}
              </select>
              {activeImport && (
                <div className="mt-3 text-xs text-slate-500 space-y-1">
                  <div>İdxal tarixi: {formatDate(activeImport.importedAt)}</div>
                  <div>Hesab: {activeImport.accountName}</div>
                </div>
              )}
            </Card>

            <Card className="p-4 md:col-span-3 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-xs text-slate-400">Cəmi Sətir</span>
                    <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                      {activeImport?.totalLines || 0}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-emerald-600 font-medium">Uzlaşdırılıb</span>
                    <div className="text-xl font-bold font-mono text-emerald-600">
                      {activeImport?.matchedLines || 0}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-amber-600 font-medium">Açıq (Unmatched)</span>
                    <div className="text-xl font-bold font-mono text-amber-600">
                      {activeImport?.unmatchedLines || 0}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleAutoMatch}
                    isLoading={isMatching}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Avtomatik Üzləşdir (Auto-Match)
                  </Button>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Filtr:</span>
                  <button
                    onClick={() => setLineFilter('all')}
                    className={`px-2.5 py-1 rounded-full ${
                      lineFilter === 'all'
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800'
                    }`}
                  >
                    Bütün Sətirlər ({statementLines.length})
                  </button>
                  <button
                    onClick={() => setLineFilter('unmatched')}
                    className={`px-2.5 py-1 rounded-full ${
                      lineFilter === 'unmatched'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                  >
                    Yalnız Uyğunlaşmayanlar ({statementLines.filter((l) => l.matchStatus === 'unmatched').length})
                  </button>
                  <button
                    onClick={() => setLineFilter('matched')}
                    className={`px-2.5 py-1 rounded-full ${
                      lineFilter === 'matched'
                        ? 'bg-emerald-600 text-white font-medium'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
                    }`}
                  >
                    Tam Uzlaşanlar ({statementLines.filter((l) => l.matchStatus !== 'unmatched').length})
                  </button>
                </div>
              </div>
            </Card>
          </div>

          {/* Statement Lines Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Tarix</th>
                    <th className="px-4 py-3">Bank İstinad (Ref)</th>
                    <th className="px-4 py-3">Kontragent & Təsvir</th>
                    <th className="px-4 py-3 text-right">Bank Məbləği</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">ERP Uyğunlaşması (Hərəkət)</th>
                    <th className="px-4 py-3 text-center">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredLines.map((line) => {
                    const isMatched = line.matchStatus !== 'unmatched';
                    const isIncoming = Number(line.amountQapik) > 0;

                    return (
                      <tr key={line.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDate(line.date)}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                          {line.reference}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xs">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {line.counterparty}
                          </div>
                          <div className="text-slate-400 truncate">{line.description}</div>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono font-bold ${
                            isIncoming
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {isIncoming ? '+' : ''}{formatMoney(line.amountQapik)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isMatched ? (
                            <Badge variant="default" className="text-[10px] gap-1">
                              <Check className="h-3 w-3" />
                              {line.matchStatus === 'auto_matched'
                                ? `Avto (${line.matchConfidence}%)`
                                : 'Manual'}
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Açıq (Unmatched)
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs">
                          {line.matchedMovementDocNumber ? (
                            <div>
                              <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                                {line.matchedMovementDocNumber}
                              </span>
                              <div className="text-[11px] text-slate-400 truncate">
                                {line.matchedMovementDescription}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">ERP qeydi tapılmayıb</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!isMatched ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setManualMatchLine(line);
                                setSelectedMovementId('');
                                setManualMatchNotes('');
                              }}
                              className="h-7 px-2 text-xs gap-1"
                            >
                              <Link2 className="h-3.5 w-3.5 text-primary-600" />
                              Əlaqələndir
                            </Button>
                          ) : (
                            <span className="text-emerald-600 font-medium text-[11px]">Bağlandı</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: POS Tender Reconciliation */}
      {activeTab === 'pos_tender' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Kassa Növbəsi Ödəniş Metodları Üzləşməsi
            </h3>
            <p className="text-xs text-slate-500">
              Satış çeki üzrə gözlənilən məbləğlər ilə kassa orderi və POS terminal slipi fərqləri
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3">Kassa & Kassir</th>
                  <th className="px-4 py-3">Tender Növü</th>
                  <th className="px-4 py-3 text-right">Gözlənilən (Satış)</th>
                  <th className="px-4 py-3 text-right">Faktiki Çıxarış</th>
                  <th className="px-4 py-3 text-right">Kənarlaşma</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {tenders.map((item) => {
                  const hasDiscrepancy = Number(item.discrepancyQapik) !== 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {item.branchName}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        <div className="font-medium">{item.registerNumber}</div>
                        <div className="text-[11px] text-slate-400">{item.cashierName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="capitalize text-[11px]">
                          {item.tenderType === 'cash' ? 'Nağd Kassa' : item.tenderType === 'card' ? 'Bank Kartı (POS)' : 'Bölünmüş'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {formatMoney(item.expectedQapik)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(item.actualSettledQapik)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          hasDiscrepancy ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatMoney(item.discrepancyQapik)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={
                            item.status === 'matched'
                              ? 'default'
                              : item.status === 'resolved'
                              ? 'outline'
                              : 'warning'
                          }
                          className="text-[10px]"
                        >
                          {item.status === 'matched'
                            ? 'Tam Üst-üstə Düşdü'
                            : item.status === 'resolved'
                            ? 'Araşdırıldı & Həll Olundu'
                            : 'Fərq Var (Araşdırılır)'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.status === 'investigating' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResolvingTender(item);
                              setResolveNotes(item.notes || '');
                            }}
                            className="h-7 px-2 text-xs"
                          >
                            Qeyd Yaz / Bağla
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Manual Matching Modal */}
      {manualMatchLine && (
        <Modal
          isOpen={!!manualMatchLine}
          onClose={() => setManualMatchLine(null)}
          title="Bank Sətirini ERP Hərəkəti ilə Əlaqələndir"
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3.5 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Seçilmiş Bank Çıxarışı Sətiri:
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kontragent:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{manualMatchLine.counterparty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">İstinad:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{manualMatchLine.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Məbləğ:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatMoney(manualMatchLine.amountQapik)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Uyğun Kassa / Bank Əməliyyatı Seçin
              </label>
              <select
                value={selectedMovementId}
                onChange={(e) => setSelectedMovementId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">-- Əməliyyat seçin --</option>
                {availableMovements.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.documentNumber} ({formatDate(m.date)}) — {m.description} [{formatMoney(m.amountQapik)}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Uyğunlaşdırma Qeydi
              </label>
              <input
                type="text"
                value={manualMatchNotes}
                onChange={(e) => setManualMatchNotes(e.target.value)}
                placeholder="Məsələn: Bank ödəniş tapşırığı nömrəsi ilə təsdiqləndi..."
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setManualMatchLine(null)}>
                İmtina
              </Button>
              <Button onClick={handleConfirmManualMatch} disabled={!selectedMovementId}>
                Əlaqələndir və Təsdiqlə
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Tender Discrepancy Modal */}
      {resolvingTender && (
        <Modal
          isOpen={!!resolvingTender}
          onClose={() => setResolvingTender(null)}
          title={`Kassa Kənarlaşması Qeydi — ${resolvingTender.registerNumber}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-xs border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300">
              <div>Kənarlaşma Məbləği: <strong>{formatMoney(resolvingTender.discrepancyQapik)}</strong></div>
              <div>Filial: {resolvingTender.branchName} • Kassir: {resolvingTender.cashierName}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Səbəb və Araşdırma Nəticəsi
              </label>
              <textarea
                rows={3}
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Məsələn: Kassirin xırda pul sayımında 20 AZN qalıq fərqi tapıldı və kassa təhvil orderinə düzəliş edildi..."
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setResolvingTender(null)}>
                Bağla
              </Button>
              <Button onClick={handleResolveTender} disabled={!resolveNotes.trim()}>
                Araşdırmanı Təsdiq Et
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
