import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { TransferPrintModal } from '../components/TransferPrintModal';
import { transferRepository, inventoryRepository } from '../../../shared/adapters';
import { Transfer, TransferStatus } from '../types';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { formatDateTime } from '../../../shared/utils/formatters';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Printer,
  ArrowRight,
  Eye,
} from 'lucide-react';

export const TransfersListPage: React.FC = () => {
  const navigate = useNavigate();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<TransferStatus | 'all'>('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [selectedDestination, setSelectedDestination] = useState('all');

  // Print modal state
  const [printTransfer, setPrintTransfer] = useState<Transfer | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [whList, list] = await Promise.all([
        inventoryRepository.getWarehouses(),
        transferRepository.getTransfers({
          search,
          status: selectedStatus,
          sourceWarehouseId: selectedSource,
          destinationWarehouseId: selectedDestination,
        }),
      ]);
      setWarehouses(whList);
      setTransfers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedStatus, selectedSource, selectedDestination]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenPrint = (t: Transfer) => {
    setPrintTransfer(t);
    setIsPrintModalOpen(true);
  };

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case 'draft':
        return <Badge variant="neutral" size="sm">Qaralama</Badge>;
      case 'submitted':
        return <Badge variant="warning" size="sm">Təsdiq Gözləyir</Badge>;
      case 'approved':
        return <Badge variant="default" size="sm">Təsdiqləndi</Badge>;
      case 'picking':
        return <Badge variant="warning" size="sm">Yığımda</Badge>;
      case 'dispatched':
      case 'in_transit':
        return <Badge variant="default" size="sm" className="bg-blue-600 text-white">Yoldadır (Tranzit)</Badge>;
      case 'partially_received':
        return <Badge variant="warning" size="sm">Qismən Qəbul</Badge>;
      case 'received':
        return <Badge variant="success" size="sm">Tam Qəbul Edildi</Badge>;
      case 'rejected':
        return <Badge variant="danger" size="sm">İmtina Edildi</Badge>;
      case 'cancelled':
        return <Badge variant="neutral" size="sm">Ləğv Edildi</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Əməliyyatlar', href: '/transfers' },
          { label: 'Filiallararası Transferlər' },
        ]}
      />

      <PageHeader
        title="Filiallararası Transferlər"
        description="Filiallar və anbarlar arasında malların sifarişi, təsdiqi, yığımı, yolasalınması və təyinatda qəbulu."
        actions={
          <Button variant="default" size="sm" onClick={() => navigate('/transfers/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Transfer Sorğusu
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card className="p-3.5 bg-card border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Transfer №, anbar və ya təşəbbüskar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            value={selectedStatus}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedStatus(e.target.value as TransferStatus | 'all')}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Statuslar</option>
            <option value="draft">Qaralama</option>
            <option value="submitted">Təsdiq Gözləyir</option>
            <option value="approved">Təsdiqləndi</option>
            <option value="picking">Yığımda</option>
            <option value="dispatched">Yoldadır (Tranzitdə)</option>
            <option value="partially_received">Qismən Qəbul Edildi</option>
            <option value="received">Tam Qəbul Edildi</option>
            <option value="rejected">İmtina Edildi</option>
            <option value="cancelled">Ləğv Edildi</option>
          </select>

          <select
            value={selectedSource}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSource(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Mənbə Anbarlar</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <select
            value={selectedDestination}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDestination(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Təyinat Anbarlar</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Transfers List Table */}
      <Card className="overflow-hidden border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-muted/70 border-b border-border text-muted-foreground font-semibold">
                <th className="py-3 px-3">Transfer №</th>
                <th className="py-3 px-3">Mənbə Anbar</th>
                <th className="py-3 px-1 text-center"></th>
                <th className="py-3 px-3">Təyinat Anbar</th>
                <th className="py-3 px-3">Tarix</th>
                <th className="py-3 px-2 text-center">Çeşid (SKU)</th>
                <th className="py-3 px-2 text-center">Cəmi Miqdar</th>
                <th className="py-3 px-3">Təşəbbüskar</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    Transferlər yüklənir...
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    Filtrə uyğun heç bir transfer tapılmadı.
                  </td>
                </tr>
              ) : (
                transfers.map((t) => {
                  const totalUnits = t.items.reduce(
                    (sum, i) => sum + (i.dispatchedQty || i.requestedQty),
                    0
                  );

                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                        {t.transferNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">{t.sourceWarehouseName}</div>
                        <div className="text-[10px] text-muted-foreground">{t.sourceBranchName}</div>
                      </td>
                      <td className="py-2.5 px-1 text-center text-muted-foreground">
                        <ArrowRight className="h-3 w-3 inline" />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">{t.destinationWarehouseName}</div>
                        <div className="text-[10px] text-muted-foreground">{t.destinationBranchName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                        {formatDateTime(t.createdAt)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-medium">
                        {t.items.length} SKU
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-foreground">
                        {totalUnits} ədəd
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {t.createdByName}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {getStatusBadge(t.status)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            title="Qaimə Çap Et"
                            onClick={() => handleOpenPrint(t)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-2.5 text-[11px]"
                            onClick={() => navigate(`/transfers/${t.id}`)}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Detallar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Print Waybill Modal */}
      <TransferPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        transfer={printTransfer}
      />
    </div>
  );
};
