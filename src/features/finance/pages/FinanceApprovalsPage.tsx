import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  History,
  ShieldCheck,
} from 'lucide-react';
import { financeRepository } from '../../../shared/adapters';
import { ApprovalInboxItem } from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';

export const FinanceApprovalsPage: React.FC = () => {
  const { toast } = useToast();
  const [approvals, setApprovals] = useState<ApprovalInboxItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'budget_revision' | 'supplier_payment'>('all');

  // History modal
  const [selectedItemHistory, setSelectedItemHistory] = useState<ApprovalInboxItem | null>(null);

  // Reject modal
  const [rejectItem, setRejectItem] = useState<ApprovalInboxItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadApprovals();
  }, []);

  async function loadApprovals() {
    setIsLoading(true);
    try {
      const list = await financeRepository.getPendingApprovals();
      setApprovals(list);
    } catch (err) {
      toast({
        title: 'Məlumat yüklənmədi',
        description: err instanceof Error ? err.message : 'Təsdiq növbəsi yüklənərkən xəta baş verdi.',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleApprove = async (item: ApprovalInboxItem) => {
    try {
      if (item.entityType === 'expense') {
        await financeRepository.approveExpense(item.entityId, 'Elmir Həsənov (Baş menecer)');
      }
      toast({
        title: 'Sənəd Təsdiqləndi',
        description: `${item.documentNumber} üzrə əməliyyat təsdiqləndi.`,
        variant: 'success',
      });
      await loadApprovals();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectItem || !rejectionReason.trim()) return;
    try {
      if (rejectItem.entityType === 'expense') {
        await financeRepository.rejectExpense(
          rejectItem.entityId,
          rejectionReason.trim(),
          'Elmir Həsənov (Baş menecer)'
        );
      }
      toast({
        title: 'Sənədə İmtina Edildi',
        description: `${rejectItem.documentNumber} üzrə imtina səbəbi qeydə alındı.`,
        variant: 'success',
      });
      setRejectItem(null);
      setRejectionReason('');
      await loadApprovals();
    } catch (err) {
      toast({ title: 'Xəta', description: err instanceof Error ? err.message : 'Xəta baş verdi', variant: 'danger' });
    }
  };

  const filteredApprovals = approvals.filter((a) => {
    if (filterType === 'all') return true;
    return a.entityType === filterType;
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
            Vahid Maliyyə Təsdiqləmələri Mərkəzi (Approvals Inbox)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Xərc tələbləri, böyük məbləğli ödənişlər və büdcə limit təftişləri üzrə rəhbərlik təsdiq növbəsi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={approvals.length > 0 ? 'warning' : 'outline'} className="text-xs px-3 py-1">
            {approvals.length} açıq sorğu
          </Badge>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Növ:</span>
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            filterType === 'all'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800'
          }`}
        >
          Bütün Sorğular ({approvals.length})
        </button>
        <button
          onClick={() => setFilterType('expense')}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            filterType === 'expense'
              ? 'bg-primary-600 text-white font-medium'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800'
          }`}
        >
          Xərclər ({approvals.filter((a) => a.entityType === 'expense').length})
        </button>
        <button
          onClick={() => setFilterType('budget_revision')}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            filterType === 'budget_revision'
              ? 'bg-blue-600 text-white font-medium'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800'
          }`}
        >
          Büdcə Təftişləri ({approvals.filter((a) => a.entityType === 'budget_revision').length})
        </button>
      </div>

      {/* Approvals Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Sənəd №</th>
                <th className="px-4 py-3">Növ</th>
                <th className="px-4 py-3">Filial</th>
                <th className="px-4 py-3">Təsvir & Tələb Məzmunu</th>
                <th className="px-4 py-3">Təqdim Edən</th>
                <th className="px-4 py-3">Təsdiq Səviyyəsi</th>
                <th className="px-4 py-3 text-right">Məbləğ</th>
                <th className="px-4 py-3 text-center">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredApprovals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    Təsdiq gözləyən maliyyə sorğusu yoxdur. Bütün əməliyyatlar icra olunub.
                  </td>
                </tr>
              ) : (
                filteredApprovals.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {item.documentNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {item.entityType === 'expense' ? 'Xərc Tələbi' : item.entityType === 'budget_revision' ? 'Büdcə Təftişi' : 'Ödəniş'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {item.branchName}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 max-w-xs">
                      <div className="font-medium truncate">{item.title}</div>
                      <button
                        onClick={() => setSelectedItemHistory(item)}
                        className="text-[11px] text-primary-600 hover:underline flex items-center gap-1 mt-0.5"
                      >
                        <History className="h-3 w-3" />
                        Audit Tarixçəsi
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      <div>{item.submittedBy}</div>
                      <div className="text-[11px] text-slate-400">{formatDate(item.submittedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="warning" className="text-[10px]">
                        {item.thresholdNote}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(item.amountQapik)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApprove(item)}
                          className="h-7 px-2.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Təsdiqlə
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRejectItem(item);
                            setRejectionReason('');
                          }}
                          className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          İmtina
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Audit History Modal */}
      {selectedItemHistory && (
        <Modal
          isOpen={!!selectedItemHistory}
          onClose={() => setSelectedItemHistory(null)}
          title={`Audit İzi və Tarixçə — ${selectedItemHistory.documentNumber}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div>Sənəd: <strong>{selectedItemHistory.title}</strong></div>
              <div>Məbləğ: <strong className="font-mono">{formatMoney(selectedItemHistory.amountQapik)}</strong></div>
              <div>Filial: {selectedItemHistory.branchName}</div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Hərəkət Xronologiyası:</span>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {selectedItemHistory.history.map((h, idx) => (
                  <div key={idx} className="py-2 space-y-0.5">
                    <div className="flex justify-between font-medium text-slate-800 dark:text-slate-200">
                      <span>{h.action}</span>
                      <span className="text-slate-400 text-[11px] font-mono">{formatDate(h.timestamp)}</span>
                    </div>
                    <div className="text-slate-500">Məsul şəxs: {h.user}</div>
                    {h.note && <div className="text-slate-400 italic">Qeyd: {h.note}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setSelectedItemHistory(null)}>
                Bağla
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Reason Modal */}
      {rejectItem && (
        <Modal
          isOpen={!!rejectItem}
          onClose={() => setRejectItem(null)}
          title={`İmtina Səbəbi — ${rejectItem.documentNumber}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Təsdiqdən imtina səbəbini ətraflı qeyd edin. Tələb edən əməkdaş dərhal bildiriş alacaq.
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Məsələn: Filial xərc limiti aşılıb, rəhbərliklə ilkin razılaşma tələb olunur..."
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-rose-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRejectItem(null)}>
                Geri
              </Button>
              <Button variant="destructive" onClick={handleConfirmReject} disabled={!rejectionReason.trim()}>
                İmtinanı Təsdiqlə
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
