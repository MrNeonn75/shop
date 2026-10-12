import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  purchasingRepository,
  supplierRepository,
} from '../../../shared/adapters';
import {
  SupplierInvoice,
  SupplierInvoiceStatus,
  PurchaseReturn,
  CreditNote,
} from '../types';
import { Supplier } from '../../suppliers/types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { Qapik, aznToQapik } from '../../../shared/utils/money';

export const SupplierInvoicesPage: React.FC = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'invoices' | 'matching' | 'returns'>('invoices');
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Selected invoice for 3-way match inspection
  const [selectedInvoiceForMatch, setSelectedInvoiceForMatch] = useState<SupplierInvoice | null>(null);

  // New Invoice Modal
  const [isNewInvoiceModalOpen, setIsNewInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    supplierId: 'sup-1',
    supplierInvoiceRef: '',
    poNumber: 'PO-2026-0001',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    lines: [
      {
        id: 'inv-line-1',
        productId: 'prod-1',
        productName: 'Kişi Pambıq Köynək (Klassik)',
        sku: 'TSH-M-001',
        size: 'L',
        color: 'Ağ',
        invoicedQty: 60,
        unitCost: 2450 as Qapik,
        taxRatePercent: 18,
        lineTotal: 147000 as Qapik,
      },
    ],
  });

  // Return Modal
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({
    supplierId: 'sup-1',
    invoiceId: 'inv-1',
    reason: '',
    returnQty: 2,
    unitCost: 2450 as Qapik,
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [invList, retList, cnList, supList] = await Promise.all([
        purchasingRepository.getSupplierInvoices({ search }),
        purchasingRepository.getPurchaseReturns(),
        purchasingRepository.getCreditNotes(),
        supplierRepository.getSuppliers(),
      ]);
      setInvoices(invList);
      setReturns(retList);
      setCreditNotes(cnList);
      setSuppliers(supList.items);

      if (invList.length > 0 && !selectedInvoiceForMatch) {
        setSelectedInvoiceForMatch(invList[0]);
      }
    } catch {
      toast({ title: 'Xəta', description: 'Fakturaları yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  // Handle Match Status update (Approve for payment / Hold / Dispute)
  const handleUpdateMatchStatus = async (
    invId: string,
    status: SupplierInvoiceStatus,
    resolutionNote?: string
  ) => {
    try {
      await purchasingRepository.updateSupplierInvoiceStatus(invId, status, resolutionNote);
      toast({
        title: 'Status Yeniləndi',
        description: `Faktura statusu "${status}" olaraq dəyişdirildi.`,
      });
      loadData();
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  // Register New Invoice
  const handleRegisterInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.supplierInvoiceRef) {
      toast({ title: 'Xəta', description: 'Təchizatçının faktura seriya nömrəsini daxil edin', variant: 'danger' });
      return;
    }

    try {
      const selectedSup = suppliers.find((s) => s.id === invoiceForm.supplierId);
      const created = await purchasingRepository.createSupplierInvoice({
        supplierId: invoiceForm.supplierId,
        supplierName: selectedSup?.name || 'Baku Fashion Textile MMC',
        supplierTaxId: selectedSup?.taxId || '1401234567',
        supplierInvoiceRef: invoiceForm.supplierInvoiceRef,
        poNumber: invoiceForm.poNumber,
        invoiceDate: invoiceForm.invoiceDate,
        dueDate: invoiceForm.dueDate,
        lines: invoiceForm.lines,
      });

      toast({
        title: 'Faktura Qeydiyyata Alındı',
        description: `Faktura #${created.invoiceNumber} sistemə daxil edildi və 3-tərəfli uyğunlaşma icra olundu.`,
      });
      setIsNewInvoiceModalOpen(false);
      loadData();
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  // Submit Purchase Return
  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const totalAmount = (returnForm.returnQty * returnForm.unitCost) as Qapik;
      const selectedSup = suppliers.find((s) => s.id === returnForm.supplierId);

      await purchasingRepository.createPurchaseReturn({
        supplierId: returnForm.supplierId,
        supplierName: selectedSup?.name || 'Baku Fashion Textile MMC',
        invoiceId: returnForm.invoiceId,
        reason: returnForm.reason,
        totalAmount,
        items: [
          {
            productId: 'prod-1',
            productName: 'Kişi Pambıq Köynək (Klassik)',
            sku: 'TSH-M-001',
            size: 'L',
            color: 'Ağ',
            returnQty: returnForm.returnQty,
            unitCost: returnForm.unitCost,
            totalAmount,
          },
        ],
      });

      toast({
        title: 'Qaytarılma Rəsmiləşdirildi',
        description: 'Anbar qalığı azaldıldı və kredit qeydi (Credit Note) formalaşdırıldı.',
      });
      setIsReturnModalOpen(false);
      loadData();
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  const getInvoiceStatusBadge = (st: SupplierInvoiceStatus) => {
    switch (st) {
      case 'approved_for_payment':
        return <Badge variant="success">Ödənişə Təsdiqlənib</Badge>;
      case 'mismatch_hold':
        return <Badge variant="warning">Kənarlaşma (Hold)</Badge>;
      case 'disputed':
        return <Badge variant="danger">Mübahisəli (Disputed)</Badge>;
      case 'paid':
        return <Badge variant="success">Tam Ödənilib</Badge>;
      case 'partially_paid':
        return <Badge variant="warning">Qismən Ödənilib</Badge>;
      default:
        return <Badge variant="outline">{st}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Satınalma', href: '/purchasing/orders' },
          { label: 'Hesab-Fakturalar və Üçtərəfli Uyğunlaşma' },
        ]}
      />

      <PageHeader
        title="Təchizatçı Hesab-Fakturaları (Invoices)"
        description="Fakturaların qeydiyyatı, PO vs Qəbul vs Faktura üçtərəfli uyğunlaşması (Three-Way Match) və kredit qeydləri."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReturnModalOpen(true)}
              className="gap-1.5 text-rose-600 border-rose-300 hover:bg-rose-50"
            >
              <RotateCcw className="w-4 h-4" /> Mala Qaytarılma Aç
            </Button>
            <Button
              size="sm"
              onClick={() => setIsNewInvoiceModalOpen(true)}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" /> Faktura Qeydiyyatı
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="border-b border-bh-gray-200 dark:border-bh-black-700">
        <nav className="flex space-x-2">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'invoices'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'text-bh-gray-600 dark:text-bh-gray-400 hover:text-black'
            }`}
          >
            Fakturalar ({invoices.length})
          </button>
          <button
            onClick={() => {
              if (!selectedInvoiceForMatch && invoices.length > 0) {
                setSelectedInvoiceForMatch(invoices[0]);
              }
              setActiveTab('matching');
            }}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'matching'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'text-bh-gray-600 dark:text-bh-gray-400 hover:text-black'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Üçtərəfli Uyğunlaşma Paneli
          </button>
          <button
            onClick={() => setActiveTab('returns')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'returns'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'text-bh-gray-600 dark:text-bh-gray-400 hover:text-black'
            }`}
          >
            Qaytarılmalar və Kredit Qeydləri ({creditNotes.length})
          </button>
        </nav>
      </div>

      {/* TAB 1: INVOICES LIST */}
      {activeTab === 'invoices' && (
        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-bh-gray-400" />
              <input
                type="text"
                placeholder="Faktura №, seriya, təchizatçı..."
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
                  <th className="py-3 px-4">Faktura №</th>
                  <th className="py-3 px-4">Təchizatçı Seriyası</th>
                  <th className="py-3 px-4">Təchizatçı</th>
                  <th className="py-3 px-4">PO / GR Bağlantısı</th>
                  <th className="py-3 px-4">Son Ödəniş Tarixi</th>
                  <th className="py-3 px-4">Uyğunlaşma Statusu</th>
                  <th className="py-3 px-4 text-right">Məbləğ</th>
                  <th className="py-3 px-4 text-right">Qalıq Borc</th>
                  <th className="py-3 px-4 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-bh-gray-400">
                      Fakturalar yüklənir...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-bh-gray-400">
                      Faktura tapılmadı.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-bh-gray-50/50">
                    <td className="py-3 px-4 font-mono font-medium">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4 font-mono text-bh-gray-600">{inv.supplierInvoiceRef}</td>
                    <td className="py-3 px-4 font-medium">{inv.supplierName}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-blue-600">
                      {inv.poNumber ? `${inv.poNumber}` : '-'}
                      {inv.grNumber ? ` / ${inv.grNumber}` : ''}
                    </td>
                    <td className="py-3 px-4">{formatDate(inv.dueDate)}</td>
                    <td className="py-3 px-4">{getInvoiceStatusBadge(inv.status)}</td>
                    <td className="py-3 px-4 text-right font-mono font-medium">
                      {formatMoney(inv.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                      {formatMoney(inv.outstandingAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedInvoiceForMatch(inv);
                          setActiveTab('matching');
                        }}
                        className="h-7 text-xs gap-1"
                      >
                        Yoxla <ArrowRight className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: THREE-WAY MATCH PANEL */}
      {activeTab === 'matching' && selectedInvoiceForMatch && (
        <div className="space-y-6">
          {/* Header Card for Selected Invoice */}
          <Card>
            <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold font-mono">
                    Faktura #{selectedInvoiceForMatch.invoiceNumber}
                  </h2>
                  <span className="text-xs text-bh-gray-500 font-mono">
                    (Təchizatçı Seriya: {selectedInvoiceForMatch.supplierInvoiceRef})
                  </span>
                  {getInvoiceStatusBadge(selectedInvoiceForMatch.status)}
                </div>
                <p className="text-xs text-bh-gray-500 mt-1">
                  PO: <strong>{selectedInvoiceForMatch.poNumber || 'Təyin edilməyib'}</strong> |
                  Qəbul Aktı (GR): <strong>{selectedInvoiceForMatch.grNumber || 'Təyin edilməyib'}</strong> |
                  Təchizatçı: {selectedInvoiceForMatch.supplierName}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleUpdateMatchStatus(
                      selectedInvoiceForMatch.id,
                      'mismatch_hold',
                      'Kənarlaşma səbəbilə ödəniş saxlanıldı (Hold).'
                    )
                  }
                  className="text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  Saxla (Hold)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleUpdateMatchStatus(
                      selectedInvoiceForMatch.id,
                      'disputed',
                      'Təchizatçı ilə mübahisələndirildi (Dispute).'
                    )
                  }
                  className="text-rose-600 border-rose-300 hover:bg-rose-50"
                >
                  Mübahisə Aç (Dispute)
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    handleUpdateMatchStatus(
                      selectedInvoiceForMatch.id,
                      'approved_for_payment',
                      'Üçtərəfli uyğunlaşma qəbul edildi, ödənişə təsdiqləndi.'
                    )
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Ödənişə Təsdiqlə
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Flags Banner if any mismatch exists */}
          {selectedInvoiceForMatch.matchResult &&
            selectedInvoiceForMatch.matchResult.flags.length > 0 && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg space-y-1.5 text-xs text-rose-900 dark:text-rose-200">
                <div className="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Üçtərəfli Uyğunlaşma Kənarlaşmaları Aşkar Edildi:
                </div>
                {selectedInvoiceForMatch.matchResult.flags.map((flag, idx) => (
                  <div key={idx} className="ml-6 list-disc">
                    • {flag}
                  </div>
                ))}
              </div>
            )}

          {/* Three-Way Comparison Matrix Table */}
          <Card>
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold">
                  Müqayisə Matrisi: Sifariş (PO) vs Qəbul (GR) vs Faktura (INV)
                </h3>
                <p className="text-xs text-bh-gray-500">
                  Say və qiymət tolerans hədləri: Say %0, Qiymət %0
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                  <tr>
                    <th className="py-2.5 px-3">Məhsul / SKU</th>
                    <th className="py-2.5 px-3 text-center bg-blue-50/50 dark:bg-blue-950/20">
                      PO Sifariş Sayı
                    </th>
                    <th className="py-2.5 px-3 text-center bg-emerald-50/50 dark:bg-emerald-950/20">
                      GR Qəbul Sayı
                    </th>
                    <th className="py-2.5 px-3 text-center bg-purple-50/50 dark:bg-purple-950/20 font-bold">
                      Faktura Sayı
                    </th>
                    <th className="py-2.5 px-3 text-center">Say Fərqi</th>
                    <th className="py-2.5 px-3 text-right bg-blue-50/50 dark:bg-blue-950/20">
                      PO Razılaşdırılmış Maya
                    </th>
                    <th className="py-2.5 px-3 text-right bg-purple-50/50 dark:bg-purple-950/20 font-bold">
                      Faktura Maya Dəyəri
                    </th>
                    <th className="py-2.5 px-3 text-right">Qiymət Fərqi</th>
                    <th className="py-2.5 px-3 text-center">Nəticə</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                  {selectedInvoiceForMatch.matchResult?.lines.map((line) => {
                    const isQtyOk = line.qtyDiff === 0;
                    const isPriceOk = line.priceDiff === 0;

                    return (
                      <tr key={line.sku} className="hover:bg-bh-gray-50/50">
                        <td className="py-3 px-3">
                          <div className="font-medium text-bh-black-900 dark:text-white">
                            {line.productName}
                          </div>
                          <div className="font-mono text-bh-gray-400">{line.sku}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono bg-blue-50/30 dark:bg-blue-950/10">
                          {line.poQty}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-medium text-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/10">
                          {line.grQty}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold bg-purple-50/30 dark:bg-purple-950/10">
                          {line.invQty}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          <span
                            className={
                              isQtyOk
                                ? 'text-emerald-600'
                                : 'text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded'
                            }
                          >
                            {line.qtyDiff > 0 ? `+${line.qtyDiff}` : line.qtyDiff}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono bg-blue-50/30 dark:bg-blue-950/10">
                          {formatMoney(line.poUnitCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold bg-purple-50/30 dark:bg-purple-950/10">
                          {formatMoney(line.invUnitCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span
                            className={
                              isPriceOk
                                ? 'text-emerald-600'
                                : 'text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded'
                            }
                          >
                            {line.priceDiff > 0
                              ? `+${formatMoney(line.priceDiff)}`
                              : formatMoney(line.priceDiff)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {line.status === 'exact_match' ? (
                            <Badge variant="success">Tam Uyğundur</Badge>
                          ) : (
                            <Badge variant="danger">Kənarlaşma Var</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: RETURNS & CREDIT NOTES */}
      {activeTab === 'returns' && (
        <div className="space-y-6">
          <Card>
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold">Təchizatçıya Mal Qaytarılmaları</h3>
                <p className="text-xs text-bh-gray-500">
                  Defektli malların anbar qalığından silinərək geri göndərilməsi.
                </p>
              </div>
              <Button size="sm" onClick={() => setIsReturnModalOpen(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> Yeni Qaytarılma Aktı
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                  <tr>
                    <th className="py-2.5 px-4">Qaytarılma №</th>
                    <th className="py-2.5 px-4">Təchizatçı</th>
                    <th className="py-2.5 px-4">Səbəb</th>
                    <th className="py-2.5 px-4">Anbar Sənədi</th>
                    <th className="py-2.5 px-4">Kredit Qeydi №</th>
                    <th className="py-2.5 px-4 text-right">Məbləğ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                  {returns.map((ret) => (
                    <tr key={ret.id}>
                      <td className="py-2.5 px-4 font-mono font-medium">{ret.returnNumber}</td>
                      <td className="py-2.5 px-4">{ret.supplierName}</td>
                      <td className="py-2.5 px-4">{ret.reason}</td>
                      <td className="py-2.5 px-4 font-mono text-emerald-600">
                        {ret.stockDocumentId} (Stok azaldıldı)
                      </td>
                      <td className="py-2.5 px-4 font-mono text-blue-600">{ret.creditNoteId}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">
                        {formatMoney(ret.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Kredit Qeydləri (Credit Notes)</h3>
              <p className="text-xs text-bh-gray-500">
                Təchizatçının borcumuzdan çıxılacaq rəsmi kompensasiya məbləğləri.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                  <tr>
                    <th className="py-2.5 px-4">Kredit Qeydi №</th>
                    <th className="py-2.5 px-4">Təchizatçı</th>
                    <th className="py-2.5 px-4">Səbəb</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Kredit Məbləği</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                  {creditNotes.map((cn) => (
                    <tr key={cn.id}>
                      <td className="py-2.5 px-4 font-mono font-medium">{cn.creditNoteNumber}</td>
                      <td className="py-2.5 px-4">{cn.supplierName}</td>
                      <td className="py-2.5 px-4">{cn.reason}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant="success">Tətbiq Edilib</Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600">
                        {formatMoney(cn.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL: Register Invoice */}
      <Modal
        isOpen={isNewInvoiceModalOpen}
        onClose={() => setIsNewInvoiceModalOpen(false)}
        title="Yeni Təchizatçı Fakturası Daxil Et"
      >
        <form onSubmit={handleRegisterInvoice} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Təchizatçı Şirkət *</label>
            <select
              value={invoiceForm.supplierId}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, supplierId: e.target.value })}
              className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.taxId})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Təchizatçının Faktura Seriya № *</label>
              <input
                type="text"
                required
                placeholder="məs. BFT-QAİMƏ-9955"
                value={invoiceForm.supplierInvoiceRef}
                onChange={(e) =>
                  setInvoiceForm({ ...invoiceForm, supplierInvoiceRef: e.target.value })
                }
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Əlaqəli PO Nömrəsi</label>
              <input
                type="text"
                value={invoiceForm.poNumber}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, poNumber: e.target.value })}
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Faktura Tarixi *</label>
              <input
                type="date"
                required
                value={invoiceForm.invoiceDate}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })}
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Son Ödəniş Tarixi (Due Date) *</label>
              <input
                type="date"
                required
                value={invoiceForm.dueDate}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
              />
            </div>
          </div>

          <div className="p-3 bg-bh-gray-50 dark:bg-bh-black-800 rounded border">
            <span className="font-semibold block mb-2">Faktura Sətirləri (Nümunə partiya)</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-bh-gray-500 block">Say:</span>
                <input
                  type="number"
                  min={1}
                  value={invoiceForm.lines[0].invoicedQty}
                  onChange={(e) => {
                    const qty = Number(e.target.value);
                    const updated = [...invoiceForm.lines];
                    updated[0].invoicedQty = qty;
                    updated[0].lineTotal = (qty * updated[0].unitCost) as Qapik;
                    setInvoiceForm({ ...invoiceForm, lines: updated });
                  }}
                  className="w-full px-2 py-1 border rounded dark:bg-bh-black-900 font-mono"
                />
              </div>
              <div>
                <span className="text-bh-gray-500 block">Vahid Maya (₼):</span>
                <input
                  type="number"
                  step="0.01"
                  value={(invoiceForm.lines[0].unitCost / 100).toFixed(2)}
                  onChange={(e) => {
                    const cost = aznToQapik(Number(e.target.value));
                    const updated = [...invoiceForm.lines];
                    updated[0].unitCost = cost;
                    updated[0].lineTotal = (updated[0].invoicedQty * cost) as Qapik;
                    setInvoiceForm({ ...invoiceForm, lines: updated });
                  }}
                  className="w-full px-2 py-1 border rounded dark:bg-bh-black-900 font-mono"
                />
              </div>
              <div>
                <span className="text-bh-gray-500 block">Sətir Cəmi:</span>
                <span className="font-mono font-bold text-sm block mt-1">
                  {formatMoney(invoiceForm.lines[0].lineTotal)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsNewInvoiceModalOpen(false)}
            >
              Ləğv et
            </Button>
            <Button type="submit" size="sm">
              Fakturanı Saxla və Yoxla
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Purchase Return */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title="Təchizatçıya Mala Qaytarılma Aktı Aç"
      >
        <form onSubmit={handleCreateReturn} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Təchizatçı *</label>
            <select
              value={returnForm.supplierId}
              onChange={(e) => setReturnForm({ ...returnForm, supplierId: e.target.value })}
              className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Qaytarılan Say *</label>
              <input
                type="number"
                min={1}
                value={returnForm.returnQty}
                onChange={(e) =>
                  setReturnForm({ ...returnForm, returnQty: Number(e.target.value) })
                }
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Vahid Maya (₼)</label>
              <input
                type="number"
                step="0.01"
                value={(returnForm.unitCost / 100).toFixed(2)}
                onChange={(e) =>
                  setReturnForm({ ...returnForm, unitCost: aznToQapik(Number(e.target.value)) })
                }
                className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Qaytarılmanın Səbəbi *</label>
            <textarea
              required
              rows={2}
              placeholder="məs. Defekt, ölçü uyğunsuzluğu, qırıq tikiş..."
              value={returnForm.reason}
              onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
              className="w-full px-3 py-1.5 border rounded dark:bg-bh-black-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsReturnModalOpen(false)}
            >
              Ləğv et
            </Button>
            <Button type="submit" size="sm" variant="destructive">
              Qaytarmanı Təsdiqlə (Stoku Azalt)
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
