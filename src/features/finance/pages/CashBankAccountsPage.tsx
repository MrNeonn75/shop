import React, { useEffect, useState } from 'react';
import {
  Wallet,
  Building2,
  CreditCard,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  History,
} from 'lucide-react';
import { financeRepository } from '../../../shared/adapters';
import { FinanceAccount, AccountMovement, DailyCashReportSummary } from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { aznToQapik } from '../../../shared/utils/money';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { TransactionReversalModal } from '../components/TransactionReversalModal';

export const CashBankAccountsPage: React.FC = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [dailyCashSummaries, setDailyCashSummaries] = useState<DailyCashReportSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'accounts' | 'statement' | 'branch_cash'>('accounts');
  const [isLoading, setIsLoading] = useState(true);

  // Transfer / Deposit / Withdrawal Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [movementFormType, setMovementFormType] = useState<'transfer' | 'deposit' | 'withdrawal'>('transfer');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amountAzn, setAmountAzn] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reversal Modal
  const [reversalTarget, setReversalTarget] = useState<AccountMovement | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [accs, movs, cashSums] = await Promise.all([
        financeRepository.getAccounts(),
        financeRepository.getMovements(),
        financeRepository.getDailyCashSummaries(),
      ]);
      setAccounts(accs);
      setMovements(movs);
      setDailyCashSummaries(cashSums);
    } catch (err) {
      toast({
        title: 'Məlumat yüklənmədi',
        description: err instanceof Error ? err.message : 'Kassa və bank məlumatları gətirilərkən xəta baş verdi',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleOpenMovementModal = (type: 'transfer' | 'deposit' | 'withdrawal') => {
    setMovementFormType(type);
    setAmountAzn('');
    setDescription('');
    if (type === 'transfer') {
      const bankAccounts = accounts.filter((a) => a.type === 'bank');
      setFromAccountId(bankAccounts[0]?.id || accounts[0]?.id || '');
      setToAccountId(bankAccounts[1]?.id || accounts[1]?.id || '');
    } else if (type === 'deposit') {
      // Cash to bank
      const cashAcc = accounts.find((a) => a.type === 'cash');
      const bankAcc = accounts.find((a) => a.type === 'bank');
      setFromAccountId(cashAcc?.id || '');
      setToAccountId(bankAcc?.id || '');
    } else {
      // Bank to cash withdrawal
      const bankAcc = accounts.find((a) => a.type === 'bank');
      const cashAcc = accounts.find((a) => a.type === 'cash');
      setFromAccountId(bankAcc?.id || '');
      setToAccountId(cashAcc?.id || '');
    }
    setIsTransferModalOpen(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountQapik = aznToQapik(amountAzn);
    if (amountQapik <= 0) {
      toast({ title: 'Xəta', description: 'Məbləğ 0-dan böyük olmalıdır.', variant: 'danger' });
      return;
    }
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      toast({ title: 'Xəta', description: 'Məxaric və mədaxil hesabları fərqli olmalıdır.', variant: 'danger' });
      return;
    }

    setIsSubmitting(true);
    try {
      await financeRepository.createMovement({
        type: movementFormType,
        fromAccountId,
        toAccountId,
        amountQapik,
        description: description || (movementFormType === 'transfer' ? 'Hesablararası köçürmə' : movementFormType === 'deposit' ? 'Banka inkassasiya' : 'Kassaya nağdlaşdırma'),
        date: new Date().toISOString().slice(0, 10),
      });

      toast({
        title: 'Uğurlu əməliyyat',
        description: 'Kassa/bank əməliyyatı qeydə alındı və balanslar yeniləndi.',
        variant: 'success',
      });
      setIsTransferModalOpen(false);
      await loadData();
    } catch (err) {
      toast({
        title: 'Xəta baş verdi',
        description: err instanceof Error ? err.message : 'Əməliyyat icra olunmadı.',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReversal = async (reason: string) => {
    if (!reversalTarget) return;
    try {
      await financeRepository.reverseMovement(
        reversalTarget.id,
        reason,
        'Cari İstifadəçi'
      );
      toast({
        title: 'Əməliyyat ləğv edildi (Storno)',
        description: `${reversalTarget.documentNumber} nömrəli qeyd əks storno ilə kompensasiya edildi. Qeydlər silinmədi.`,
        variant: 'success',
      });
      setReversalTarget(null);
      await loadData();
    } catch (err) {
      toast({
        title: 'Ləğvetmə uğursuz oldu',
        description: err instanceof Error ? err.message : 'Xəta baş verdi.',
        variant: 'danger',
      });
    }
  };

  const filteredMovements = movements.filter((m) => {
    if (selectedAccountId === 'all') return true;
    return m.fromAccountId === selectedAccountId || m.toAccountId === selectedAccountId;
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
            Kassa və Bank Hesabları
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hesab qalıqları, hərəkət jurnalı, filial kassa orderləri və storno nəzarəti
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenMovementModal('deposit')}
            className="gap-1.5"
          >
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            Banka İnkassasiya
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenMovementModal('withdrawal')}
            className="gap-1.5"
          >
            <ArrowDownLeft className="h-4 w-4 text-blue-600" />
            Kassaya Nağdlaşdırma
          </Button>
          <Button
            size="sm"
            onClick={() => handleOpenMovementModal('transfer')}
            className="gap-1.5"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Hesablararası Köçürmə
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'accounts'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Hesablar Kartotekası
        </button>
        <button
          onClick={() => setActiveTab('statement')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'statement'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Hesab Çıxarışı (Statement Ledger)
        </button>
        <button
          onClick={() => setActiveTab('branch_cash')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'branch_cash'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Filial Kassa & Z-Hesabat Bağlanışları
        </button>
      </div>

      {/* Tab 1: Accounts List */}
      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => {
            const isCash = acc.type === 'cash';
            const isBank = acc.type === 'bank';

            return (
              <Card key={acc.id} className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-lg ${
                          isCash
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : isBank
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                        }`}
                      >
                        {isCash ? (
                          <Wallet className="h-5 w-5" />
                        ) : isBank ? (
                          <Building2 className="h-5 w-5" />
                        ) : (
                          <CreditCard className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {acc.name}
                        </h3>
                        <p className="font-mono text-xs text-slate-400">{acc.code}</p>
                      </div>
                    </div>
                    <Badge variant={acc.isActive ? 'default' : 'outline'}>
                      {isCash ? 'Kassa' : isBank ? 'Bank' : 'Klirinq'}
                    </Badge>
                  </div>

                  {acc.accountNumber && (
                    <div className="mt-3 text-xs text-slate-500 font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded-sm border border-slate-100 dark:border-slate-800">
                      IBAN: {acc.accountNumber}
                    </div>
                  )}

                  {acc.branchName && (
                    <div className="mt-2 text-xs text-slate-500">
                      Filial: <span className="font-medium text-slate-700 dark:text-slate-300">{acc.branchName}</span>
                    </div>
                  )}

                  {acc.notes && <p className="mt-2 text-xs text-slate-400 italic">{acc.notes}</p>}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-end justify-between">
                  <div>
                    <span className="text-xs text-slate-400">Cari Qalıq (derived)</span>
                    <div className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(acc.currentBalanceQapik)}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedAccountId(acc.id);
                      setActiveTab('statement');
                    }}
                    className="text-xs gap-1"
                  >
                    <History className="h-3.5 w-3.5" />
                    Çıxarış
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tab 2: Statement View */}
      {activeTab === 'statement' && (
        <Card className="overflow-hidden space-y-4">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Hesab Seçimi:</span>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">Bütün Hesablar</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatMoney(a.currentBalanceQapik)})
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-500">
              Cəmi <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredMovements.length}</span> hərəkət qeydi
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Sənəd №</th>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Növ</th>
                  <th className="px-4 py-3">Hesablar (Məxaric &rarr; Mədaxil)</th>
                  <th className="px-4 py-3">Təsvir & Əsaslandırma</th>
                  <th className="px-4 py-3">İcraçı</th>
                  <th className="px-4 py-3 text-right">Məbləğ</th>
                  <th className="px-4 py-3 text-center">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Bu hesab üzrə hərəkət tapılmadı.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m) => {
                    return (
                      <tr
                        key={m.id}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/50 ${
                          m.isReversed ? 'opacity-50 line-through bg-slate-50/30' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                          {m.documentNumber}
                          {m.isReversal && (
                            <Badge variant="danger" className="ml-1.5 text-[10px]">
                              Storno
                            </Badge>
                          )}
                          {m.isReversed && (
                            <Badge variant="outline" className="ml-1.5 text-[10px]">
                              Ləğv edilib
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
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
                              : m.type === 'deposit'
                              ? 'İnkassasiya'
                              : m.type === 'withdrawal'
                              ? 'Nağdlaşdırma'
                              : 'Köçürmə'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                          {m.fromAccountName && m.toAccountName
                            ? `${m.fromAccountName} → ${m.toAccountName}`
                            : m.toAccountName || m.fromAccountName}
                        </td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200 max-w-xs truncate">
                          <div>{m.description}</div>
                          {m.reversalReason && (
                            <div className="text-[11px] text-red-500 font-normal">
                              Səbəb: {m.reversalReason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {m.performedBy}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatMoney(m.amountQapik)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!m.isReversed && !m.isReversal ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReversalTarget(m)}
                              title="Ləğv et (Storno qeydi yarat)"
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 h-7 px-2"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Ləğv Et
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Branch Cash-Office & Z-Reports */}
      {activeTab === 'branch_cash' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Gündəlik Filial Kassa Bağlanışları (Z-Hesabatlar)
            </h3>
            <p className="text-xs text-slate-500">
              POS kassa növbəsi bağlandıqda avtomatik filial kassa orderinə daxil olan mədaxillər
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3 text-right">Günün Əvvəli Qalıq</th>
                  <th className="px-4 py-3 text-right">Nağd Satış Mədaxili</th>
                  <th className="px-4 py-3 text-right">Banka Təhvil (İnkassasiya)</th>
                  <th className="px-4 py-3 text-right">Günün Sonu Qalıq</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {dailyCashSummaries.map((s) => (
                  <tr key={s.branchId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDate(s.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {s.branchName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {formatMoney(s.openingBalanceQapik)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(s.cashSalesQapik)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-600 dark:text-rose-400">
                      -{formatMoney(s.bankDepositsQapik)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(s.closingBalanceQapik)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="default" className="text-[10px]">
                        Təsdiqləndi (Z-Report OK)
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Movement Modal (Transfer / Deposit / Withdrawal) */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title={
          movementFormType === 'transfer'
            ? 'Hesablararası Pul Köçürməsi'
            : movementFormType === 'deposit'
            ? 'Banka Nağd İnkassasiya'
            : 'Bankdan Kassaya Nağdlaşdırma'
        }
      >
        <form onSubmit={handleSaveMovement} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Məxaric Hesabı (Haradan)
              </label>
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatMoney(a.currentBalanceQapik)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Mədaxil Hesabı (Haraya)
              </label>
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatMoney(a.currentBalanceQapik)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Köçürülən Məbləğ (₼ AZN)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={amountAzn}
              onChange={(e) => setAmountAzn(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Əməliyyat Təsviri / Qeyd
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Məsələn: Filiallararası likvidlik balansı üçün köçürmə..."
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsTransferModalOpen(false)}
              disabled={isSubmitting}
            >
              İmtina
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Təsdiq Et və Köçür
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transaction Reversal Modal */}
      {reversalTarget && (
        <TransactionReversalModal
          isOpen={!!reversalTarget}
          onClose={() => setReversalTarget(null)}
          onConfirm={handleConfirmReversal}
          documentNumber={reversalTarget.documentNumber}
          amountQapik={reversalTarget.amountQapik}
          description={reversalTarget.description}
          typeLabel="Kassa/Bank Hərəkəti"
        />
      )}
    </div>
  );
};
