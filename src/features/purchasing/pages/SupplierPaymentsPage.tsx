import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  purchasingRepository,
  supplierRepository,
} from '../../../shared/adapters';
import {
  SupplierPayment,
  PayablesAgingBucket,
  SupplierInvoice,
} from '../types';
import { Supplier } from '../../suppliers/types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { Qapik, aznToQapik } from '../../../shared/utils/money';

export const SupplierPaymentsPage: React.FC = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'payments' | 'aging'>('payments');
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [agingBuckets, setAgingBuckets] = useState<PayablesAgingBucket[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<SupplierInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // New Payment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    supplierId: 'sup-1',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'bank_transfer' as 'bank_transfer' | 'cash' | 'check',
    bankAccountName: 'PAŞA Bank ASC (Əsas Hesab)',
    referenceNumber: '',
    amountAzn: 1000,
    notes: '',
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [pmtList, agingList, supList, invList] = await Promise.all([
        purchasingRepository.getSupplierPayments({ search }),
        purchasingRepository.getPayablesAging(),
        supplierRepository.getSuppliers(),
        purchasingRepository.getSupplierInvoices(),
      ]);
      setPayments(pmtList);
      setAgingBuckets(agingList);
      setSuppliers(supList.items);
      setUnpaidInvoices(invList.filter((i) => i.outstandingAmount > 0));
    } catch {
      toast({ title: 'Xəta', description: 'Məlumatları yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  // Handle Approve High Amount Payment
  const handleApprovePayment = async (id: string) => {
    try {
      await purchasingRepository.approveSupplierPayment(id);
      toast({ title: 'Təsdiqləndi', description: 'Yüksək məbləğli ödəniş rəhbərlik tərəfindən təsdiqləndi.' });
      loadData();
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.referenceNumber) {
      toast({ title: 'Xəta', description: 'Bank çıxarışı / Qəbz nömrəsi mütləqdir', variant: 'danger' });
      return;
    }

    try {
      const selectedSup = suppliers.find((s) => s.id === formData.supplierId);
      const totalAmountQapik = aznToQapik(formData.amountAzn);

      // Find open invoices for this supplier to allocate
      const supInvoices = unpaidInvoices.filter((i) => i.supplierId === formData.supplierId);
      let remainingToAllocate = totalAmountQapik;
      const allocations = [];

      for (const inv of supInvoices) {
        if (remainingToAllocate <= 0) break;
        const alloc = Math.min(remainingToAllocate, inv.outstandingAmount) as Qapik;
        allocations.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceTotal: inv.totalAmount,
          previouslyPaid: inv.paidAmount,
          allocatedAmount: alloc,
        });
        remainingToAllocate = (remainingToAllocate - alloc) as Qapik;
      }

      const created = await purchasingRepository.createSupplierPayment({
        supplierId: formData.supplierId,
        supplierName: selectedSup?.name || 'Baku Fashion Textile MMC',
        paymentDate: formData.paymentDate,
        paymentMethod: formData.paymentMethod,
        bankAccountName: formData.bankAccountName,
        referenceNumber: formData.referenceNumber,
        amount: totalAmountQapik,
        notes: formData.notes,
        allocations,
      });

      if (created.requiresHighAmountApproval) {
        toast({
          title: 'Təsdiq Gözləyir (> 10,000 ₼)',
          description: `Ödəniş #${created.paymentNumber} böyük məbləğli olduğuna görə rəhbərlik təsdiqinə göndərildi.`,
        });
      } else {
        toast({
          title: 'Ödəniş İcra Edildi',
          description: `Ödəniş #${created.paymentNumber} qeydə alındı və fakturalara bölüşdürüldü.`,
        });
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  // Calculate Aging Totals
  const agingTotals = agingBuckets.reduce(
    (acc, b) => {
      acc.current0To30 = (acc.current0To30 + b.current0To30) as Qapik;
      acc.days31To60 = (acc.days31To60 + b.days31To60) as Qapik;
      acc.days61To90 = (acc.days61To90 + b.days61To90) as Qapik;
      acc.days90Plus = (acc.days90Plus + b.days90Plus) as Qapik;
      acc.totalPayable = (acc.totalPayable + b.totalPayable) as Qapik;
      return acc;
    },
    {
      current0To30: 0 as Qapik,
      days31To60: 0 as Qapik,
      days61To90: 0 as Qapik,
      days90Plus: 0 as Qapik,
      totalPayable: 0 as Qapik,
    }
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Satınalma', href: '/purchasing/orders' },
          { label: 'Təchizatçı Ödənişləri və Yaşlanma' },
        ]}
      />

      <PageHeader
        title="Təchizatçı Ödənişləri və Yaşlanma Analizi"
        description="Fakturalara ödəniş bölüşdürülməsi, avanslar və kreditor borclarının yaşlanma qrupları (0–30, 31–60, 61–90, 90+ gün)."
        actions={
          <Button size="sm" onClick={() => setIsModalOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Yeni Ödəniş Qeydi
          </Button>
        }
      />

      {/* Tabs */}
      <div className="border-b border-bh-gray-200 dark:border-bh-black-700">
        <nav className="flex space-x-2">
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'payments'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'text-bh-gray-600 dark:text-bh-gray-400 hover:text-black'
            }`}
          >
            Ödənişlər Jurnalı ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('aging')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'aging'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'text-bh-gray-600 dark:text-bh-gray-400 hover:text-black'
            }`}
          >
            Kreditor Borclarının Yaşlanması (Payables Aging)
          </button>
        </nav>
      </div>

      {/* TAB 1: PAYMENTS */}
      {activeTab === 'payments' && (
        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-bh-gray-400" />
              <input
                type="text"
                placeholder="Ödəniş №, sənəd, təchizatçı..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-xs uppercase text-bh-gray-500 border-b">
                <tr>
                  <th className="py-3 px-4">Ödəniş №</th>
                  <th className="py-3 px-4">Təchizatçı</th>
                  <th className="py-3 px-4">Tarix</th>
                  <th className="py-3 px-4">Ödəniş Üsulu</th>
                  <th className="py-3 px-4">Bank / Hesab</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Məbləğ</th>
                  <th className="py-3 px-4 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-bh-gray-400">
                      Ödənişlər yüklənir...
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-bh-gray-400">
                      Ödəniş qeydi tapılmadı.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                  <tr key={p.id} className="hover:bg-bh-gray-50/50">
                    <td className="py-3 px-4 font-mono font-medium">{p.paymentNumber}</td>
                    <td className="py-3 px-4 font-medium">{p.supplierName}</td>
                    <td className="py-3 px-4">{formatDate(p.paymentDate)}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono bg-bh-gray-100 dark:bg-bh-black-700 px-1.5 py-0.5 rounded">
                        {p.paymentMethod.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-bh-gray-500">{p.bankAccountName || '-'}</td>
                    <td className="py-3 px-4">
                      {p.status === 'posted' ? (
                        <Badge variant="success">İcra Edilib</Badge>
                      ) : (
                        <Badge variant="warning" className="gap-1">
                          <Clock className="w-3 h-3" /> Təsdiq Gözləyir (&gt;10,000 ₼)
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-bh-black-900 dark:text-white">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {p.status === 'pending_approval' && (
                        <Button
                          size="sm"
                          onClick={() => handleApprovePayment(p.id)}
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Təsdiqlə
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: AGING BUCKETS VIEW */}
      {activeTab === 'aging' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">
              Kreditor Borclarının Yaşlanması Cədvəli (Payables Aging)
            </h3>
            <p className="text-xs text-bh-gray-500">
              Ödəniş müddəti keçmiş fakturaların gecikmə intervalları üzrə paylanması.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-3 px-4">Təchizatçı</th>
                  <th className="py-3 px-4">VÖEN</th>
                  <th className="py-3 px-4 text-right text-emerald-600">0–30 Gün</th>
                  <th className="py-3 px-4 text-right text-blue-600">31–60 Gün</th>
                  <th className="py-3 px-4 text-right text-amber-600">61–90 Gün</th>
                  <th className="py-3 px-4 text-right text-rose-600">90+ Gün (Kritik)</th>
                  <th className="py-3 px-4 text-right font-bold">Cəmi Borc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {agingBuckets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-bh-gray-400">
                      Ödənilməmiş borc qalığı yoxdur.
                    </td>
                  </tr>
                ) : (
                  agingBuckets.map((b) => (
                    <tr key={b.supplierId} className="hover:bg-bh-gray-50/50">
                      <td className="py-3 px-4 font-medium text-bh-black-900 dark:text-white">
                        {b.supplierName}
                      </td>
                      <td className="py-3 px-4 font-mono">{b.taxId}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {b.current0To30 > 0 ? formatMoney(b.current0To30) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {b.days31To60 > 0 ? formatMoney(b.days31To60) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {b.days61To90 > 0 ? formatMoney(b.days61To90) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                        {b.days90Plus > 0 ? formatMoney(b.days90Plus) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {formatMoney(b.totalPayable)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-bh-gray-100 dark:bg-bh-black-800 font-bold border-t">
                <tr>
                  <td colSpan={2} className="py-3 px-4">
                    Yekun Cəm (Konsolidasiya):
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-600">
                    {formatMoney(agingTotals.current0To30)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-blue-600">
                    {formatMoney(agingTotals.days31To60)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-600">
                    {formatMoney(agingTotals.days61To90)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-rose-600">
                    {formatMoney(agingTotals.days90Plus)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-base text-rose-700">
                    {formatMoney(agingTotals.totalPayable)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* MODAL: Record Payment */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Təchizatçı Ödənişi Qeydiyyatı"
      >
        <form onSubmit={handleSubmitPayment} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Təchizatçı Şirkət *</label>
            <select
              value={formData.supplierId}
              onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
              className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Qalıq Borc: {formatMoney(s.payableBalance)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Ödəniş Məbləği (AZN) *</label>
              <input
                type="number"
                step="0.01"
                min={1}
                required
                value={formData.amountAzn}
                onChange={(e) => setFormData({ ...formData, amountAzn: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900 font-mono text-sm"
              />
              {formData.amountAzn > 10000 && (
                <span className="text-[11px] text-amber-600 font-medium block mt-1">
                  &gt; 10,000 ₼ ödənişlər rəhbərlik təsdiqinə göndəriləcək!
                </span>
              )}
            </div>

            <div>
              <label className="block font-medium mb-1">Ödəniş Tarixi *</label>
              <input
                type="date"
                required
                value={formData.paymentDate}
                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Ödəniş Üsulu</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as 'bank_transfer' | 'cash' | 'check' })}
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
              >
                <option value="bank_transfer">Bank Köçürməsi</option>
                <option value="cash">Kassa Nağd</option>
                <option value="check">Çek</option>
              </select>
            </div>

            <div>
              <label className="block font-medium mb-1">Bank / Kassa Hesabı</label>
              <input
                type="text"
                value={formData.bankAccountName}
                onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Bank Çıxarışı / Qəbz Nömrəsi (Ref) *</label>
            <input
              type="text"
              required
              placeholder="məs. PP-2026-9912 və ya Bank Əməliyyat №"
              value={formData.referenceNumber}
              onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
              className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900 font-mono"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Qeyd</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Ləğv et
            </Button>
            <Button type="submit" size="sm">
              Ödənişi Qeyd Et
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
