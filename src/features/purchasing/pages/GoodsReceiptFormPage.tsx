import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Barcode,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/useToast';
import { purchasingRepository } from '../../../shared/adapters';
import { PurchaseOrder, GoodsReceiptItem } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { validateReceiptLines } from '../utils/receiptCalculations';

export const GoodsReceiptFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const poIdParam = searchParams.get('poId') || '';

  const [availablePOs, setAvailablePOs] = useState<PurchaseOrder[]>([]);
  const [selectedPOId, setSelectedPOId] = useState(poIdParam);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [scanInput, setScanInput] = useState('');

  // Items to receive
  const [items, setItems] = useState<GoodsReceiptItem[]>([]);

  // Over-receipt tolerance (default 0%)
  const [tolerancePercent, setTolerancePercent] = useState(0);

  // Idempotency & double-submit protection
  const [idempotencyKey] = useState(() => `idemp-gr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadPOs = async () => {
      try {
        const list = await purchasingRepository.getPurchaseOrders();
        // Show POs that are approved, sent, or partially_received
        const eligible = list.filter(
          (o) =>
            o.status === 'approved' ||
            o.status === 'sent' ||
            o.status === 'partially_received'
        );
        setAvailablePOs(eligible);

        if (poIdParam) {
          const matched = list.find((o) => o.id === poIdParam);
          if (matched) {
            handleSelectPO(matched);
          }
        } else if (eligible.length > 0) {
          handleSelectPO(eligible[0]);
        }
      } catch {
        // fallback
      }
    };
    loadPOs();
  }, [poIdParam]);

  const handleSelectPO = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setSelectedPOId(po.id);

    // Initialize GR items from PO outstanding quantities
    const grItems: GoodsReceiptItem[] = po.items.map((pi) => ({
      id: `gri-${pi.id}`,
      poItemId: pi.id,
      productId: pi.productId,
      productName: pi.productName,
      sku: pi.sku,
      barcode: pi.barcode || '4760012345678',
      size: pi.size,
      color: pi.color,
      orderedQty: pi.orderedQty,
      previouslyReceivedQty: pi.previouslyReceivedQty,
      receivedNowQty: pi.outstandingQty, // default to receiving remaining outstanding
      rejectedQty: 0,
      damagedQty: 0,
      unitCost: pi.unitCost,
    }));

    setItems(grItems);
    setValidationErrors({});
  };

  // Barcode Scan Handler
  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    const query = scanInput.trim().toLowerCase();
    const matchedIdx = items.findIndex(
      (it) => it.barcode.toLowerCase() === query || it.sku.toLowerCase() === query
    );

    if (matchedIdx !== -1) {
      const updated = [...items];
      updated[matchedIdx].receivedNowQty += 1;
      setItems(updated);
      toast({
        title: 'Məhsul Skan Edildi',
        description: `${updated[matchedIdx].productName} (${updated[matchedIdx].size}/${updated[matchedIdx].color}) +1 ədəd artırıldı.`,
      });
      setScanInput('');
    } else {
      toast({
        title: 'Məhsul tapılmadı',
        description: `Barkod "${scanInput}" bu satınalma sifarişində mövcud deyil!`,
        variant: 'danger',
      });
    }
  };

  const handleUpdateItem = (idx: number, updates: Partial<GoodsReceiptItem>) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], ...updates };
    setItems(updated);
  };

  // Submit Goods Receipt
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO) return;

    // Validate quantities against PO and tolerance
    const valResult = validateReceiptLines(
      items.map((i) => ({
        poItemId: i.poItemId,
        sku: i.sku,
        productName: i.productName,
        size: i.size,
        color: i.color,
        orderedQty: i.orderedQty,
        previouslyReceivedQty: i.previouslyReceivedQty,
        receivedNowQty: Number(i.receivedNowQty),
        rejectedQty: Number(i.rejectedQty),
        damagedQty: Number(i.damagedQty),
        reasonCode: i.reasonCode,
        notes: i.notes,
      })),
      tolerancePercent
    );

    if (!valResult.isValid) {
      setValidationErrors(valResult.errors);
      toast({
        title: 'Qəbul qaydaları pozulub',
        description: Object.values(valResult.errors)[0],
        variant: 'danger',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const createdGR = await purchasingRepository.createGoodsReceipt(
        {
          poId: selectedPO.id,
          poNumber: selectedPO.poNumber,
          supplierId: selectedPO.supplierId,
          supplierName: selectedPO.supplierName,
          warehouseId: selectedPO.deliveryWarehouseId,
          warehouseName: selectedPO.deliveryWarehouseName,
          receivedDate,
          discrepancyNotes,
          items,
        },
        idempotencyKey
      );

      toast({
        title: 'Mədaxil Sənədi Təsdiqləndi',
        description: `Mədaxil Aktı #${createdGR.grNumber} rəsmiləşdirildi və anbar qalığı artırıldı.`,
      });
      navigate(`/purchasing/goods-receipts/${createdGR.id}`);
    } catch (err: unknown) {
      toast({
        title: 'Xəta və ya Təkrar Sorğu',
        description: (err as Error).message || 'Mədaxil qeydə alına bilmədi.',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Malların Mədaxili', href: '/purchasing/goods-receipts' },
          { label: 'Yeni Mədaxil Aktı' },
        ]}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/purchasing/goods-receipts')}
          className="p-1 h-8 w-8"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-bh-black-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-bh-black-700 dark:text-bh-gray-300" />
            Anbara Mədaxil Qəbulu (Goods Receipt)
          </h1>
          <p className="text-xs text-bh-gray-500">
            Sifariş üzrə faktiki qəbul, zədə/imtina qeydiyyatı və avtomatik anbar stoku artımı.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* PO and Details Card */}
        <Card>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Satınalma Sifarişi (PO) *
                </label>
                <select
                  value={selectedPOId}
                  onChange={(e) => {
                    const found = availablePOs.find((p) => p.id === e.target.value);
                    if (found) handleSelectPO(found);
                  }}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900 font-mono"
                >
                  {availablePOs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.poNumber} — {p.supplierName} ({p.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Qəbul Tarixi *
                </label>
                <input
                  type="date"
                  required
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Təhvil Anbarı
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={selectedPO?.deliveryWarehouseName || 'Mərkəzi Loqistika Anbarı'}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-bh-gray-100 dark:bg-bh-black-800 text-bh-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Artıq Qəbul Toleransı (% Over-Receipt)
                </label>
                <select
                  value={tolerancePercent}
                  onChange={(e) => setTolerancePercent(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                >
                  <option value={0}>%0 (Artıq qəbul qəti qadağandır)</option>
                  <option value={5}>%5 (İcazəli kənarlaşma)</option>
                  <option value={10}>%10 (Maksimal icazəli)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Barcode Scanner Wedge Bar */}
        <Card>
          <CardContent className="p-3 bg-bh-gray-50 dark:bg-bh-black-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs">
              <Barcode className="w-5 h-5 text-bh-gray-600 dark:text-bh-gray-300" />
              <span className="font-medium">Sürətli Skanerlə Qəbul:</span>
              <span className="text-bh-gray-500 hidden sm:inline">
                Barkodu skan edin və ya daxil edib Enter basın
              </span>
            </div>
            <div className="flex items-center gap-2 w-72">
              <input
                type="text"
                placeholder="Barkod və ya SKU skan et..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleScanSubmit(e);
                  }
                }}
                className="w-full px-3 py-1.5 border rounded text-xs font-mono dark:bg-bh-black-900 border-bh-gray-300"
              />
              <Button type="button" size="sm" onClick={handleScanSubmit}>
                Əlavə et
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lines Table */}
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Qəbul Edilən Sətirlər və Kənarlaşmalar</h3>
            <p className="text-xs text-bh-gray-500">
              Hər bir variant üzrə faktiki qəbul sayını, imtina və ya zədələnmiş qalıqları qeyd edin.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2.5 px-3">Məhsul / Variant</th>
                  <th className="py-2.5 px-3 font-mono">SKU / Barkod</th>
                  <th className="py-2.5 px-3 text-center">Sifariş Edilib</th>
                  <th className="py-2.5 px-3 text-center">Əvvəl Qəbul</th>
                  <th className="py-2.5 px-3 w-28 text-center text-emerald-600 font-bold">
                    İndi Qəbul *
                  </th>
                  <th className="py-2.5 px-3 w-24 text-center text-rose-600">Zədəli Say</th>
                  <th className="py-2.5 px-3 w-24 text-center text-amber-600">İmtina Say</th>
                  <th className="py-2.5 px-3">Səbəb Qeydi (Zədə/İmtina)</th>
                  <th className="py-2.5 px-3 text-right">Maya Qiyməti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {items.map((it, idx) => {
                  const errorKey = `line_${idx}_${it.sku}_over_receipt`;
                  const hasOverError = Boolean(validationErrors[errorKey]);

                  return (
                    <tr
                      key={it.id}
                      className={hasOverError ? 'bg-rose-50/70 dark:bg-rose-950/30' : 'hover:bg-bh-gray-50/50'}
                    >
                      <td className="py-2.5 px-3 font-medium text-bh-black-900 dark:text-white">
                        {it.productName}
                        <div className="text-[11px] text-bh-gray-500">
                          {it.size} / {it.color}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <div>{it.sku}</div>
                        <div className="text-[10px] text-bh-gray-400">{it.barcode}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">{it.orderedQty}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-bh-gray-500">
                        {it.previouslyReceivedQty}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={it.receivedNowQty}
                          onChange={(e) =>
                            handleUpdateItem(idx, { receivedNowQty: Number(e.target.value) })
                          }
                          className="w-20 text-center px-2 py-1 border rounded text-xs font-mono font-bold dark:bg-bh-black-900 border-emerald-400"
                        />
                        {hasOverError && (
                          <div className="text-[10px] text-rose-600 mt-1 font-semibold">
                            Həddi aşır!
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={it.damagedQty}
                          onChange={(e) =>
                            handleUpdateItem(idx, { damagedQty: Number(e.target.value) })
                          }
                          className="w-16 text-center px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={it.rejectedQty}
                          onChange={(e) =>
                            handleUpdateItem(idx, { rejectedQty: Number(e.target.value) })
                          }
                          className="w-16 text-center px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          placeholder="məs. Tikiş defekti, ləkə"
                          value={it.notes || ''}
                          onChange={(e) => handleUpdateItem(idx, { notes: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium">
                        {formatMoney(it.unitCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t bg-bh-gray-50 dark:bg-bh-black-800 flex justify-between items-center text-xs">
            <span className="text-bh-gray-500">
              İdempotentlik Açarı:{' '}
              <span className="font-mono text-bh-black-900 dark:text-white">{idempotencyKey}</span>
            </span>
            <div className="text-right">
              <span className="text-bh-gray-500 mr-2">Qəbul Edilən Cəmi Say:</span>
              <span className="text-sm font-bold font-mono text-emerald-600">
                {items.reduce((s, it) => s + Number(it.receivedNowQty), 0)} ədəd
              </span>
            </div>
          </div>
        </Card>

        <div>
          <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
            Kənarlaşma və İcazə Qeydləri (Discrepancy Notes)
          </label>
          <textarea
            rows={2}
            placeholder="Çatışmayan və ya növbəti partiyaya saxlanılan mallar haqqında qeyd..."
            value={discrepancyNotes}
            onChange={(e) => setDiscrepancyNotes(e.target.value)}
            className="w-full px-3 py-2 border rounded text-xs dark:bg-bh-black-900 border-bh-gray-300"
          />
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/purchasing/goods-receipts')}
          >
            Ləğv et
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ShieldCheck className="w-4 h-4" />
            {isSubmitting ? 'Qəbul Sənədi Təsdiqlənir...' : 'Mədaxili Təsdiqlə (Stoku Artır)'}
          </Button>
        </div>
      </form>
    </div>
  );
};
