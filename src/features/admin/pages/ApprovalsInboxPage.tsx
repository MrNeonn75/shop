import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { ApprovalItem } from '../types/notifications';
import { notificationsRepository } from '../../../shared/adapters';
import { formatDateTime, formatMoney } from '../../../shared/utils/formatters';
import {
  CheckCircle,
  XCircle,
  Building2,
  ExternalLink,
  Search,
  RefreshCw,
} from 'lucide-react';

export const ApprovalsInboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Decision Modal
  const [activeItem, setActiveItem] = useState<ApprovalItem | null>(null);
  const [decisionAction, setDecisionAction] = useState<'approved' | 'rejected'>('approved');
  const [decisionComment, setDecisionComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchApprovals = async () => {
    setIsLoading(true);
    try {
      const data = await notificationsRepository.getApprovals();
      setApprovals(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Təsdiq gözləyən sənədləri yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const filteredApprovals = useMemo(() => {
    return approvals.filter((item) => {
      const matchType = selectedType === 'all' || item.type === selectedType;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(q) ||
        item.documentNumber.toLowerCase().includes(q) ||
        item.requesterName.toLowerCase().includes(q) ||
        item.branchName.toLowerCase().includes(q);

      return matchType && matchSearch;
    });
  }, [approvals, selectedType, searchQuery]);

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  const handleOpenDecision = (item: ApprovalItem, action: 'approved' | 'rejected') => {
    setActiveItem(item);
    setDecisionAction(action);
    setDecisionComment('');
  };

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    setIsSubmitting(true);
    try {
      const updated = await notificationsRepository.updateApprovalStatus(
        activeItem.id,
        decisionAction,
        decisionComment || (decisionAction === 'approved' ? 'Təsdiq edildi' : 'Rədd edildi')
      );

      setApprovals((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );

      toast({
        type: decisionAction === 'approved' ? 'success' : 'warning',
        title: decisionAction === 'approved' ? 'Sənəd təsdiqləndi' : 'Sənəd rədd edildi',
        message: `${activeItem.documentNumber} nömrəli ${activeItem.typeLabelAz} üçün qərar qeydə alındı.`,
      });

      setActiveItem(null);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Qərarı yadda saxlamaq mümkün olmadı.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Təsdiqlər Növbəsi' },
        ]}
      />

      <PageHeader
        title="Vahid Təsdiq Növbəsi (Approvals Inbox)"
        description="Maliyyə xərcləri, satınalma sifarişləri, anbar transferləri, əməkhaqqı və marketinq kampaniyaları üzrə rəhbər təsdiqlərinin vahid qovluğu."
        badge={
          <Badge variant={pendingCount > 0 ? 'warning' : 'neutral'} size="sm">
            {pendingCount} Gözləyən Qərar
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchApprovals}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Yenilə
          </Button>
        }
      />

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sənəd №, təşəbbüskar və ya məzmun ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Hamısı' },
              { id: 'expense', label: 'Xərclər' },
              { id: 'po', label: 'Satınalma' },
              { id: 'transfer', label: 'Transferlər' },
              { id: 'payroll', label: 'Əməkhaqqı' },
              { id: 'campaign', label: 'Kampaniyalar' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedType(cat.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
                  selectedType === cat.id
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Approvals Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">Sənəd & Tipi</th>
                <th className="py-3 px-4">Məzmun</th>
                <th className="py-3 px-4">Məbləğ</th>
                <th className="py-3 px-4">Təşəbbüskar & Filial</th>
                <th className="py-3 px-4">Tarix</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Qərar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredApprovals.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-foreground block">
                      {item.documentNumber}
                    </span>
                    <Badge variant="neutral" size="sm" className="text-[10px] px-1 py-0 mt-0.5">
                      {item.typeLabelAz}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <strong className="text-foreground block">{item.title}</strong>
                    {item.linkUrl && (
                      <button
                        type="button"
                        onClick={() => navigate(item.linkUrl)}
                        className="text-[10px] text-bh-accent hover:underline flex items-center gap-1 mt-0.5"
                      >
                        Sənədə bax
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-foreground">
                    {item.amountAzn !== undefined ? formatMoney(item.amountAzn, false) : '—'}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    <span className="text-foreground font-medium block">
                      {item.requesterName}
                    </span>
                    <span className="text-[10px] flex items-center gap-1 mt-0.5">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {item.branchName}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                    {formatDateTime(item.requestedAt)}
                  </td>
                  <td className="py-3 px-4">
                    {item.status === 'pending' ? (
                      <Badge variant="warning" size="sm">
                        Gözləyir
                      </Badge>
                    ) : item.status === 'approved' ? (
                      <Badge variant="success" size="sm">
                        Təsdiqləndi
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="sm">
                        Rədd Edildi
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {item.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleOpenDecision(item, 'approved')}
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Təsdiq
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDecision(item, 'rejected')}
                          className="h-7 text-xs text-danger hover:text-danger"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Rədd
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-[11px] italic">Qərar verilib</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Comment Modal */}
      <Modal
        isOpen={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
        title={
          decisionAction === 'approved'
            ? 'Sənədin Təsdiqlənməsi'
            : 'Sənədin Rədd Edilməsi'
        }
        size="md"
      >
        {activeItem && (
          <form onSubmit={handleConfirmDecision} className="space-y-4 text-xs">
            <div className="p-3 bg-muted/30 rounded-lg space-y-1.5 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sənəd:</span>
                <span className="font-mono font-bold text-foreground">
                  {activeItem.documentNumber} ({activeItem.typeLabelAz})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Təşəbbüskar:</span>
                <span className="text-foreground font-semibold">
                  {activeItem.requesterName} • {activeItem.branchName}
                </span>
              </div>
              {activeItem.amountAzn !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Məbləğ:</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatMoney(activeItem.amountAzn, false)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">
                {decisionAction === 'approved' ? 'Təsdiq Rəyi (İstəyə bağlı)' : 'Rədd Səbəbi (Məcburi)'}
              </label>
              <textarea
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                rows={3}
                placeholder={
                  decisionAction === 'approved'
                    ? 'Təsdiq qeydi əlavə edin...'
                    : 'Rədd edilmə əsasını qeyd edin...'
                }
                required={decisionAction === 'rejected'}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveItem(null)}
              >
                İmtina
              </Button>
              <Button
                type="submit"
                variant={decisionAction === 'approved' ? 'default' : 'destructive'}
                size="sm"
                isLoading={isSubmitting}
                className={decisionAction === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                {decisionAction === 'approved' ? 'Təsdiqlə' : 'Rədd Et'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
