import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PackagePlus,
  ArrowLeft,
  Printer,
  Mail,
  Truck,
  AlertTriangle,
} from 'lucide-react';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { purchasingRepository } from '../../../shared/adapters';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { DocumentWorkflowStepper } from '../components/DocumentWorkflowStepper';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';

export const PurchaseOrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null);

  const loadOrder = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await purchasingRepository.getPurchaseOrderById(id);
      if (!data) {
        toast({ title: 'Xəta', description: 'Sifariş tapılmadı', variant: 'danger' });
        navigate('/purchasing/orders');
        return;
      }
      setOrder(data);
    } catch {
      toast({ title: 'Xəta', description: 'Məlumatları yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [id]);

  if (isLoading || !order) {
    return (
      <div className="p-8 text-center text-bh-gray-500">
        Satınalma sifarişi yüklənir...
      </div>
    );
  }

  // Handle Send Email
  const handleSendEmail = async () => {
    try {
      const res = await purchasingRepository.sendPurchaseOrderEmail(order.id);
      if (!res.success) {
        setEmailStatusMessage(res.message);
        toast({
          title: 'Konfiqurasiya Olunmayıb',
          description: res.message,
          variant: 'danger',
        });
      } else {
        toast({ title: 'Göndərildi', description: 'Sifariş təchizatçıya göndərildi.' });
        setIsEmailModalOpen(false);
        loadOrder();
      }
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
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
          { label: 'Satınalma Sifarişləri', href: '/purchasing/orders' },
          { label: order.poNumber },
        ]}
      />

      {/* Stepper */}
      <DocumentWorkflowStepper
        currentStage={
          order.status === 'received' || order.status === 'partially_received'
            ? 'receipt'
            : 'order'
        }
        currentDocNumber={order.poNumber}
        linkedDocs={order.linkedDocs}
      />

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white dark:bg-bh-black-800 border border-bh-gray-200 dark:border-bh-black-700 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/purchasing/orders')}
              className="p-1 h-7 w-7"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight text-bh-black-900 dark:text-white flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-bh-black-700 dark:text-bh-gray-300" />
              Sifariş #{order.poNumber}
            </h1>
            {getStatusBadge(order.status)}
            {order.isDemo && (
              <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono">
                DEMO
              </span>
            )}
          </div>
          <p className="text-xs text-bh-gray-500 mt-1 ml-9">
            Təchizatçı:{' '}
            <strong className="text-black dark:text-white">{order.supplierName}</strong> (VÖEN:{' '}
            {order.supplierTaxId}) | Təhvil Anbarı: {order.deliveryWarehouseName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            className="gap-1.5"
          >
            <Printer className="w-4 h-4" /> Çap / PDF
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEmailStatusMessage(null);
              setIsEmailModalOpen(true);
            }}
            className="gap-1.5"
          >
            <Mail className="w-4 h-4" /> E-poçtla Göndər
          </Button>

          {(order.status === 'approved' ||
            order.status === 'sent' ||
            order.status === 'partially_received') && (
            <Button
              size="sm"
              onClick={() => navigate(`/purchasing/goods-receipts/new?poId=${order.id}`)}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Truck className="w-4 h-4" /> Mədaxil Aç (Qəbul Et)
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <Card>
          <CardContent className="p-4 space-y-2">
            <span className="font-semibold text-bh-black-900 dark:text-white block border-b pb-1">
              Çatdırılma və Şərtlər
            </span>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Sifariş Tarixi:</span>
              <span className="font-medium">{formatDate(order.orderDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Gözlənilən Çatdırılma:</span>
              <span className="font-medium text-black dark:text-white">
                {formatDate(order.expectedDeliveryDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Ödəniş Şərti:</span>
              <span className="font-mono">{order.paymentTerms.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Valyuta:</span>
              <span className="font-mono font-medium">{order.currency}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <span className="font-semibold text-bh-black-900 dark:text-white block border-b pb-1">
              Əlaqəli Sənədlər (Traceability)
            </span>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Tələbnamə:</span>
              <span className="font-mono font-medium text-blue-600">
                {order.linkedDocs.requestNumber || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Mədaxil Qəbzi (GR):</span>
              <span className="font-mono font-medium text-emerald-600">
                {order.linkedDocs.receiptNumber || 'Hələ qəbul edilməyib'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Hesab-Faktura:</span>
              <span className="font-mono font-medium">
                {order.linkedDocs.invoiceNumber || '-'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <span className="font-semibold text-bh-black-900 dark:text-white block border-b pb-1">
              Maliyyə Xülasəsi
            </span>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">Ara Cəm:</span>
              <span className="font-mono">{formatMoney(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bh-gray-500">ƏDV:</span>
              <span className="font-mono">{formatMoney(order.taxAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t pt-1">
              <span>Yekun Məbləğ:</span>
              <span className="font-mono">{formatMoney(order.totalAmount)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items Table with Ordered, Previously Received, Outstanding */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Sifariş və Təhvil Qalıqları (İcra Cədvəli)</h3>
          <p className="text-xs text-bh-gray-500">
            Hər bir variant üzrə sifariş edilən, əvvəl qəbul edilən və çatışmayan qalıq sayları.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
              <tr>
                <th className="py-2.5 px-4">Məhsul</th>
                <th className="py-2.5 px-4">SKU / Barkod</th>
                <th className="py-2.5 px-4">Ölçü / Rəng</th>
                <th className="py-2.5 px-4 text-center">Sifariş Edilən</th>
                <th className="py-2.5 px-4 text-center text-emerald-600">Əvvəl Qəbul Edilən</th>
                <th className="py-2.5 px-4 text-center text-rose-600">Qalıq Çatışmayan</th>
                <th className="py-2.5 px-4 text-right">Vahid Maya Dəyəri</th>
                <th className="py-2.5 px-4 text-right">Cəmi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
              {order.items.map((it) => (
                <tr key={it.id} className="hover:bg-bh-gray-50/50">
                  <td className="py-3 px-4 font-medium text-bh-black-900 dark:text-white">
                    {it.productName}
                  </td>
                  <td className="py-3 px-4 font-mono">{it.sku}</td>
                  <td className="py-3 px-4">
                    <span className="bg-bh-gray-100 dark:bg-bh-black-700 px-1.5 py-0.5 rounded font-mono">
                      {it.size} / {it.color}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-bold font-mono">{it.orderedQty}</td>
                  <td className="py-3 px-4 text-center font-mono font-medium text-emerald-600">
                    {it.previouslyReceivedQty}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    <span
                      className={
                        it.outstandingQty > 0
                          ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded'
                          : 'text-bh-gray-400'
                      }
                    >
                      {it.outstandingQty}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-medium">
                    {formatMoney(it.unitCost)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    {formatMoney(it.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Print / PDF Preview */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title={`Satınalma Sifarişi Çap Forması (#${order.poNumber})`}
      >
        <div className="space-y-4 p-4 border rounded-md bg-white text-black font-sans text-xs">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-base font-bold tracking-tight">BRAND HOUSE MMC</h2>
              <p className="text-[11px] text-gray-500">VÖEN: 1405829141 | Bakı, 28 May küç. 45</p>
              <p className="text-[11px] text-gray-500">Tel: +994 12 490 00 00 | info@brendhouse.az</p>
            </div>
            <div className="text-right">
              <span className="text-base font-bold font-mono">SATINALMA SİFARİŞİ</span>
              <div className="font-mono text-xs font-semibold">№ {order.poNumber}</div>
              <div className="text-[11px] text-gray-500">Tarix: {formatDate(order.orderDate)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-2 border-b text-[11px]">
            <div>
              <strong>Təchizatçı Şirkət:</strong>
              <div>{order.supplierName}</div>
              <div>VÖEN: {order.supplierTaxId}</div>
            </div>
            <div>
              <strong>Təhvil Verilməli Anbar:</strong>
              <div>{order.deliveryWarehouseName}</div>
              <div>Çatdırılma Tarixi: {formatDate(order.expectedDeliveryDate)}</div>
            </div>
          </div>

          <table className="w-full text-left text-[11px] border">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="p-1.5">Məhsul</th>
                <th className="p-1.5">SKU / Variant</th>
                <th className="p-1.5 text-center">Say</th>
                <th className="p-1.5 text-right">Qiymət</th>
                <th className="p-1.5 text-right">Cəmi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td className="p-1.5">{it.productName}</td>
                  <td className="p-1.5 font-mono">
                    {it.sku} ({it.size}/{it.color})
                  </td>
                  <td className="p-1.5 text-center font-bold">{it.orderedQty}</td>
                  <td className="p-1.5 text-right">{formatMoney(it.unitCost)}</td>
                  <td className="p-1.5 text-right font-medium">{formatMoney(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-right space-y-1 pt-2 font-mono text-[11px]">
            <div>Ara cəm: {formatMoney(order.subtotal)}</div>
            <div>ƏDV (%18): {formatMoney(order.taxAmount)}</div>
            <div className="text-sm font-bold border-t pt-1">
              Yekun Məbləğ: {formatMoney(order.totalAmount)}
            </div>
          </div>

          <div className="flex justify-between items-end pt-8 text-[11px] text-gray-600">
            <div>Təhvil Alan (İmza / Möhür): __________________</div>
            <div>Təhvil Verən (İmza / Möhür): __________________</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setIsPrintModalOpen(false)}>
            Bağla
          </Button>
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Çap Et
          </Button>
        </div>
      </Modal>

      {/* Modal: Send Email */}
      <Modal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title="Təchizatçıya Sifariş Məktubu Göndər"
      >
        <div className="space-y-4 text-xs">
          {emailStatusMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-md flex items-start gap-2.5 text-rose-800 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Konfiqurasiya Olunmayıb:</strong>
                <p>{emailStatusMessage}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium mb-1">Alıcı E-poçt Ünvanı</label>
            <input
              type="email"
              defaultValue="orders@bakufashion.az"
              className="w-full px-3 py-1.5 border rounded text-xs dark:bg-bh-black-900"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Mövzu</label>
            <input
              type="text"
              defaultValue={`BRAND HOUSE — Rəsmi Satınalma Sifarişi #${order.poNumber}`}
              className="w-full px-3 py-1.5 border rounded text-xs dark:bg-bh-black-900"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Məktubun Mətni</label>
            <textarea
              rows={3}
              defaultValue={`Hörmətli tərəfdaş, əlavədə təqdim olunan #${order.poNumber} nömrəli satınalma sifarişimizi qəbul etməyinizi və təsdiq bildirişi göndərməyinizi xahiş edirik.`}
              className="w-full px-3 py-1.5 border rounded text-xs dark:bg-bh-black-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setIsEmailModalOpen(false)}>
              Ləğv et
            </Button>
            <Button size="sm" onClick={handleSendEmail} className="gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Göndər
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
