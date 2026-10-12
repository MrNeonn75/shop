import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Plus,
  Search,
  ArrowRight,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { purchasingRepository } from '../../../shared/adapters';
import { GoodsReceipt } from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';

export const GoodsReceiptPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadReceipts = async () => {
    setIsLoading(true);
    try {
      const data = await purchasingRepository.getGoodsReceipts({ search });
      setReceipts(data);
    } catch {
      toast({ title: 'Xəta', description: 'Qəbul aktlarını yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, [search]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Satınalma', href: '/purchasing/orders' },
          { label: 'Malların Mədaxili (Goods Receipt)' },
        ]}
      />

      <PageHeader
        title="Malların Mədaxili və Təhvil-Təslim (GR)"
        description="Satınalma sifarişləri üzrə faktiki anbar qəbulları, sayım kənarlaşmaları və zədə aktları."
        actions={
          <Button
            size="sm"
            onClick={() => navigate('/purchasing/goods-receipts/new')}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> Yeni Mədaxil Aktı
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-bh-gray-400" />
            <input
              type="text"
              placeholder="Mədaxil №, PO №, təchizatçı..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-xs uppercase text-bh-gray-500 border-b border-bh-gray-200 dark:border-bh-black-700">
              <tr>
                <th className="py-3 px-4">Mədaxil №</th>
                <th className="py-3 px-4">PO Nömrəsi</th>
                <th className="py-3 px-4">Təchizatçı</th>
                <th className="py-3 px-4">Anbar</th>
                <th className="py-3 px-4">Qəbul Tarixi</th>
                <th className="py-3 px-4 text-center">Təhvil Sayı</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Məbləğ</th>
                <th className="py-3 px-4 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-bh-gray-400">
                    Yüklənir...
                  </td>
                </tr>
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-bh-gray-400">
                    Mədaxil sənədi tapılmadı.
                  </td>
                </tr>
              ) : (
                receipts.map((gr) => (
                  <tr
                    key={gr.id}
                    className="hover:bg-bh-gray-50/50 dark:hover:bg-bh-black-800/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-bh-black-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-bh-gray-400" />
                        <span>{gr.grNumber}</span>
                        {gr.isDemo && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-mono">
                            DEMO
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-bh-gray-400">{gr.receivedByName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-blue-600 font-medium">
                      {gr.poNumber}
                    </td>
                    <td className="py-3 px-4">{gr.supplierName}</td>
                    <td className="py-3 px-4 text-bh-gray-500">{gr.warehouseName}</td>
                    <td className="py-3 px-4">{formatDate(gr.receivedDate)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-mono font-bold text-emerald-600">
                        {gr.totalReceivedQty}
                      </span>{' '}
                      / {gr.totalOrderedQty}
                      {(gr.totalDamagedQty > 0 || gr.totalRejectedQty > 0) && (
                        <div className="text-[10px] text-rose-500 font-medium">
                          Zədə: {gr.totalDamagedQty} | İmtina: {gr.totalRejectedQty}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={gr.status === 'confirmed' ? 'success' : 'outline'}>
                        {gr.status === 'confirmed' ? 'Təsdiqlənib (Mədaxil)' : 'Qaralama'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-medium font-mono text-bh-black-900 dark:text-white">
                      {formatMoney(gr.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/purchasing/goods-receipts/${gr.id}`)}
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
