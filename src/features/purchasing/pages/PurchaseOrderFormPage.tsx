import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
} from 'lucide-react';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/useToast';
import {
  purchasingRepository,
  supplierRepository,
  inventoryRepository,
} from '../../../shared/adapters';
import { PurchaseOrderItem } from '../types';
import { Supplier } from '../../suppliers/types';
import { formatMoney } from '../../../shared/utils/formatters';
import { Qapik, aznToQapik } from '../../../shared/utils/money';
import { purchaseOrderFormSchema } from '../schemas/purchasingSchema';

const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '38', '39', '40', '41', '42', '43', 'Standart'];
const AVAILABLE_COLORS = ['Ağ', 'Qara', 'Göy', 'Boz', 'Qırmızı', 'Bej', 'Yaşıl', 'Qəhvəyi'];

export const PurchaseOrderFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const prefilledSupplierId = searchParams.get('supplierId') || '';
  const prefilledRequestId = searchParams.get('requestId') || '';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);

  const [formData, setFormData] = useState({
    supplierId: prefilledSupplierId || 'sup-1',
    deliveryWarehouseId: 'wh-1',
    branchId: 'branch-1',
    expectedDeliveryDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    paymentTerms: 'net30',
    currency: 'AZN' as 'AZN' | 'USD' | 'EUR' | 'TRY',
    notes: '',
  });

  const [items, setItems] = useState<PurchaseOrderItem[]>([
    {
      id: 'poi-1',
      productId: 'prod-1',
      productName: 'Kişi Pambıq Köynək (Klassik)',
      sku: 'TSH-M-001',
      barcode: '4760012345678',
      size: 'L',
      color: 'Ağ',
      orderedQty: 100,
      previouslyReceivedQty: 0,
      outstandingQty: 100,
      unitCost: 2450 as Qapik, // 24.50 AZN default last supplier price
      discountPercent: 0,
      taxRatePercent: 18,
      lineTotal: 245000 as Qapik,
    },
  ]);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const initData = async () => {
      try {
        const [supRes, whRes] = await Promise.all([
          supplierRepository.getSuppliers(),
          inventoryRepository.getWarehouses(),
        ]);
        setSuppliers(supRes.items);
        setWarehouses(whRes);

        if (prefilledSupplierId) {
          const matched = supRes.items.find((s) => s.id === prefilledSupplierId);
          if (matched) {
            setFormData((prev) => ({
              ...prev,
              supplierId: matched.id,
              paymentTerms: matched.paymentTerms,
              currency: matched.currency as 'AZN' | 'USD' | 'EUR' | 'TRY',
            }));
          }
        }

        // If converting from an approved request:
        if (prefilledRequestId) {
          const req = await purchasingRepository.getPurchaseRequestById(prefilledRequestId);
          if (req && req.items.length > 0) {
            setItems(
              req.items.map((ri, idx) => ({
                id: `poi-pre-${idx}`,
                productId: ri.productId,
                productName: ri.productName,
                sku: ri.sku,
                barcode: ri.barcode,
                size: ri.size,
                color: ri.color,
                orderedQty: ri.requestedQty,
                previouslyReceivedQty: 0,
                outstandingQty: ri.requestedQty,
                unitCost: ri.estimatedUnitCost,
                discountPercent: 0,
                taxRatePercent: 18,
                lineTotal: ri.lineTotal,
              }))
            );
            setFormData((prev) => ({
              ...prev,
              branchId: req.branchId,
              warehouseId: req.warehouseId,
              notes: `Tələbnamə #${req.requestNumber} əsasında formalaşdırılıb.`,
            }));
          }
        }
      } catch {
        // Fallback
      }
    };
    initData();
  }, [prefilledSupplierId, prefilledRequestId]);

  const handleSupplierChange = async (supId: string) => {
    const sup = suppliers.find((s) => s.id === supId);
    if (!sup) return;

    setFormData((prev) => ({
      ...prev,
      supplierId: sup.id,
      paymentTerms: sup.paymentTerms,
      currency: sup.currency as 'AZN' | 'USD' | 'EUR' | 'TRY',
    }));

    // Fetch supplier's last prices to prefill defaults if any
    try {
      const supProducts = await supplierRepository.getSupplierProducts(sup.id);
      if (supProducts.length > 0) {
        // Pre-fill last known price on matching items
        setItems((currentItems) =>
          currentItems.map((item) => {
            const matchedP = supProducts.find((sp) => sp.sku === item.sku);
            if (matchedP) {
              const newUnitCost = matchedP.lastPurchasePrice;
              return {
                ...item,
                unitCost: newUnitCost,
                lineTotal: (item.orderedQty * newUnitCost) as Qapik,
              };
            }
            return item;
          })
        );
      }
    } catch {
      // ignore
    }
  };

  const handleAddItem = () => {
    const newItem: PurchaseOrderItem = {
      id: `poi-${Date.now()}`,
      productId: 'prod-2',
      productName: 'Qadın Zərif İpək Kofta',
      sku: `BLZ-${Date.now().toString().slice(-4)}`,
      barcode: '',
      size: 'S',
      color: 'Çəhrayı',
      orderedQty: 20,
      previouslyReceivedQty: 0,
      outstandingQty: 20,
      unitCost: 3800 as Qapik,
      discountPercent: 0,
      taxRatePercent: 18,
      lineTotal: 76000 as Qapik,
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleUpdateItem = (id: string, updates: Partial<PurchaseOrderItem>) => {
    setItems(
      items.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, ...updates };
        if (updates.orderedQty !== undefined || updates.unitCost !== undefined || updates.discountPercent !== undefined) {
          const discountMultiplier = (100 - updated.discountPercent) / 100;
          const discountedUnitCost = Math.round(updated.unitCost * discountMultiplier);
          updated.lineTotal = (updated.orderedQty * discountedUnitCost) as Qapik;
          updated.outstandingQty = updated.orderedQty - updated.previouslyReceivedQty;
        }
        return updated;
      })
    );
  };

  // Subtotals and Taxes
  const subtotal = items.reduce((sum, it) => (sum + it.lineTotal) as Qapik, 0 as Qapik);
  const taxAmount = Math.round(subtotal * 0.18) as Qapik; // 18% standard VAT
  const totalAmount = (subtotal + taxAmount) as Qapik;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const parseResult = purchaseOrderFormSchema.safeParse({
      supplierId: formData.supplierId,
      deliveryWarehouseId: formData.deliveryWarehouseId,
      branchId: formData.branchId,
      expectedDeliveryDate: formData.expectedDeliveryDate,
      paymentTerms: formData.paymentTerms,
      currency: formData.currency,
      notes: formData.notes,
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        barcode: i.barcode,
        size: i.size,
        color: i.color,
        orderedQty: Number(i.orderedQty),
        unitCost: Number(i.unitCost),
        discountPercent: Number(i.discountPercent),
        taxRatePercent: Number(i.taxRatePercent),
      })),
    });

    if (!parseResult.success) {
      const errs: Record<string, string> = {};
      parseResult.error.errors.forEach((err) => {
        if (err.path[0]) errs[String(err.path[0])] = err.message;
      });
      setFormErrors(errs);
      toast({ title: 'Formada xəta var', description: Object.values(errs)[0], variant: 'danger' });
      return;
    }

    try {
      const selectedSup = suppliers.find((s) => s.id === formData.supplierId);
      const selectedWh = warehouses.find((w) => w.id === formData.deliveryWarehouseId);

      const createdPO = await purchasingRepository.createPurchaseOrder({
        supplierId: formData.supplierId,
        supplierName: selectedSup?.name || 'Təchizatçı',
        supplierTaxId: selectedSup?.taxId || '1401234567',
        deliveryWarehouseId: formData.deliveryWarehouseId,
        deliveryWarehouseName: selectedWh?.name || 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
        branchId: formData.branchId,
        branchName: '28 May Flaman Filialı',
        expectedDeliveryDate: formData.expectedDeliveryDate,
        paymentTerms: formData.paymentTerms,
        currency: formData.currency,
        notes: formData.notes,
        items,
        linkedDocs: prefilledRequestId ? { requestId: prefilledRequestId } : {},
      });

      toast({
        title: 'Sifariş Yaradıldı',
        description: `Satınalma sifarişi #${createdPO.poNumber} uğurla açıldı.`,
      });
      navigate(`/purchasing/orders/${createdPO.id}`);
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Satınalma Sifarişləri', href: '/purchasing/orders' },
          { label: 'Yeni PO' },
        ]}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/purchasing/orders')}
          className="p-1 h-8 w-8"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-bh-black-900 dark:text-white">
            Yeni Satınalma Sifarişi (PO)
          </h1>
          <p className="text-xs text-bh-gray-500">
            Təchizatçı ilə razılaşdırılmış maya dəyəri, variantlar və çatdırılma şərtləri.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {Object.keys(formErrors).length > 0 && (
          <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-md text-xs">
            {Object.values(formErrors).join(', ')}
          </div>
        )}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-4 text-bh-black-900 dark:text-white border-b pb-2">
              Sifarişin Şərtləri və Tərəfdaş
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Təchizatçı Şirkət *
                </label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (VÖEN: {s.taxId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Təhvil Anbarı *
                </label>
                <select
                  value={formData.deliveryWarehouseId}
                  onChange={(e) =>
                    setFormData({ ...formData, deliveryWarehouseId: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                >
                  <option value="wh-1">Mərkəzi Loqistika Anbarı (Dərnəgül)</option>
                  <option value="wh-2">28 May Alt Anbarı</option>
                  <option value="wh-3">Gənclik Mall Anbarı</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Gözlənilən Çatdırılma *
                </label>
                <input
                  type="date"
                  required
                  value={formData.expectedDeliveryDate}
                  onChange={(e) =>
                    setFormData({ ...formData, expectedDeliveryDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Ödəniş Şərti / Valyuta
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-2 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                  >
                    <option value="immediate">Dərhal</option>
                    <option value="net15">Net 15</option>
                    <option value="net30">Net 30</option>
                    <option value="net45">Net 45</option>
                    <option value="net60">Net 60</option>
                  </select>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as 'AZN' | 'USD' | 'EUR' | 'TRY' })}
                    className="w-full px-2 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                  >
                    <option value="AZN">AZN (₼)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="TRY">TRY (₺)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                Xüsusi Qeydlər və Təlimatlar
              </label>
              <input
                type="text"
                placeholder="məs. Qablaşdırma, partiya tələbi, loqistika təlimatı..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold">Sifariş Sətirləri</h3>
              <p className="text-xs text-bh-gray-500">
                Qiymətlər təchizatçının sonuncu təsdiqlənmiş maya dəyəri ilə ilkin doldurulur.
              </p>
            </div>
            <Button type="button" size="sm" onClick={handleAddItem} className="gap-1.5">
              <Plus className="w-4 h-4" /> Məhsul Sətri Əlavə Et
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2.5 px-3">Məhsul</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Ölçü</th>
                  <th className="py-2.5 px-3">Rəng</th>
                  <th className="py-2.5 px-3 w-24">Sifariş Sayı *</th>
                  <th className="py-2.5 px-3 w-32">Vahid Qiymət (₼) *</th>
                  <th className="py-2.5 px-3 w-20">Endirim %</th>
                  <th className="py-2.5 px-3 w-20">ƏDV %</th>
                  <th className="py-2.5 px-3 text-right">Məbləğ</th>
                  <th className="py-2.5 px-2 text-center w-12">Sil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-bh-gray-50/50">
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={it.productName}
                        onChange={(e) => handleUpdateItem(it.id, { productName: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
                      />
                    </td>
                    <td className="py-2 px-3 font-mono">
                      <input
                        type="text"
                        value={it.sku}
                        onChange={(e) => handleUpdateItem(it.id, { sku: e.target.value })}
                        className="w-24 px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={it.size}
                        onChange={(e) => handleUpdateItem(it.id, { size: e.target.value })}
                        className="px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
                      >
                        {AVAILABLE_SIZES.map((sz) => (
                          <option key={sz} value={sz}>
                            {sz}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={it.color}
                        onChange={(e) => handleUpdateItem(it.id, { color: e.target.value })}
                        className="px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
                      >
                        {AVAILABLE_COLORS.map((clr) => (
                          <option key={clr} value={clr}>
                            {clr}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={1}
                        value={it.orderedQty}
                        onChange={(e) =>
                          handleUpdateItem(it.id, { orderedQty: Number(e.target.value) })
                        }
                        className="w-20 px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={(it.unitCost / 100).toFixed(2)}
                        onChange={(e) =>
                          handleUpdateItem(it.id, {
                            unitCost: aznToQapik(Number(e.target.value)),
                          })
                        }
                        className="w-24 px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={it.discountPercent}
                        onChange={(e) =>
                          handleUpdateItem(it.id, { discountPercent: Number(e.target.value) })
                        }
                        className="w-16 px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-mono text-xs">%{it.taxRatePercent}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-medium">
                      {formatMoney(it.lineTotal)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        className="text-bh-gray-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="p-4 bg-bh-gray-50 dark:bg-bh-black-800 border-t flex flex-col sm:flex-row justify-between items-end gap-4">
            <span className="text-xs text-bh-gray-500">
              Sətir Sayı: <strong className="text-black dark:text-white">{items.length}</strong>
            </span>

            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-bh-gray-500">Ara Cəm (Subtotal):</span>
                <span className="font-mono font-medium">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bh-gray-500">ƏDV (%18):</span>
                <span className="font-mono font-medium">{formatMoney(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t pt-1.5 text-bh-black-900 dark:text-white">
                <span>Yekun Sifariş Dəyəri:</span>
                <span className="font-mono">{formatMoney(totalAmount)}</span>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/purchasing/orders')}>
            Ləğv et
          </Button>
          <Button type="submit" className="gap-2">
            <Save className="w-4 h-4" /> Satınalma Sifarişini Təsdiqlə (PO Aç)
          </Button>
        </div>
      </form>
    </div>
  );
};
