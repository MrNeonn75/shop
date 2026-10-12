import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { purchasingRepository } from '../../../shared/adapters';
import { PurchaseRequest, PurchaseRequestStatus } from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';

export const PurchaseRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [search, setSearch] = useState('');

  // Decision Modal
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    req?: PurchaseRequest;
    decision?: 'approved' | 'rejected' | 'returned_for_edit';
    reason: string;
  }>({
    isOpen: false,
    reason: '',
  });

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await purchasingRepository.getPurchaseRequests({
        search,
        status: activeTab === 'pending' ? 'pending_approval' : undefined,
      });
      setRequests(data);
    } catch {
      toast({ title: 'Xəta', description: 'Tələbnamələri yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [activeTab, search]);

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionModal.req || !decisionModal.decision) return;

    try {
      await purchasingRepository.updatePurchaseRequestStatus(
        decisionModal.req.id,
        decisionModal.decision,
        decisionModal.reason
      );
      toast({
        title: 'Qərar İcra Edildi',
        description: `Tələbnamə #${decisionModal.req.requestNumber} statusu yeniləndi.`,
      });
      setDecisionModal({ isOpen: false, reason: '' });
      loadRequests();
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  const getStatusBadge = (status: PurchaseRequestStatus) => {
    switch (status) {
      case 'pending_approval':
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="w-3 h-3" /> Nəzərdən keçirilir
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> Təsdiqlənib
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="danger" className="gap-1">
            <XCircle className="w-3 h-3" /> İmtina edilib
          </Badge>
        );
      case 'returned_for_edit':
        return (
          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
            <RotateCcw className="w-3 h-3" /> Düzəlişə qaytarılıb
          </Badge>
        );
      case 'converted_to_po':
        return <Badge variant="neutral">PO Açılıb</Badge>;
      default:
        return <Badge variant="outline">Qaralama</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Satınalma', href: '/purchasing/orders' },
          { label: 'Daxili Tələbnamələr' },
        ]}
      />

      <PageHeader
        title="Daxili Satınalma Tələbnamələri"
        description="Filial və anbarlardan daxil olan mal sifariş sorğuları və təsdiq növbəsi."
        actions={
          <Button
            size="sm"
            onClick={() => navigate('/purchasing/requests/new')}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> Yeni Tələbnamə
          </Button>
        }
      />

      {/* Tabs and Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'all'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-bh-gray-100 text-bh-gray-700 dark:bg-bh-black-800 dark:text-bh-gray-300'
              }`}
            >
              Bütün Tələbnamələr
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-bh-gray-100 text-bh-gray-700 dark:bg-bh-black-800 dark:text-bh-gray-300'
              }`}
            >
              <Clock className="w-3 h-3 text-amber-500" /> Təsdiq Növbəsi
            </button>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-bh-gray-400" />
            <input
              type="text"
              placeholder="Sorğu №, filial, səbəb..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-xs text-bh-gray-500 uppercase border-b border-bh-gray-200 dark:border-bh-black-700">
              <tr>
                <th className="py-3 px-4">Tələbnamə №</th>
                <th className="py-3 px-4">Filial / Anbar</th>
                <th className="py-3 px-4">Səbəb</th>
                <th className="py-3 px-4">Tarix / Tələb Olunan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Təxmini Məbləğ</th>
                <th className="py-3 px-4 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-bh-gray-400">
                    Yüklənir...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-bh-gray-400">
                    Tələbnamə tapılmadı.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-bh-gray-50/50 dark:hover:bg-bh-black-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-bh-black-900 dark:text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-bh-gray-400" />
                        <span>{r.requestNumber}</span>
                        {r.isDemo && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-mono">
                            DEMO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-bh-gray-400">{r.createdByName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-bh-black-900 dark:text-white">
                        {r.branchName}
                      </div>
                      <div className="text-[11px] text-bh-gray-500">{r.warehouseName}</div>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-bh-gray-600 dark:text-bh-gray-300">
                      {r.reason}
                    </td>
                    <td className="py-3 px-4 text-bh-gray-500">
                      <div>Yaradıldı: {formatDate(r.createdAt)}</div>
                      <div className="text-[11px] font-medium text-bh-black-800 dark:text-bh-gray-200">
                        Tələb: {formatDate(r.neededByDate)}
                      </div>
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(r.status)}</td>
                    <td className="py-3 px-4 text-right font-medium font-mono text-bh-black-900 dark:text-white">
                      {formatMoney(r.totalEstimatedAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === 'pending_approval' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                              onClick={() =>
                                setDecisionModal({
                                  isOpen: true,
                                  req: r,
                                  decision: 'approved',
                                  reason: 'Tələbnamə əsaslı hesab edildi və təsdiqləndi',
                                })
                              }
                            >
                              Təsdiq
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-rose-600 border-rose-300 hover:bg-rose-50"
                              onClick={() =>
                                setDecisionModal({
                                  isOpen: true,
                                  req: r,
                                  decision: 'rejected',
                                  reason: '',
                                })
                              }
                            >
                              İmtina
                            </Button>
                          </>
                        )}

                        {r.status === 'approved' && !r.linkedDocs.orderId && (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1"
                            onClick={() =>
                              navigate(
                                `/purchasing/orders/new?requestId=${r.id}&warehouseId=${r.warehouseId}`
                              )
                            }
                          >
                            PO Yarat <ArrowRight className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Approval / Rejection Decision */}
      <Modal
        isOpen={decisionModal.isOpen}
        onClose={() => setDecisionModal({ isOpen: false, reason: '' })}
        title={
          decisionModal.decision === 'approved'
            ? `Tələbnaməni Təsdiq Et (#${decisionModal.req?.requestNumber})`
            : decisionModal.decision === 'rejected'
            ? `Tələbnamədən İmtina (#${decisionModal.req?.requestNumber})`
            : `Tələbnaməni Düzəlişə Qaytar (#${decisionModal.req?.requestNumber})`
        }
      >
        <form onSubmit={handleDecisionSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
              Qərarın Səbəbi və Rəhbərlik Qeydi *
            </label>
            <textarea
              required
              rows={3}
              value={decisionModal.reason}
              onChange={(e) =>
                setDecisionModal({ ...decisionModal, reason: e.target.value })
              }
              className="w-full px-3 py-2 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
              placeholder="Qeyd daxil edin..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDecisionModal({ isOpen: false, reason: '' })}
            >
              Ləğv et
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={decisionModal.decision === 'rejected' ? 'destructive' : 'default'}
            >
              Qərarı Təsdiqlə
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
