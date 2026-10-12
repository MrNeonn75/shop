import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Layers,
  Save,
} from 'lucide-react';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  purchasingRepository,
  branchRepository,
  inventoryRepository,
} from '../../../shared/adapters';
import {
  PurchaseRequestItem,
  SuggestedReorderItem,
} from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { Qapik, aznToQapik } from '../../../shared/utils/money';
import { purchaseRequestFormSchema } from '../schemas/purchasingSchema';

const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '38', '39', '40', '41', '42', '43', 'Standart'];
const AVAILABLE_COLORS = ['Ağ', 'Qara', 'Göy', 'Boz', 'Qırmızı', 'Bej', 'Yaşıl', 'Qəhvəyi'];

export const PurchaseRequestFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);

  const [formData, setFormData] = useState({
    branchId: 'branch-1',
    warehouseId: 'wh-1',
    neededByDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    reason: '',
  });

  const [items, setItems] = useState<PurchaseRequestItem[]>([
    {
      id: 'item-1',
      productId: 'prod-1',
      productName: 'Kişi Pambıq Köynək (Klassik)',
      sku: 'TSH-M-001',
      barcode: '4760012345678',
      size: 'L',
      color: 'Ağ',
      requestedQty: 50,
      estimatedUnitCost: 2450 as Qapik, // 24.50 AZN
      lineTotal: 122500 as Qapik,
      currentStock: 4,
    },
  ]);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Matrix Editor Modal State
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [matrixProduct, setMatrixProduct] = useState({
    productId: 'prod-1',
    productName: 'Kişi Pambıq Köynək (Klassik)',
    skuPrefix: 'TSH-M',
    estimatedUnitCost: 24.5,
  });
  const selectedSizes = ['S', 'M', 'L', 'XL'];
  const selectedColors = ['Ağ', 'Qara', 'Göy'];
  const [matrixQuantities, setMatrixQuantities] = useState<Record<string, number>>({});

  // Suggested Reorder Modal State
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedReorderItem[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  useEffect(() => {
    const initData = async () => {
      try {
        const [bList, wList] = await Promise.all([
          branchRepository.getBranches(),
          inventoryRepository.getWarehouses(),
        ]);
        setBranches(bList);
        setWarehouses(wList);
      } catch {
        // Fallback
      }
    };
    initData();
  }, []);

  // Open Suggestions
  const handleOpenSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setIsSuggestionsOpen(true);
    try {
      const data = await purchasingRepository.getSuggestedReorderItems(formData.warehouseId);
      setSuggestions(data);
    } catch {
      toast({ title: 'Xəta', description: 'Təklifləri yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Apply a suggested item
  const handleApplySuggestion = (sug: SuggestedReorderItem) => {
    const existingIdx = items.findIndex((i) => i.sku === sug.sku);
    if (existingIdx !== -1) {
      toast({ title: 'Artıq mövcuddur', description: 'Bu məhsul sətirlərdə artıq var.' });
      return;
    }

    const newItem: PurchaseRequestItem = {
      id: `item-${Date.now()}-${sug.sku}`,
      productId: sug.productId,
      productName: sug.productName,
      sku: sug.sku,
      barcode: '',
      size: sug.size,
      color: sug.color,
      requestedQty: sug.suggestedQty,
      estimatedUnitCost: sug.estimatedUnitCost,
      lineTotal: (sug.suggestedQty * sug.estimatedUnitCost) as Qapik,
      currentStock: sug.currentStock,
      minStockLevel: sug.minStockLevel,
      suggestedQty: sug.suggestedQty,
      isSuggestionApplied: true,
    };

    setItems([...items, newItem]);
    toast({
      title: 'Təklif Əlavə Edildi',
      description: `${sug.productName} (${sug.size} / ${sug.color}) - ${sug.suggestedQty} ədəd`,
    });
  };

  // Add Item Manually
  const handleAddItem = () => {
    const newItem: PurchaseRequestItem = {
      id: `item-${Date.now()}`,
      productId: 'prod-2',
      productName: 'Qadın Zərif İpək Kofta',
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      barcode: '',
      size: 'M',
      color: 'Qara',
      requestedQty: 10,
      estimatedUnitCost: 3800 as Qapik,
      lineTotal: 38000 as Qapik,
      currentStock: 5,
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleUpdateItem = (id: string, updates: Partial<PurchaseRequestItem>) => {
    setItems(
      items.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, ...updates };
        if (updates.requestedQty !== undefined || updates.estimatedUnitCost !== undefined) {
          updated.lineTotal = (updated.requestedQty * updated.estimatedUnitCost) as Qapik;
        }
        return updated;
      })
    );
  };

  // Apply Fashion Matrix
  const handleApplyMatrix = () => {
    const newGeneratedItems: PurchaseRequestItem[] = [];
    const unitCostQapik = aznToQapik(matrixProduct.estimatedUnitCost);

    for (const size of selectedSizes) {
      for (const color of selectedColors) {
        const key = `${size}_${color}`;
        const qty = matrixQuantities[key] || 0;
        if (qty > 0) {
          newGeneratedItems.push({
            id: `item-mat-${Date.now()}-${key}`,
            productId: matrixProduct.productId,
            productName: matrixProduct.productName,
            sku: `${matrixProduct.skuPrefix}-${color.slice(0, 2).toUpperCase()}-${size}`,
            barcode: '',
            size,
            color,
            requestedQty: qty,
            estimatedUnitCost: unitCostQapik,
            lineTotal: (qty * unitCostQapik) as Qapik,
            currentStock: 0,
          });
        }
      }
    }

    if (newGeneratedItems.length === 0) {
      toast({
        title: 'Məlumat boşdur',
        description: 'Matrisdə ən azı 1 xana üçün say daxil edin!',
        variant: 'danger',
      });
      return;
    }

    setItems([...items, ...newGeneratedItems]);
    setIsMatrixOpen(false);
    toast({
      title: 'Matris Tətbiq Edildi',
      description: `${newGeneratedItems.length} yeni ölçü/rəng variantı əlavə edildi`,
    });
  };

  // Grand Total
  const totalAmount = items.reduce((sum, i) => (sum + i.lineTotal) as Qapik, 0 as Qapik);

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const parseResult = purchaseRequestFormSchema.safeParse({
      branchId: formData.branchId,
      warehouseId: formData.warehouseId,
      neededByDate: formData.neededByDate,
      reason: formData.reason,
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        barcode: i.barcode,
        size: i.size,
        color: i.color,
        requestedQty: Number(i.requestedQty),
        estimatedUnitCost: Number(i.estimatedUnitCost),
        currentStock: i.currentStock,
        suggestedQty: i.suggestedQty,
        isSuggestionApplied: i.isSuggestionApplied,
      })),
    });

    if (!parseResult.success) {
      const errs: Record<string, string> = {};
      parseResult.error.errors.forEach((err) => {
        if (err.path[0]) errs[String(err.path[0])] = err.message;
      });
      setFormErrors(errs);
      toast({
        title: 'Formada xəta var',
        description: Object.values(errs)[0],
        variant: 'danger',
      });
      return;
    }

    try {
      const selectedBranch = branches.find((b) => b.id === formData.branchId);
      const selectedWarehouse = warehouses.find((w) => w.id === formData.warehouseId);

      const created = await purchasingRepository.createPurchaseRequest({
        branchId: formData.branchId,
        branchName: selectedBranch?.name || '28 May Flaman Filialı',
        warehouseId: formData.warehouseId,
        warehouseName: selectedWarehouse?.name || 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
        neededByDate: formData.neededByDate,
        reason: formData.reason,
        items,
      });

      toast({
        title: 'Tələbnamə Göndərildi',
        description: `Tələbnamə #${created.requestNumber} rəhbərlik təsdiqinə təqdim olundu.`,
      });
      navigate('/purchasing/requests');
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Daxili Tələbnamələr', href: '/purchasing/requests' },
          { label: 'Yeni Tələbnamə' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/purchasing/requests')}
            className="p-1 h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-bh-black-900 dark:text-white">
              Yeni Daxili Satınalma Tələbnaməsi
            </h1>
            <p className="text-xs text-bh-gray-500">
              Şöbə tələbləri, moda ölçü × rəng matrisi və avtomatlaşdırılmış ehtiyat təklifləri.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenSuggestions}
          className="gap-1.5 border-amber-300 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100"
        >
          <Sparkles className="w-4 h-4 text-amber-600" /> Ehtiyat Təklifləri (Reorder Helper)
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Header Fields */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-4 text-bh-black-900 dark:text-white border-b pb-2">
              Əsas Parametrlər
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Filial *
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                >
                  <option value="branch-1">28 May Flaman Filialı</option>
                  <option value="branch-2">Gənclik Mall Filialı</option>
                  <option value="branch-3">Dəniz Mall Filialı</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Təhvil Anbarı *
                </label>
                <select
                  value={formData.warehouseId}
                  onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                >
                  <option value="wh-1">Mərkəzi Loqistika Anbarı (Dərnəgül)</option>
                  <option value="wh-2">28 May Alt Anbarı</option>
                  <option value="wh-3">Gənclik Mall Anbarı</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Tələb Olunan Tarix *
                </label>
                <input
                  type="date"
                  required
                  value={formData.neededByDate}
                  onChange={(e) => setFormData({ ...formData, neededByDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                  Sifarişin Səbəbi *
                </label>
                <input
                  type="text"
                  required
                  placeholder="məs. Vitrin tükənməsi, yeni mövsüm"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900"
                />
                {formErrors.reason && (
                  <span className="text-[11px] text-rose-500">{formErrors.reason}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card>
          <div className="p-4 border-b flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Tələb Olunan Məhsullar və Variantlar</h3>
              <p className="text-xs text-bh-gray-500">
                Geyim və ayaqqabılar üçün ölçü və rəng detallarını daxil edin.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMatrixOpen(true)}
                className="gap-1.5"
              >
                <Layers className="w-4 h-4" /> Ölçü × Rəng Matrisi
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAddItem}
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" /> Sətir Əlavə Et
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2.5 px-3">Məhsul Adı</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Ölçü</th>
                  <th className="py-2.5 px-3">Rəng</th>
                  <th className="py-2.5 px-3 text-center">Cari Qalıq</th>
                  <th className="py-2.5 px-3 w-24">Tələb Sayı *</th>
                  <th className="py-2.5 px-3 w-32">Təxmini Maya (₼)</th>
                  <th className="py-2.5 px-3 text-right">Cəmi</th>
                  <th className="py-2.5 px-2 text-center w-12">Sil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-bh-gray-400">
                      Siyahı boşdur. &quot;Sətir Əlavə Et&quot; və ya &quot;Ölçü × Rəng Matrisi&quot; düyməsindən istifadə edin.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-bh-gray-50/50">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={item.productName}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { productName: e.target.value })
                          }
                          className="w-full px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <input
                          type="text"
                          value={item.sku}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { sku: e.target.value })
                          }
                          className="w-24 px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={item.size}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { size: e.target.value })
                          }
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
                          value={item.color}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { color: e.target.value })
                          }
                          className="px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
                        >
                          {AVAILABLE_COLORS.map((clr) => (
                            <option key={clr} value={clr}>
                              {clr}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        <span className={item.currentStock < 5 ? 'text-rose-600 font-bold' : ''}>
                          {item.currentStock}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min={1}
                          value={item.requestedQty}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { requestedQty: Number(e.target.value) })
                          }
                          className="w-20 px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={(item.estimatedUnitCost / 100).toFixed(2)}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              estimatedUnitCost: aznToQapik(Number(e.target.value)),
                            })
                          }
                          className="w-24 px-2 py-1 border rounded text-xs font-mono dark:bg-bh-black-900"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-medium">
                        {formatMoney(item.lineTotal)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-bh-gray-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-bh-gray-50 dark:bg-bh-black-800 border-t flex justify-between items-center">
            <span className="text-xs text-bh-gray-500">
              Cəmi Sətir Sayı: <strong className="text-black dark:text-white">{items.length}</strong>
            </span>
            <div className="text-right">
              <span className="text-xs text-bh-gray-500 mr-2">Yekun Təxmini Məbləğ:</span>
              <span className="text-base font-bold font-mono text-bh-black-900 dark:text-white">
                {formatMoney(totalAmount)}
              </span>
            </div>
          </div>
        </Card>

        {/* Submit Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/purchasing/requests')}
          >
            Ləğv et
          </Button>
          <Button type="submit" className="gap-2">
            <Save className="w-4 h-4" /> Tələbnaməni Təsdiqə Göndər
          </Button>
        </div>
      </form>

      {/* MODAL: Fashion Size × Color Matrix Editor */}
      <Modal
        isOpen={isMatrixOpen}
        onClose={() => setIsMatrixOpen(false)}
        title="Moda Ölçü × Rəng Matrisi ilə Toplu Əlavə"
      >
        <div className="space-y-4">
          <p className="text-xs text-bh-gray-500">
            Məhsul üçün ölçü və rəng xanalarına tələb olunan sayları daxil edin.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium mb-1">Məhsul Modeli</label>
              <input
                type="text"
                value={matrixProduct.productName}
                onChange={(e) =>
                  setMatrixProduct({ ...matrixProduct, productName: e.target.value })
                }
                className="w-full px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Təxmini Maya (₼)</label>
              <input
                type="number"
                step="0.01"
                value={matrixProduct.estimatedUnitCost}
                onChange={(e) =>
                  setMatrixProduct({
                    ...matrixProduct,
                    estimatedUnitCost: Number(e.target.value),
                  })
                }
                className="w-full px-2 py-1 border rounded text-xs dark:bg-bh-black-900"
              />
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-center text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500">
                <tr>
                  <th className="p-2 text-left">Rəng / Ölçü</th>
                  {selectedSizes.map((sz) => (
                    <th key={sz} className="p-2">
                      {sz}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedColors.map((clr) => (
                  <tr key={clr}>
                    <td className="p-2 text-left font-medium">{clr}</td>
                    {selectedSizes.map((sz) => {
                      const key = `${sz}_${clr}`;
                      return (
                        <td key={sz} className="p-1">
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={matrixQuantities[key] || ''}
                            onChange={(e) =>
                              setMatrixQuantities({
                                ...matrixQuantities,
                                [key]: Number(e.target.value),
                              })
                            }
                            className="w-14 text-center px-1 py-1 border rounded font-mono text-xs dark:bg-bh-black-900"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setIsMatrixOpen(false)}>
              Bağla
            </Button>
            <Button size="sm" onClick={handleApplyMatrix}>
              Matrisi Sətirlərə Əlavə Et
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Reorder Suggestions Helper */}
      <Modal
        isOpen={isSuggestionsOpen}
        onClose={() => setIsSuggestionsOpen(false)}
        title="Avtomatlaşdırılmış Sifariş Təklifləri (Reorder Helper)"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Xəbərdarlıq və Təyinat:</strong>
              <p>
                Bu təkliflər sistem tərəfindən minimum stok hədləri və cari satış sürəti (velocity)
                əsasında hesablanmış tövsiyələrdir (display only). Qərar tamamilə istifadəçiyə məxsusdur.
              </p>
            </div>
          </div>

          {isLoadingSuggestions ? (
            <div className="p-6 text-center text-xs text-bh-gray-400">Təkliflər hesablanır...</div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {suggestions.map((sug) => (
                <div
                  key={sug.sku}
                  className="p-3 border rounded-lg flex items-center justify-between gap-3 text-xs bg-white dark:bg-bh-black-900"
                >
                  <div>
                    <div className="font-semibold text-bh-black-900 dark:text-white">
                      {sug.productName} ({sug.size} / {sug.color})
                    </div>
                    <div className="text-[11px] font-mono text-bh-gray-500">
                      SKU: {sug.sku} | Cari Stok: <strong>{sug.currentStock}</strong> | Min. Stok: {sug.minStockLevel}
                    </div>
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      {sug.reason}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-sm bg-bh-gray-100 dark:bg-bh-black-800 px-2 py-1 rounded">
                      +{sug.suggestedQty} ədəd
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleApplySuggestion(sug)}
                      className="text-xs h-7 px-2"
                    >
                      Əlavə et
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setIsSuggestionsOpen(false)}>
              Bağla
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
