import React, { useEffect, useState } from 'react';
import {
  Plus,
} from 'lucide-react';
import { financeRepository, branchRepository } from '../../../shared/adapters';
import { BudgetPlan, ExpenseCategory } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { aznToQapik } from '../../../shared/utils/money';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';

export const BudgetsPage: React.FC = () => {
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<BudgetPlan[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetPlan | null>(null);

  // Form State for Create
  const [newBranchId, setNewBranchId] = useState('branch-1');
  const [newCategoryId, setNewCategoryId] = useState('cat-rent');
  const [newPeriod, setNewPeriod] = useState('2026-04');
  const [newBudgetAzn, setNewBudgetAzn] = useState('5000');

  // Form State for Revision
  const [revisionAmountAzn, setRevisionAmountAzn] = useState('');
  const [revisionReason, setRevisionReason] = useState('');

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [bdgList, catList, brList] = await Promise.all([
        financeRepository.getBudgets(),
        financeRepository.getExpenseCategories(),
        branchRepository.getBranches(),
      ]);
      setBudgets(bdgList);
      setCategories(catList);
      setBranches(brList.map((b) => ({ id: b.id, name: b.name })));
    } catch (err) {
      toast({
        title: 'Məlumat yüklənmədi',
        description: err instanceof Error ? err.message : 'Büdcə məlumatları yüklənərkən xəta baş verdi.',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const budgetedAmountQapik = aznToQapik(newBudgetAzn);
    if (budgetedAmountQapik <= 0) {
      toast({ title: 'Xəta', description: 'Məbləğ 0-dan böyük olmalıdır.', variant: 'danger' });
      return;
    }

    try {
      const br = branches.find((b) => b.id === newBranchId);
      await financeRepository.createBudget({
        branchId: newBranchId,
        branchName: br?.name || 'Filial',
        categoryId: newCategoryId,
        period: newPeriod,
        budgetedAmountQapik,
      });

      toast({
        title: 'Büdcə Təyin Edildi',
        description: `${newPeriod} dövrü üçün xərc limiti uğurla formalaşdırıldı.`,
        variant: 'success',
      });

      setIsCreateModalOpen(false);
      await loadData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handleOpenRevision = (b: BudgetPlan) => {
    setSelectedBudget(b);
    setRevisionAmountAzn((Number(b.budgetedAmountQapik) / 100).toFixed(2));
    setRevisionReason('');
    setIsRevisionModalOpen(true);
  };

  const handleRequestRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBudget) return;
    const newAmountQapik = aznToQapik(revisionAmountAzn);
    if (newAmountQapik <= 0 || !revisionReason.trim()) {
      toast({ title: 'Xəta', description: 'Yeni məbləğ və əsaslandırılmış səbəb tələb olunur.', variant: 'danger' });
      return;
    }

    try {
      await financeRepository.requestBudgetRevision(
        selectedBudget.id,
        newAmountQapik,
        revisionReason.trim(),
        'Filial Meneceri'
      );

      toast({
        title: 'Büdcə Təftişi Tələb Edildi',
        description: 'Dəyişiklik sorğusu rəhbərlik təsdiq növbəsinə göndərildi.',
        variant: 'success',
      });

      setIsRevisionModalOpen(false);
      await loadData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handleDecideRevision = async (budgetId: string, revisionId: string, decision: 'approved' | 'rejected') => {
    try {
      await financeRepository.decideBudgetRevision(
        budgetId,
        revisionId,
        decision,
        'Elmir Həsənov (Baş menecer)',
        decision === 'approved' ? 'Təsdiqləndi' : 'Büdcə artımı əsaslandırılmadı'
      );
      toast({
        title: decision === 'approved' ? 'Büdcə Yeniləndi' : 'Təftiş İmtina Edildi',
        description: 'Büdcə limiti statusu yeniləndi.',
        variant: 'success',
      });
      await loadData();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const totalBudgetedQapik = budgets.reduce((s, b) => s + Number(b.budgetedAmountQapik), 0);
  const totalActualQapik = budgets.reduce((s, b) => s + Number(b.actualSpentQapik), 0);
  const exceededCount = budgets.filter((b) => b.alertLevel === 'exceeded').length;

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
            Büdcə Planlaması və Limitlər
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Filiallar və xərc kateqoriyaları üzrə təsdiqlənmiş limitlər, faktiki kənarlaşma və təftiş nəzarəti
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button size="sm" onClick={() => setIsCreateModalOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Yeni Büdcə Limiti Təyin Et
          </Button>
        </div>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <span className="text-xs font-semibold text-slate-500 uppercase">Cəmi Planlaşdırılmış Büdcə</span>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-2">
            {formatMoney(totalBudgetedQapik)}
          </div>
          <p className="text-xs text-slate-400 mt-1">Cari dövr üzrə təsdiqlənmiş ümumi limit</p>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-semibold text-slate-500 uppercase">Faktiki İcra Olunmuş Xərc</span>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">
            {formatMoney(totalActualQapik)}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            İstifadə: {totalBudgetedQapik > 0 ? ((totalActualQapik / totalBudgetedQapik) * 100).toFixed(1) : 0}%
          </p>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-semibold text-slate-500 uppercase">Limiti Aşan Maddələr</span>
          <div className={`text-2xl font-bold font-mono mt-2 ${exceededCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {exceededCount} maddə
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {exceededCount > 0 ? 'Təcili təftiş və rəhbərlik baxışı tələb olunur' : 'Bütün xərclər planlaşdırılmış çərçivədədir'}
          </p>
        </Card>
      </div>

      {/* Comparison Visual Chart Bar */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-4">
          Büdcə vs Faktiki İcra Müqayisəsi
        </h3>
        <div className="space-y-4">
          {budgets.map((b) => {
            const budgeted = Number(b.budgetedAmountQapik);
            const actual = Number(b.actualSpentQapik);
            const maxVal = Math.max(budgeted, actual, 1);
            const actualPct = (actual / maxVal) * 100;

            return (
              <div key={b.id} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-800 dark:text-slate-200">
                    {b.branchName} — <strong className="text-slate-900 dark:text-slate-100">{b.categoryName}</strong>
                  </span>
                  <div className="space-x-3 font-mono">
                    <span className="text-slate-500">Büdcə: {formatMoney(b.budgetedAmountQapik)}</span>
                    <span className={b.alertLevel === 'exceeded' ? 'text-rose-600 font-bold' : 'text-slate-900'}>
                      Faktiki: {formatMoney(b.actualSpentQapik)}
                    </span>
                  </div>
                </div>
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(actualPct, 100)}%` }}
                    className={`h-full transition-all ${
                      b.alertLevel === 'exceeded'
                        ? 'bg-rose-500'
                        : b.alertLevel === 'warning'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Budget Plans Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Dövr</th>
                <th className="px-4 py-3">Filial</th>
                <th className="px-4 py-3">Kateqoriya</th>
                <th className="px-4 py-3 text-right">Təsdiqlənmiş Büdcə</th>
                <th className="px-4 py-3 text-right">Faktiki Xərclənib</th>
                <th className="px-4 py-3 text-right">Kənarlaşma (Variance)</th>
                <th className="px-4 py-3 text-center">Limit Statusu</th>
                <th className="px-4 py-3 text-center">Təftiş Tarixçəsi</th>
                <th className="px-4 py-3 text-center">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {budgets.map((b) => {
                const isOver = b.alertLevel === 'exceeded';
                const isWarn = b.alertLevel === 'warning';

                return (
                  <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                      {b.period}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {b.branchName}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {b.categoryName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(b.budgetedAmountQapik)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(b.actualSpentQapik)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold ${
                        isOver
                          ? 'text-rose-600 dark:text-rose-400'
                          : isWarn
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {Number(b.varianceQapik) > 0 ? '+' : ''}{formatMoney(b.varianceQapik)}
                      <span className="block text-[10px] font-normal">
                        ({b.variancePercent > 0 ? '+' : ''}{b.variancePercent}%)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={isOver ? 'danger' : isWarn ? 'warning' : 'default'}
                        className="text-[10px]"
                      >
                        {isOver ? 'Limit Aşılıb (>100%)' : isWarn ? 'Xəbərdarlıq (90-100%)' : 'Normal (<90%)'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {b.revisions.length > 0 ? (
                        <div className="space-y-1">
                          {b.revisions.map((rev) => (
                            <div key={rev.id} className="text-[11px] text-slate-500">
                              <span>Rev #{rev.revisionNumber}: {formatMoney(rev.newAmountQapik)}</span>
                              {rev.status === 'pending' && (
                                <div className="mt-1 flex items-center justify-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDecideRevision(b.id, rev.id, 'approved')}
                                    className="h-5 px-1.5 text-[10px] text-emerald-600"
                                  >
                                    Təsdiq
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDecideRevision(b.id, rev.id, 'rejected')}
                                    className="h-5 px-1.5 text-[10px] text-rose-600"
                                  >
                                    İmtina
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRevision(b)}
                        className="h-7 px-2 text-xs"
                      >
                        Təftiş Tələb Et
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Budget Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Yeni Büdcə Limiti Təyin Et"
      >
        <form onSubmit={handleCreateBudget} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Filial
              </label>
              <select
                value={newBranchId}
                onChange={(e) => setNewBranchId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Kateqoriya
              </label>
              <select
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value)}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Dövr (YYYY-MM)
              </label>
              <input
                type="text"
                value={newPeriod}
                onChange={(e) => setNewPeriod(e.target.value)}
                placeholder="2026-04"
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Büdcə Limiti (₼ AZN)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={newBudgetAzn}
                onChange={(e) => setNewBudgetAzn(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              İmtina
            </Button>
            <Button type="submit">Büdcəni Yadda Saxla</Button>
          </div>
        </form>
      </Modal>

      {/* Revision Modal */}
      {selectedBudget && (
        <Modal
          isOpen={isRevisionModalOpen}
          onClose={() => setIsRevisionModalOpen(false)}
          title={`Büdcə Limitinin Təftişi — ${selectedBudget.categoryName}`}
        >
          <form onSubmit={handleRequestRevision} className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 text-xs border border-slate-200 dark:border-slate-800 space-y-1">
              <div>Filial: <strong>{selectedBudget.branchName}</strong></div>
              <div>Cari Limit: <strong className="font-mono">{formatMoney(selectedBudget.budgetedAmountQapik)}</strong></div>
              <div>Faktiki Xərclənib: <strong className="font-mono text-blue-600">{formatMoney(selectedBudget.actualSpentQapik)}</strong></div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Təklif Olunan Yeni Limit (₼ AZN)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={revisionAmountAzn}
                onChange={(e) => setRevisionAmountAzn(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Artırma / Azaltma Səbəbi
              </label>
              <textarea
                rows={3}
                required
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="Məsələn: Mağaza vitrinlərinin bahar yenilənməsi səbəbilə əlavə təmir və təchizat tələb olunur..."
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsRevisionModalOpen(false)}>
                İmtina
              </Button>
              <Button type="submit">Təftiş Sorğusunu Göndər</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
