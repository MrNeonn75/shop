import React, { useEffect, useState } from 'react';
import {
  Receipt,
  Plus,
  Repeat,
  Share2,
  DollarSign,
  RotateCcw,
} from 'lucide-react';
import { financeRepository, branchRepository } from '../../../shared/adapters';
import {
  ExpenseRecord,
  ExpenseCategory,
  RecurringExpenseSchedule,
  SharedExpenseAllocation,
  OtherIncomeRecord,
  FinanceAccount,
} from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { aznToQapik } from '../../../shared/utils/money';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { TransactionReversalModal } from '../components/TransactionReversalModal';
import { TaxComplianceNotice } from '../components/TaxComplianceNotice';

export const ExpensesPage: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'expenses' | 'recurring' | 'shared_allocation' | 'other_income'>('expenses');

  // Main Expense Data
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Recurring & Allocations & Income
  const [recurringList, setRecurringList] = useState<RecurringExpenseSchedule[]>([]);
  const [allocations, setAllocations] = useState<SharedExpenseAllocation[]>([]);
  const [otherIncomeList, setOtherIncomeList] = useState<OtherIncomeRecord[]>([]);

  // Modals
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [rejectionTargetId, setRejectionTargetId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reversalTarget, setReversalTarget] = useState<ExpenseRecord | null>(null);

  // New Shared Allocation Modal
  const [isSharedModalOpen, setIsSharedModalOpen] = useState(false);
  const [sharedAmountAzn, setSharedAmountAzn] = useState('6000');
  const [sharedCategory, setSharedCategory] = useState('cat-marketing');
  const [sharedPreview, setSharedPreview] = useState<SharedExpenseAllocation | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    categoryId: 'cat-rent',
    branchId: 'branch-1',
    supplierName: '',
    amountAzn: '',
    taxRatePercent: 18,
    paymentMethod: 'bank_transfer' as 'cash' | 'card' | 'bank_transfer',
    paymentAccountId: 'acc-4',
    date: new Date().toISOString().slice(0, 10),
    description: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setIsLoading(true);
    try {
      const [expList, catList, accList, brList, recList, allocList, incList] = await Promise.all([
        financeRepository.getExpenses(),
        financeRepository.getExpenseCategories(),
        financeRepository.getAccounts(),
        branchRepository.getBranches(),
        financeRepository.getRecurringSchedules(),
        financeRepository.getSharedAllocations(),
        financeRepository.getOtherIncomeRecords(),
      ]);

      setExpenses(expList);
      setCategories(catList);
      setAccounts(accList);
      setBranches(brList.map((b) => ({ id: b.id, name: b.name })));
      setRecurringList(recList);
      setAllocations(allocList);
      setOtherIncomeList(incList);
    } catch (err) {
      toast({
        title: 'Məlumat yüklənmədi',
        description: err instanceof Error ? err.message : 'Xərc məlumatları yüklənərkən xəta baş verdi.',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountQapik = aznToQapik(formData.amountAzn);
    if (amountQapik <= 0) {
      toast({ title: 'Xəta', description: 'Məbləğ 0-dan böyük olmalıdır.', variant: 'danger' });
      return;
    }

    setIsSubmitting(true);
    try {
      const branchObj = branches.find((b) => b.id === formData.branchId);
      const accObj = accounts.find((a) => a.id === formData.paymentAccountId);

      const created = await financeRepository.createExpense({
        categoryId: formData.categoryId,
        branchId: formData.branchId,
        branchName: branchObj?.name || '28 May Flaman Filialı',
        supplierName: formData.supplierName || undefined,
        amountQapik,
        taxRatePercent: Number(formData.taxRatePercent),
        paymentMethod: formData.paymentMethod,
        paymentAccountId: formData.paymentAccountId,
        paymentAccountName: accObj?.name,
        date: formData.date,
        description: formData.description,
      });

      toast({
        title: 'Xərc Qeydə Alındı',
        description: `${created.documentNumber} nömrəli xərc qaralama kimi yaradıldı.`,
        variant: 'success',
      });

      setIsCreateExpenseOpen(false);
      setFormData({
        categoryId: 'cat-rent',
        branchId: 'branch-1',
        supplierName: '',
        amountAzn: '',
        taxRatePercent: 18,
        paymentMethod: 'bank_transfer',
        paymentAccountId: 'acc-4',
        date: new Date().toISOString().slice(0, 10),
        description: '',
      });
      await loadAllData();
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Xərc yaradılmadı.',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    try {
      await financeRepository.submitExpense(id);
      toast({ title: 'Təsdiqə Göndərildi', description: 'Xərc rəhbərlik/mühasibat təsdiqinə yönləndirildi.', variant: 'success' });
      await loadAllData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await financeRepository.approveExpense(id, 'Elmir Həsənov (Baş menecer)');
      toast({ title: 'Xərc Təsdiqləndi', description: 'Ödənişə icazə verildi.', variant: 'success' });
      await loadAllData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handleOpenReject = (id: string) => {
    setRejectionTargetId(id);
    setRejectionReason('');
    setIsRejectionModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectionTargetId || !rejectionReason.trim()) return;
    try {
      await financeRepository.rejectExpense(
        rejectionTargetId,
        rejectionReason.trim(),
        'Elmir Həsənov (Baş menecer)'
      );
      toast({ title: 'İmtina Edildi', description: 'Xərc təsdiqlənmədi və səbəb qeydə alındı.', variant: 'success' });
      setIsRejectionModalOpen(false);
      await loadAllData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handlePay = async (exp: ExpenseRecord) => {
    const accId = exp.paymentAccountId || accounts[0]?.id;
    try {
      await financeRepository.payExpense(exp.id, accId, 'Nərgiz Rüstəmova (Mühasib)');
      toast({
        title: 'Ödəniş İcra Edildi',
        description: `${exp.documentNumber} üzrə kassa/bank çıxarışı tərtib olundu.`,
        variant: 'success',
      });
      await loadAllData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Ödəniş baş tutmadı', variant: 'danger' });
    }
  };

  const handleConfirmReversal = async (reason: string) => {
    if (!reversalTarget) return;
    try {
      await financeRepository.reverseExpense(reversalTarget.id, reason, 'Cari İstifadəçi');
      toast({
        title: 'Xərc Ləğv Edildi (Storno)',
        description: `${reversalTarget.documentNumber} üzrə əks storno yaradıldı. Tarixçə silinmədi.`,
        variant: 'success',
      });
      setReversalTarget(null);
      await loadAllData();
    } catch (err) {
      toast({ title: 'Ləğvetmə xətası', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handleGenerateDraft = async (schedId: string) => {
    try {
      const draft = await financeRepository.generateDraftFromRecurring(schedId);
      toast({
        title: 'Qaralama Yaradıldı',
        description: `Təkrarlanan qrafik üzrə ${draft.documentNumber} qaralaması yaradıldı (Avtomatik ödənilmir).`,
        variant: 'success',
      });
      await loadAllData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handlePreviewSharedAllocation = async () => {
    const amountQapik = aznToQapik(sharedAmountAzn);
    const prev = await financeRepository.previewSharedAllocation(
      amountQapik,
      sharedCategory,
      'fixed_percentage'
    );
    setSharedPreview(prev);
  };

  const handleApplySharedAllocation = async () => {
    if (!sharedPreview) return;
    try {
      await financeRepository.applySharedAllocation(sharedPreview.id, 'Nərgiz Rüstəmova (Mühasib)');
      toast({
        title: 'Xərc Filiallara Paylandı',
        description: 'Mərkəzi xərc qeydə alındı və filial payları formalaşdırıldı.',
        variant: 'success',
      });
      setIsSharedModalOpen(false);
      setSharedPreview(null);
      await loadAllData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
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
            Gəlir və Əməliyyat Xərcləri (OPEX)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            İyerarxik xərc maddələri, təkrarlanan qrafiklər, birgə xərclərin paylanması və storno nəzarəti
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsSharedModalOpen(true);
              handlePreviewSharedAllocation();
            }}
            className="gap-1.5"
          >
            <Share2 className="h-4 w-4" />
            Birgə Xərc Paylanması
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCreateExpenseOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Yeni Xərc Qeydi
          </Button>
        </div>
      </div>

      <TaxComplianceNotice />

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'expenses'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Xərc Qeydləri Jurnalı ({expenses.length})
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'recurring'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Repeat className="h-4 w-4" />
          Təkrarlanan Xərc Qrafikləri ({recurringList.length})
        </button>
        <button
          onClick={() => setActiveTab('shared_allocation')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'shared_allocation'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Share2 className="h-4 w-4" />
          Filial Xərc Bölgüsü ({allocations.length})
        </button>
        <button
          onClick={() => setActiveTab('other_income')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'other_income'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          Digər Gəlirlər ({otherIncomeList.length})
        </button>
      </div>

      {/* Tab 1: Expenses List */}
      {activeTab === 'expenses' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Sənəd №</th>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Kateqoriya</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3">Təsvir & Təchizatçı</th>
                  <th className="px-4 py-3 text-right">Məbləğ + ƏDV</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {expenses.map((exp) => {
                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/50 ${
                        exp.isReversed ? 'opacity-50 line-through bg-slate-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {exp.documentNumber}
                        {exp.isReversal && (
                          <Badge variant="danger" className="ml-1.5 text-[10px]">
                            Storno
                          </Badge>
                        )}
                        {exp.isReversed && (
                          <Badge variant="outline" className="ml-1.5 text-[10px]">
                            Ləğv edilib
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(exp.date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {exp.categoryName}
                        {exp.subcategoryName && (
                          <span className="block text-[11px] text-slate-400">
                            {exp.subcategoryName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {exp.branchName}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xs">
                        <div className="truncate font-medium">{exp.description}</div>
                        {exp.supplierName && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {exp.supplierName}
                          </div>
                        )}
                        {exp.rejectionReason && (
                          <div className="text-[11px] text-rose-500 font-normal">
                            İmtina: {exp.rejectionReason}
                          </div>
                        )}
                        {exp.reversalReason && (
                          <div className="text-[11px] text-rose-500 font-normal">
                            Storno: {exp.reversalReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(exp.totalAmountQapik)}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          ƏDV ({exp.taxRatePercent}%): {formatMoney(exp.taxAmountQapik)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={
                            exp.status === 'paid'
                              ? 'default'
                              : exp.status === 'approved'
                              ? 'outline'
                              : exp.status === 'submitted'
                              ? 'warning'
                              : exp.status === 'rejected' || exp.status === 'reversed'
                              ? 'danger'
                              : 'neutral'
                          }
                          className="capitalize text-[10px]"
                        >
                          {exp.status === 'paid'
                            ? 'Ödənildi'
                            : exp.status === 'approved'
                            ? 'Təsdiqləndi'
                            : exp.status === 'submitted'
                            ? 'Təsdiq Gözləyir'
                            : exp.status === 'rejected'
                            ? 'İmtina Edildi'
                            : exp.status === 'reversed'
                            ? 'Ləğv Edildi'
                            : 'Qaralama'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {exp.status === 'draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSubmitForApproval(exp.id)}
                              className="h-6 px-2 text-[11px]"
                            >
                              Təsdiqə Göndər
                            </Button>
                          )}
                          {exp.status === 'submitted' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleApprove(exp.id)}
                                className="h-6 px-2 text-[11px] text-emerald-600 hover:text-emerald-700"
                              >
                                Təsdiqlə
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenReject(exp.id)}
                                className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700"
                              >
                                İmtina
                              </Button>
                            </>
                          )}
                          {exp.status === 'approved' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePay(exp)}
                              className="h-6 px-2 text-[11px] text-primary-600 font-semibold"
                            >
                              Ödəniş Et
                            </Button>
                          )}
                          {exp.status === 'paid' && !exp.isReversed && !exp.isReversal && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReversalTarget(exp)}
                              className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Ləğv Et
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Recurring Schedules */}
      {activeTab === 'recurring' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Təkrarlanan Xərc Qrafikləri (Müqavilələr)
            </h3>
            <p className="text-xs text-slate-500">
              Mütəmadi xərclər (icarə, internet, mühafizə). Heç vaxt avtomatik ödənilmir; hər dövr baxış üçün qaralama formalaşdırır.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Qrafik Başlığı</th>
                  <th className="px-4 py-3">Kateqoriya</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3">Tezlik & Gün</th>
                  <th className="px-4 py-3">Növbəti Tarix</th>
                  <th className="px-4 py-3 text-right">Təxmini Məbləğ</th>
                  <th className="px-4 py-3 text-center">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {recurringList.map((sched) => (
                  <tr key={sched.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {sched.title}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {sched.categoryName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {sched.branchName}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      Aylıq (hər ayın {sched.dayOfMonth}-i)
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200">
                      {sched.nextDueDate}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(sched.estimatedAmountQapik)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateDraft(sched.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Qaralama Yarat
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Shared Allocation */}
      {activeTab === 'shared_allocation' && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Birgə Xərclərin Filiallara Paylanması Tarixçəsi
                </h3>
                <p className="text-xs text-slate-500">
                  Mərkəzi ofis və ümumi marketinq xərclərinin filiallar üzrə qaydalara uyğun bölünməsi
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsSharedModalOpen(true);
                  handlePreviewSharedAllocation();
                }}
              >
                Yeni Bölgü Hesabla
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Bölgü Sənədi</th>
                    <th className="px-4 py-3">Tarix</th>
                    <th className="px-4 py-3">Kateqoriya</th>
                    <th className="px-4 py-3 text-right">Cəmi Məbləğ</th>
                    <th className="px-4 py-3">Filial Payları</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {allocations.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {a.title}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(a.date)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {a.categoryName}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(a.totalAmountQapik)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {a.shares.map((s) => (
                            <div key={s.branchId} className="flex justify-between text-[11px] gap-4">
                              <span className="text-slate-600 dark:text-slate-400">{s.branchName} ({s.percentage}%):</span>
                              <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                                {formatMoney(s.allocatedAmountQapik)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="default" className="text-[10px]">
                          Tətbiq Edildi
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Other Income */}
      {activeTab === 'other_income' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Digər Əməliyyat Gəlirləri
            </h3>
            <p className="text-xs text-slate-500">
              Vitrin alt-icarəsi, komissiya haqları, valyuta gəlirləri və kənar daxilolmalar
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Sənəd №</th>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Gəlir Növü</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3">Ödəyici & Təsvir</th>
                  <th className="px-4 py-3 text-right">Məbləğ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {otherIncomeList.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {inc.documentNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(inc.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {inc.categoryName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {inc.branchName}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{inc.payerName}</div>
                      <div className="text-slate-400 truncate">{inc.description}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(inc.amountQapik)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Expense Modal */}
      <Modal
        isOpen={isCreateExpenseOpen}
        onClose={() => setIsCreateExpenseOpen(false)}
        title="Yeni Əməliyyat Xərci Qeydiyyatı"
        className="max-w-lg"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Xərc Maddəsi
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Filial
              </label>
              <select
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Xalis Məbləğ (₼ AZN)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amountAzn}
                onChange={(e) => setFormData({ ...formData, amountAzn: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Vergi Dərəcəsi
              </label>
              <select
                value={formData.taxRatePercent}
                onChange={(e) => setFormData({ ...formData, taxRatePercent: Number(e.target.value) })}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value={18}>18% Standart ƏDV</option>
                <option value={0}>0% Azad Edilmiş / Sadələşdirilmiş</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Təchizatçı / Kontragent (Könüllü)
            </label>
            <input
              type="text"
              value={formData.supplierName}
              onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
              placeholder="Məsələn: AF Mall İcarə QSC"
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Ödəniş Metodu
              </label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as 'cash' | 'bank_transfer' | 'card' })}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="bank_transfer">Bank Köçürməsi</option>
                <option value="cash">Filial Kassasından Nağd</option>
                <option value="card">Korporativ Kart</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Tarix
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Xərc Təsviri & Əsaslandırma
            </label>
            <textarea
              rows={2}
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Məsələn: 28 May mağazasının mart ayı üçün elektrik sərfiyyatı..."
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateExpenseOpen(false)}
              disabled={isSubmitting}
            >
              İmtina
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Qaralama Kimi Yadda Saxla
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={isRejectionModalOpen}
        onClose={() => setIsRejectionModalOpen(false)}
        title="Xərc Təsdiqindən İmtina Səbəbi"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Xərcin təsdiq edilməməsi səbəbini qeyd edin. Bu səbəb audit jurnalında və sənəddə əks olunacaq.
          </p>
          <textarea
            rows={3}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Məsələn: Məbləğ təsdiqlənmiş büdcə limitini aşır, zəruri qəbz skanı əlavə edilməyib..."
            className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-rose-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsRejectionModalOpen(false)}>
              Geri
            </Button>
            <Button variant="destructive" onClick={handleConfirmReject} disabled={!rejectionReason.trim()}>
              İmtinanı Təsdiqlə
            </Button>
          </div>
        </div>
      </Modal>

      {/* Shared Allocation Preview Modal */}
      <Modal
        isOpen={isSharedModalOpen}
        onClose={() => setIsSharedModalOpen(false)}
        title="Birgə Xərclərin Filiallara Paylanması (Allocation Preview)"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Bölünəcək Məbləğ (AZN)
              </label>
              <input
                type="number"
                value={sharedAmountAzn}
                onChange={(e) => setSharedAmountAzn(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Kateqoriya
              </label>
              <select
                value={sharedCategory}
                onChange={(e) => setSharedCategory(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handlePreviewSharedAllocation}>
              Canlı Qabaqcadan Baxış (Recalculate)
            </Button>
          </div>

          {sharedPreview && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3.5 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Filiallar Üzrə Hesablanmış Pay Bölgüsü:
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sharedPreview.shares.map((s) => (
                  <div key={s.branchId} className="py-1.5 flex justify-between items-center">
                    <span className="text-slate-700 dark:text-slate-300">
                      {s.branchName} <span className="text-slate-400 font-mono">({s.percentage}%)</span>
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(s.allocatedAmountQapik)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsSharedModalOpen(false)}>
              İmtina
            </Button>
            <Button onClick={handleApplySharedAllocation} disabled={!sharedPreview}>
              Bölgünü Tətbiq Et və Qeydə Al
            </Button>
          </div>
        </div>
      </Modal>

      {/* Transaction Reversal Modal */}
      {reversalTarget && (
        <TransactionReversalModal
          isOpen={!!reversalTarget}
          onClose={() => setReversalTarget(null)}
          onConfirm={handleConfirmReversal}
          documentNumber={reversalTarget.documentNumber}
          amountQapik={reversalTarget.totalAmountQapik}
          description={reversalTarget.description}
          typeLabel="Xərc Qeydi"
        />
      )}
    </div>
  );
};
