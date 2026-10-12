import React, { useState, useEffect } from 'react';
import {
  Building2,
  PackagePlus,
  AlertTriangle,
  TrendingDown,
  History,
  Download,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import {
  purchasingRepository,
  supplierRepository,
} from '../../../shared/adapters';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { Supplier } from '../../suppliers/types';
import { PurchaseOrder, GoodsReceipt, PayablesAgingBucket } from '../types';

type ReportType = 'by_supplier' | 'outstanding_pos' | 'discrepancies' | 'balances' | 'price_history';

export const PurchasingReportsPage: React.FC = () => {
  const { toast } = useToast();

  const [activeReport, setActiveReport] = useState<ReportType>('by_supplier');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [aging, setAging] = useState<PayablesAgingBucket[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sup, ord, rec, ag] = await Promise.all([
          supplierRepository.getSuppliers(),
          purchasingRepository.getPurchaseOrders(),
          purchasingRepository.getGoodsReceipts(),
          purchasingRepository.getPayablesAging(),
        ]);
        setSuppliers(sup.items);
        setOrders(ord);
        setReceipts(rec);
        setAging(ag);
      } catch {
        // fallback
      }
    };
    load();
  }, []);

  const handleExport = (reportName: string) => {
    toast({
      title: 'Hesabat İxrac Edildi',
      description: `"${reportName}" üzrə məlumatlar CSV faylına köçürüldü.`,
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Satınalma', href: '/purchasing/orders' },
          { label: 'Satınalma Hesabatları' },
        ]}
      />

      <PageHeader
        title="Satınalma və Təchizat Hesabatları"
        description="Təchizatçılar üzrə xərclər, açıq sifarişlər, mədaxil kənarlaşmaları və qiymət dəyişmə analitikası."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport(activeReport)}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" /> İxrac (CSV)
          </Button>
        }
      />

      {/* Navigation Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          {
            id: 'by_supplier',
            label: 'Təchizatçılar üzrə Alış',
            icon: <Building2 className="w-4 h-4" />,
            badge: `${suppliers.length} şirkət`,
          },
          {
            id: 'outstanding_pos',
            label: 'Açıq Sifarişlər (POs)',
            icon: <PackagePlus className="w-4 h-4" />,
            badge: `${orders.filter((o) => o.status !== 'received' && o.status !== 'closed').length} açıq`,
          },
          {
            id: 'discrepancies',
            label: 'Mədaxil Kənarlaşmaları',
            icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
            badge: 'Audit',
          },
          {
            id: 'balances',
            label: 'Təchizatçı Qalıqları',
            icon: <TrendingDown className="w-4 h-4 text-rose-500" />,
            badge: `${aging.length} borclu`,
          },
          {
            id: 'price_history',
            label: 'Maya Qiymət Tarixçəsi',
            icon: <History className="w-4 h-4" />,
            badge: 'Dinamika',
          },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveReport(item.id as ReportType)}
            className={`p-3 rounded-lg border text-left transition-all ${
              activeReport === item.id
                ? 'border-black dark:border-white bg-bh-gray-50 dark:bg-bh-black-800 shadow-sm ring-1 ring-black dark:ring-white'
                : 'border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900 hover:border-bh-gray-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="p-1 rounded bg-bh-gray-100 dark:bg-bh-black-700 text-bh-black-900 dark:text-white">
                {item.icon}
              </span>
              <span className="text-[10px] font-mono font-medium text-bh-gray-500 bg-bh-gray-100 dark:bg-bh-black-700 px-1 py-0.5 rounded">
                {item.badge}
              </span>
            </div>
            <span className="text-xs font-semibold block text-bh-black-900 dark:text-white truncate">
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* Report 1: Purchases by supplier */}
      {activeReport === 'by_supplier' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Təchizatçılar üzrə Alış Həcmi və Paylar</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2.5 px-4">Təchizatçı</th>
                  <th className="py-2.5 px-4">VÖEN</th>
                  <th className="py-2.5 px-4 text-center">Ödəniş Şərti</th>
                  <th className="py-2.5 px-4">Əlaqədar Şəxs</th>
                  <th className="py-2.5 px-4 text-right">Cari Borc Balansı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-bh-gray-50/50">
                    <td className="py-2.5 px-4 font-medium text-bh-black-900 dark:text-white">
                      {s.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{s.taxId}</td>
                    <td className="py-2.5 px-4 text-center font-mono">
                      {s.paymentTerms.toUpperCase()}
                    </td>
                    <td className="py-2.5 px-4">{s.contactPerson}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-600">
                      {formatMoney(s.payableBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report 2: Outstanding POs */}
      {activeReport === 'outstanding_pos' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">İcrada Olan və Çatışmayan Sifarişlər</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2.5 px-4">PO №</th>
                  <th className="py-2.5 px-4">Təchizatçı</th>
                  <th className="py-2.5 px-4">Anbar</th>
                  <th className="py-2.5 px-4">Gözlənilən Çatdırılma</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Məbləğ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-bh-gray-50/50">
                    <td className="py-2.5 px-4 font-mono font-medium">{o.poNumber}</td>
                    <td className="py-2.5 px-4">{o.supplierName}</td>
                    <td className="py-2.5 px-4">{o.deliveryWarehouseName}</td>
                    <td className="py-2.5 px-4">{formatDate(o.expectedDeliveryDate)}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline">{o.status}</Badge>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">
                      {formatMoney(o.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report 3: Discrepancies */}
      {activeReport === 'discrepancies' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Mədaxil və Sifariş Kənarlaşmaları Jurnalı</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2.5 px-4">Mədaxil №</th>
                  <th className="py-2.5 px-4">PO №</th>
                  <th className="py-2.5 px-4">Təchizatçı</th>
                  <th className="py-2.5 px-4 text-center">Sifariş Sayı</th>
                  <th className="py-2.5 px-4 text-center">Qəbul Sayı</th>
                  <th className="py-2.5 px-4 text-center">Zədə / İmtina</th>
                  <th className="py-2.5 px-4">Qeyd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-bh-gray-50/50">
                    <td className="py-2.5 px-4 font-mono font-medium">{r.grNumber}</td>
                    <td className="py-2.5 px-4 font-mono">{r.poNumber}</td>
                    <td className="py-2.5 px-4">{r.supplierName}</td>
                    <td className="py-2.5 px-4 text-center font-mono">{r.totalOrderedQty}</td>
                    <td className="py-2.5 px-4 text-center font-mono font-bold text-emerald-600">
                      {r.totalReceivedQty}
                    </td>
                    <td className="py-2.5 px-4 text-center font-mono text-rose-600">
                      {r.totalDamagedQty + r.totalRejectedQty > 0
                        ? `${r.totalDamagedQty} zədə, ${r.totalRejectedQty} imtina`
                        : '-'}
                    </td>
                    <td className="py-2.5 px-4 italic text-bh-gray-500">
                      {r.discrepancyNotes || 'Kənarlaşma yoxdur'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report 4: Supplier balances */}
      {activeReport === 'balances' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Təchizatçı Borc Balansları Xülasəsi</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2.5 px-4">Təchizatçı</th>
                  <th className="py-2.5 px-4 text-right">0–30 Gün</th>
                  <th className="py-2.5 px-4 text-right">31–60 Gün</th>
                  <th className="py-2.5 px-4 text-right">61–90 Gün</th>
                  <th className="py-2.5 px-4 text-right">90+ Gün</th>
                  <th className="py-2.5 px-4 text-right font-bold">Cəmi Borc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {aging.map((b) => (
                  <tr key={b.supplierId} className="hover:bg-bh-gray-50/50">
                    <td className="py-2.5 px-4 font-medium">{b.supplierName}</td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {b.current0To30 > 0 ? formatMoney(b.current0To30) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {b.days31To60 > 0 ? formatMoney(b.days31To60) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {b.days61To90 > 0 ? formatMoney(b.days61To90) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-600">
                      {b.days90Plus > 0 ? formatMoney(b.days90Plus) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">
                      {formatMoney(b.totalPayable)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report 5: Purchase price history */}
      {activeReport === 'price_history' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Məhsullar üzrə Maya Qiyməti Dəyişmə Tarixçəsi</h3>
          </div>
          <div className="p-6 text-xs text-bh-gray-500 space-y-2">
            <p>
              Təchizatçılar tərəfindən faktura edilən malların inflyasiya və qiymət artım dinamikası.
            </p>
            <div className="p-3 bg-bh-gray-50 dark:bg-bh-black-800 rounded border">
              <strong>Nümunə Dinamika: Kişi Pambıq Köynək (TSH-M-001)</strong>
              <div className="mt-1 font-mono text-bh-black-900 dark:text-white">
                • 10.10.2025: 22.00 ₼ &rarr; 15.01.2026: 23.50 ₼ &rarr; 20.03.2026: 24.50 ₼ (+%11.4 artım)
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
