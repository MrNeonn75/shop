import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  FileText,
  ArrowRight,
  PackagePlus,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { purchasingRepository } from '../../../shared/adapters';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';

export const PurchaseOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const search = searchParams.get('search') || '';
  const status = (searchParams.get('status') as PurchaseOrderStatus | 'all') || 'all';

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const data = await purchasingRepository.getPurchaseOrders({
        search,
        status: status !== 'all' ? status : undefined,
      });
      setOrders(data);
    } catch {
      toast({ title: 'Xəta', description: 'Sifarişləri yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [search, status]);

  const handleSearchChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set('search', val);
    else next.delete('search');
    setSearchParams(next);
  };

  const handleStatusChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val !== 'all') next.set('status', val);
    else next.delete('status');
    setSearchParams(next);
  };

  const getStatusBadge = (st: PurchaseOrderStatus) => {
    switch (st) {
      case 'draft':
        return <Badge variant="outline">Qaralama</Badge>;
      case 'pending_approval':
        return <Badge variant="warning">Təsdiq Gözləyir</Badge>;
      case 'approved':
        return <Badge variant="success">Təsdiqlənib</Badge>;
      case 'sent':
        return <Badge variant="neutral">Göndərilib</Badge>;
      case 'partially_received':
        return <Badge variant="warning">Qismən Təhvil Alınıb</Badge>;
      case 'received':
        return <Badge variant="success">Tam Təhvil Alınıb</Badge>;
      case 'closed':
        return <Badge variant="outline">Bağlanıb</Badge>;
      case 'cancelled':
        return <Badge variant="danger">Ləğv Edilib</Badge>;
      default:
        return <Badge variant="outline">{st}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/catalog' },
          { label: 'Satınalma Sifarişləri' },
        ]}
      />

      <PageHeader
        title="Satınalma Sifarişləri (PO)"
        description="Təchizatçılara verilmiş rəsmi sifarişlər, icra statusu və təhvil-təslim izlənməsi."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/purchasing/requests')}
              className="gap-1.5"
            >
              <FileText className="w-4 h-4" /> Daxili Tələbnamələr
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/purchasing/orders/new')}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" /> Yeni Sifariş (PO)
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-bh-gray-400" />
            <input
              type="text"
              placeholder="PO nömrəsi, təchizatçı adı, anbar..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900 text-bh-black-900 dark:text-white"
            >
              <option value="all">Bütün Statuslar</option>
              <option value="approved">Təsdiqlənib</option>
              <option value="sent">Göndərilib</option>
              <option value="partially_received">Qismən Təhvil Alınıb</option>
              <option value="received">Tam Təhvil Alınıb</option>
              <option value="draft">Qaralama</option>
              <option value="closed">Bağlanıb</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-xs uppercase text-bh-gray-500 border-b border-bh-gray-200 dark:border-bh-black-700">
              <tr>
                <th className="py-3 px-4">PO Nömrəsi</th>
                <th className="py-3 px-4">Təchizatçı Şirkət</th>
                <th className="py-3 px-4">Təhvil Anbarı</th>
                <th className="py-3 px-4">Sifariş Tarixi</th>
                <th className="py-3 px-4">Gözlənilən Çatdırılma</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Məbləğ (Cəmi)</th>
                <th className="py-3 px-4 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-bh-gray-400">
                    Sifarişlər yüklənir...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-bh-gray-400">
                    Sifariş tapılmadı.
                  </td>
                </tr>
              ) : (
                orders.map((po) => (
                  <tr
                    key={po.id}
                    className="hover:bg-bh-gray-50/50 dark:hover:bg-bh-black-800/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-bh-black-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <PackagePlus className="w-3.5 h-3.5 text-bh-gray-400" />
                        <span>{po.poNumber}</span>
                        {po.isDemo && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-mono">
                            DEMO
                          </span>
                        )}
                      </div>
                      {po.linkedDocs.requestNumber && (
                        <div className="text-[10px] text-bh-gray-400 mt-0.5">
                          Tələb: {po.linkedDocs.requestNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-bh-black-900 dark:text-white">
                        {po.supplierName}
                      </div>
                      <div className="text-[11px] font-mono text-bh-gray-400">
                        VÖEN: {po.supplierTaxId}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-bh-gray-600 dark:text-bh-gray-300">
                      {po.deliveryWarehouseName}
                    </td>
                    <td className="py-3 px-4 text-bh-gray-500">{formatDate(po.orderDate)}</td>
                    <td className="py-3 px-4 font-medium text-bh-black-800 dark:text-bh-gray-200">
                      {formatDate(po.expectedDeliveryDate)}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(po.status)}</td>
                    <td className="py-3 px-4 text-right font-medium font-mono text-bh-black-900 dark:text-white">
                      {formatMoney(po.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/purchasing/orders/${po.id}`)}
                        className="h-7 text-xs gap-1"
                      >
                        Baxış <ArrowRight className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
