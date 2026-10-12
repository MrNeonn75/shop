import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Building,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import { financeRepository, purchasingRepository } from '../../../shared/adapters';
import {
  CustomerReceivable,
  AgingBucketSummary,
  PaymentRecord,
} from '../types';
import { PayablesAgingBucket } from '../../purchasing/types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { aznToQapik } from '../../../shared/utils/money';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';

export const PayablesReceivablesPage: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'receivables' | 'payables' | 'payments'>('receivables');

  // Receivables Data
  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [recAging, setRecAging] = useState<AgingBucketSummary | null>(null);

  // Payables Aging Data (from F8 purchasing)
  const [payAging, setPayAging] = useState<PayablesAgingBucket[]>([]);

  // Payment Records
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Collect Payment Modal
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [targetReceivable, setTargetReceivable] = useState<CustomerReceivable | null>(null);
  const [collectAmountAzn, setCollectAmountAzn] = useState('');
  const [collectNotes, setCollectNotes] = useState('');

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [recList, rAging, pList, payBuckets] = await Promise.all([
        financeRepository.getCustomerReceivables(),
        financeRepository.getReceivablesAging(),
        financeRepository.getPayments(),
        purchasingRepository.getPayablesAging(),
      ]);

      setReceivables(recList);
      setRecAging(rAging);
      setPayments(pList);
      setPayAging(payBuckets);
    } catch (err) {
      toast({
        title: 'Məlumat yüklənmədi',
        description: err instanceof Error ? err.message : 'Borc məlumatları yüklənərkən xəta baş verdi.',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleOpenCollect = (rec: CustomerReceivable) => {
    setTargetReceivable(rec);
    setCollectAmountAzn((Number(rec.remainingAmountQapik) / 100).toFixed(2));
    setCollectNotes(`İnvoys ${rec.invoiceNumber} üzrə korporativ ödəniş`);
    setIsCollectModalOpen(true);
  };

  const handleConfirmCollection = async () => {
    if (!targetReceivable) return;
    const amountQapik = aznToQapik(collectAmountAzn);
    if (amountQapik <= 0) {
      toast({ title: 'Xəta', description: 'Məbləğ 0-dan böyük olmalıdır.', variant: 'danger' });
      return;
    }

    try {
      await financeRepository.recordPayment({
        type: 'customer_collection',
        counterpartyId: targetReceivable.customerVoenOrId,
        counterpartyName: targetReceivable.customerName,
        date: new Date().toISOString().slice(0, 10),
        amountQapik,
        allocations: [
          {
            invoiceId: targetReceivable.id,
            invoiceNumber: targetReceivable.invoiceNumber,
            allocatedAmountQapik: amountQapik,
          },
        ],
        referenceNotes: collectNotes,
      });

      toast({
        title: 'Ödəniş Qeydə Alındı',
        description: `${targetReceivable.customerName} üzrə debitor borc yığımı bağlandı.`,
        variant: 'success',
      });

      setIsCollectModalOpen(false);
      await loadData();
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Ödəniş qeydə alınmadı.',
        variant: 'danger',
      });
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
            Debitor və Kreditor Borcları (A/R & A/P)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Müştəri nisyə satışları, təchizatçı öhdəlikləri, borcların yaşlanma analitikası və ödəniş jurnalı
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link to="/purchasing/payments">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-4 w-4" />
              Təchizatçı Ödənişləri (F8)
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveTab('receivables')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'receivables'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="h-4 w-4" />
          Müştəri Debitor Borcları ({receivables.length})
        </button>
        <button
          onClick={() => setActiveTab('payables')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'payables'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building className="h-4 w-4" />
          Təchizatçı Kreditor Borcları (Aging)
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'payments'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          Ödəniş Qeydləri & Bölgü Jurnalı ({payments.length})
        </button>
      </div>

      {/* Tab 1: Customer Receivables */}
      {activeTab === 'receivables' && (
        <div className="space-y-6">
          {/* Aging Buckets Summary Cards */}
          {recAging && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="p-3.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Cəmi Debitor</span>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatMoney(recAging.totalQapik)}
                </div>
              </Card>
              <Card className="p-3.5">
                <span className="text-[11px] font-semibold text-emerald-600 uppercase">0–30 Gün (Cari)</span>
                <div className="text-lg font-bold font-mono text-emerald-600 mt-1">
                  {formatMoney(recAging.days0To30Qapik)}
                </div>
              </Card>
              <Card className="p-3.5">
                <span className="text-[11px] font-semibold text-blue-600 uppercase">31–60 Gün</span>
                <div className="text-lg font-bold font-mono text-blue-600 mt-1">
                  {formatMoney(recAging.days31To60Qapik)}
                </div>
              </Card>
              <Card className="p-3.5">
                <span className="text-[11px] font-semibold text-amber-600 uppercase">61–90 Gün</span>
                <div className="text-lg font-bold font-mono text-amber-600 mt-1">
                  {formatMoney(recAging.days61To90Qapik)}
                </div>
              </Card>
              <Card className="p-3.5">
                <span className="text-[11px] font-semibold text-rose-600 uppercase">90+ Gün (Riskli)</span>
                <div className="text-lg font-bold font-mono text-rose-600 mt-1">
                  {formatMoney(recAging.days90PlusQapik)}
                </div>
              </Card>
            </div>
          )}

          {/* Receivables Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Müştəri Adı</th>
                    <th className="px-4 py-3">VÖEN</th>
                    <th className="px-4 py-3">İnvoys №</th>
                    <th className="px-4 py-3">Tarix & Son Gün</th>
                    <th className="px-4 py-3 text-right">Ümumi Məbləğ</th>
                    <th className="px-4 py-3 text-right">Ödənilib</th>
                    <th className="px-4 py-3 text-right">Qalıq Borc</th>
                    <th className="px-4 py-3 text-center">Gecikmə</th>
                    <th className="px-4 py-3 text-center">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {receivables.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {r.customerName}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {r.customerVoenOrId}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {r.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <div>İnv: {formatDate(r.invoiceDate)}</div>
                        <div className="text-[11px] text-slate-400">Son: {formatDate(r.dueDate)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {formatMoney(r.totalAmountQapik)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {formatMoney(r.paidAmountQapik)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(r.remainingAmountQapik)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.daysOverdue > 0 ? (
                          <Badge variant="danger" className="text-[10px]">
                            {r.daysOverdue} gün gecikir
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px]">
                            Cari
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.remainingAmountQapik > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenCollect(r)}
                            className="h-7 px-2 text-xs"
                          >
                            Ödəniş Qəbul Et
                          </Button>
                        ) : (
                          <span className="text-emerald-600 font-medium text-xs">Bağlandı</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Supplier Payables (Aging View from F8) */}
      {activeTab === 'payables' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase">0–30 Gün (Cari)</span>
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {formatMoney(payAging.reduce((s, p) => s + Number(p.current0To30), 0))}
              </div>
            </Card>
            <Card className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase">31–60 Gün</span>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                {formatMoney(payAging.reduce((s, p) => s + Number(p.days31To60), 0))}
              </div>
            </Card>
            <Card className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase">61–90 Gün</span>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {formatMoney(payAging.reduce((s, p) => s + Number(p.days61To90), 0))}
              </div>
            </Card>
            <Card className="p-4">
              <span className="text-xs font-semibold text-rose-600 uppercase">90+ Gün (Riskli)</span>
              <div className="text-xl font-bold font-mono text-rose-600 mt-1">
                {formatMoney(payAging.reduce((s, p) => s + Number(p.days90Plus), 0))}
              </div>
            </Card>
          </div>

          {/* Supplier Payables Detail Table */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                Təchizatçı Öhdəlikləri və Yaşlanma Analitikası
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Təchizatçı Adı</th>
                    <th className="px-4 py-3">VÖEN</th>
                    <th className="px-4 py-3 text-right">0–30 Gün</th>
                    <th className="px-4 py-3 text-right">31–60 Gün</th>
                    <th className="px-4 py-3 text-right">61–90 Gün</th>
                    <th className="px-4 py-3 text-right">90+ Gün</th>
                    <th className="px-4 py-3 text-right">Cəmi Öhdəlik</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {payAging.map((bucket) => (
                    <tr key={bucket.supplierId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {bucket.supplierName}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{bucket.taxId}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {formatMoney(bucket.current0To30)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {formatMoney(bucket.days31To60)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-600 dark:text-amber-400">
                        {formatMoney(bucket.days61To90)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-rose-600 dark:text-rose-400 font-semibold">
                        {formatMoney(bucket.days90Plus)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(bucket.totalPayable)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-6 text-center space-y-3">
            <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100">
              Təchizatçı Fakturaları və 3-Way Match Detalları
            </h3>
            <p className="text-xs text-slate-500 max-w-xl mx-auto">
              Satınalma sifarişləri (PO), qəbul aktları (GR) və təchizatçı invoysları üzrə ətraflı faktura balansı və ödəniş bölüşdürülməsi F8 Satınalma modulunda idarə olunur.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Link to="/purchasing/invoices">
                <Button variant="outline" size="sm" className="gap-1.5">
                  Təchizatçı Fakturaları &rarr;
                </Button>
              </Link>
              <Link to="/purchasing/payments">
                <Button size="sm" className="gap-1.5">
                  Kreditor Ödənişləri &rarr;
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Payment Records */}
      {activeTab === 'payments' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Ödəniş №</th>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Növ</th>
                  <th className="px-4 py-3">Kontragent</th>
                  <th className="px-4 py-3">Hesab</th>
                  <th className="px-4 py-3 text-right">Məbləğ</th>
                  <th className="px-4 py-3">Faktura Bölgüsü</th>
                  <th className="px-4 py-3">İcraçı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {payments.map((p) => {
                  const isIncoming = p.type === 'customer_collection';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {p.paymentNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(p.date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={isIncoming ? 'default' : 'outline'} className="capitalize text-[10px]">
                          {isIncoming ? 'Müştəri Yığımı' : 'Təchizatçı Ödənişi'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {p.counterpartyName}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {p.accountName}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          isIncoming
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatMoney(p.amountQapik)}
                      </td>
                      <td className="px-4 py-3">
                        {p.allocations.length > 0 ? (
                          <div className="space-y-0.5">
                            {p.allocations.map((a, idx) => (
                              <div key={idx} className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                {a.invoiceNumber}: {formatMoney(a.allocatedAmountQapik)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Avans (Bölgüsüz)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {p.performedBy}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Collect Payment Modal */}
      {targetReceivable && (
        <Modal
          isOpen={isCollectModalOpen}
          onClose={() => setIsCollectModalOpen(false)}
          title={`Debitor Ödənişinin Qəbulu — ${targetReceivable.customerName}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 text-xs border border-slate-200 dark:border-slate-800 space-y-1">
              <div>İnvoys: <strong className="font-mono">{targetReceivable.invoiceNumber}</strong></div>
              <div>Cari Qalıq Borc: <strong className="font-mono text-blue-600">{formatMoney(targetReceivable.remainingAmountQapik)}</strong></div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Daxil Olan Məbləğ (₼ AZN)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={collectAmountAzn}
                onChange={(e) => setCollectAmountAzn(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Qeyd / Bank Sənədi İstinadı
              </label>
              <input
                type="text"
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsCollectModalOpen(false)}>
                İmtina
              </Button>
              <Button onClick={handleConfirmCollection}>
                Ödənişi Qeydə Al və Borcu Bağla
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
