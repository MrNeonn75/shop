import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { transferRepository, inventoryRepository } from '../../../shared/adapters';
import { SEEDED_CATALOG_PRODUCTS } from '../../catalog/data/taxonomyData';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { StockBalance } from '../../inventory/types';
import { useToast } from '../../../components/ui/useToast';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Barcode,
} from 'lucide-react';

interface TransferLineDraft {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  availableAtSource: number;
  requestedQty: number;
}

export const TransferCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destWarehouseId, setDestWarehouseId] = useState('');
  const [requestedDate, setRequestedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Line items
  const [lines, setLines] = useState<TransferLineDraft[]>([]);
  const [variantSearch, setVariantSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [whList, balList] = await Promise.all([
        inventoryRepository.getWarehouses(),
        inventoryRepository.getStockBalances(),
      ]);
      setWarehouses(whList);
      setBalances(balList);
      if (whList.length >= 2) {
        setSourceWarehouseId(whList[0].id); // Central
        setDestWarehouseId(whList[1].id);   // 28 May
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update available stocks if source warehouse changes
  useEffect(() => {
    if (!sourceWarehouseId) return;
    setLines((prev) =>
      prev.map((l) => {
        const bal = balances.find(
          (b) => b.variantId === l.variantId && b.warehouseId === sourceWarehouseId
        );
        return {
          ...l,
          availableAtSource: bal ? bal.available : 0,
        };
      })
    );
  }, [sourceWarehouseId, balances]);

  const handleAddVariant = (variantId: string) => {
    setErrorMessage(null);
    let foundVar: (typeof SEEDED_CATALOG_PRODUCTS)[0]['variants'][0] | undefined;
    let foundProd: (typeof SEEDED_CATALOG_PRODUCTS)[0] | undefined;

    for (const p of SEEDED_CATALOG_PRODUCTS) {
      const v = p.variants.find((item) => item.id === variantId);
      if (v) {
        foundVar = v;
        foundProd = p;
        break;
      }
    }

    if (!foundVar || !foundProd) return;

    if (lines.some((l) => l.variantId === variantId)) {
      toast({
        type: 'info',
        title: 'Artıq Əlavə Edilib',
        message: 'Bu variant artıq siyahıdadır. Miqdarını cədvəldə artıra bilərsiniz.',
      });
      return;
    }

    // Get source available stock
    const bal = balances.find(
      (b) => b.variantId === foundVar!.id && b.warehouseId === sourceWarehouseId
    );
    const available = bal ? bal.available : 0;

    if (available <= 0) {
      toast({
        type: 'warning',
        title: 'Sərbəst Qalıq Yoxdur',
        message: `Mənbə anbarda bu variant üzrə sərbəst qalıq 0 ədəddir.`,
      });
    }

    const newLine: TransferLineDraft = {
      variantId: foundVar.id,
      productId: foundProd.id,
      productName: foundProd.name,
      sku: foundVar.sku,
      barcode: foundVar.barcode,
      size: foundVar.size,
      color: foundVar.color,
      availableAtSource: available,
      requestedQty: 1,
    };

    setLines([...lines, newLine]);
    setVariantSearch('');
  };

  const handleBarcodeQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const code = barcodeInput.trim();
    let foundVariantId: string | undefined;

    for (const p of SEEDED_CATALOG_PRODUCTS) {
      const v = p.variants.find((item) => item.barcode === code || item.sku.toLowerCase() === code.toLowerCase());
      if (v) {
        foundVariantId = v.id;
        break;
      }
    }

    if (foundVariantId) {
      handleAddVariant(foundVariantId);
      setBarcodeInput('');
    } else {
      toast({
        type: 'error',
        title: 'Barkod Tapılmadı',
        message: `Kataloqda "${code}" koduna uyğun variant yoxdur.`,
      });
    }
  };

  const handleQtyChange = (variantId: string, qty: number) => {
    setLines(
      lines.map((l) => {
        if (l.variantId !== variantId) return l;
        const validQty = Math.max(1, qty);
        return {
          ...l,
          requestedQty: validQty,
        };
      })
    );
  };

  const handleRemoveLine = (variantId: string) => {
    setLines(lines.filter((l) => l.variantId !== variantId));
  };

  const handleSubmit = async (submitForApproval: boolean) => {
    setErrorMessage(null);

    if (sourceWarehouseId === destWarehouseId) {
      setErrorMessage('Mənbə anbar ilə təyinat anbarı eyni ola bilməz.');
      return;
    }

    if (lines.length === 0) {
      setErrorMessage('Transfer üçün ən azı 1 məhsul əlavə edilməlidir.');
      return;
    }

    // Available stock check
    for (const l of lines) {
      if (l.requestedQty > l.availableAtSource) {
        setErrorMessage(
          `Yetərsiz sərbəst qalıq: "${l.productName} (${l.sku})" üçün mənbə anbarda yalnız ${l.availableAtSource} ədəd sərbəstdir, siz isə ${l.requestedQty} ədəd tələb edirsiniz.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `tr-create-${Date.now()}`;
      const created = await transferRepository.createTransfer(
        {
          sourceWarehouseId,
          destinationWarehouseId: destWarehouseId,
          requestedDate,
          notes,
          items: lines.map((l) => ({
            variantId: l.variantId,
            requestedQty: l.requestedQty,
          })),
        },
        idempotencyKey
      );

      if (submitForApproval) {
        await transferRepository.submitTransfer(created.id, `tr-submit-${Date.now()}`);
      }

      toast({
        type: 'success',
        title: submitForApproval ? 'Təsdiqə Göndərildi' : 'Qaralama Yaradıldı',
        message: `Transfer #${created.transferNumber} uğurla qeydə alındı.`,
      });

      navigate(`/transfers/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer yaradılarkən xəta baş verdi';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Filial Transferləri', href: '/transfers' },
          { label: 'Yeni Transfer Sorğusu' },
        ]}
      />

      <PageHeader
        title="Yeni Filiallararası Transfer Sorğusu"
        description="Mənbə və təyinat anbarlarını seçin, məhsulları əlavə edin və sərbəst stok yoxlanışı ilə təsdiqə göndərin."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/transfers')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Transferlər Siyahısına Qayıt
          </Button>
        }
      />

      {errorMessage && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Origin & Destination Warehouse Pickers */}
      <Card className="p-4 bg-card border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-foreground mb-1">
              Göndərən Mənbə Anbar <span className="text-rose-500">*</span>
            </label>
            <select
              value={sourceWarehouseId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSourceWarehouseId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.branchName})
                </option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground mt-1 block">
              Mallar bu anbarın sərbəst qalığından rezerv ediləcək
            </span>
          </div>

          <div className="flex flex-col items-center justify-center pt-2">
            <div className="p-2 rounded-full bg-muted/60 text-muted-foreground">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1">
              Qəbul Edən Təyinat Anbarı <span className="text-rose-500">*</span>
            </label>
            <select
              value={destWarehouseId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDestWarehouseId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.branchName})
                </option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground mt-1 block">
              Mallar qəbul olunduqda bu anbara daxil olacaq
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-border text-xs">
          <div>
            <label className="block font-semibold text-foreground mb-1">Tələb Olunan Çatdırılma Tarixi</label>
            <Input
              type="date"
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
              className="text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-foreground mb-1">Qeydlər / Səbəb</label>
            <Input
              placeholder="məs. Vitrin tələbi, həftəsonu aksiyası üçün..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
      </Card>

      {/* Line Items Selection & Table */}
      <Card className="p-4 space-y-4 bg-card border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-sm text-foreground uppercase tracking-wider text-xs">
            Transferə Daxil Edilən Məhsullar ({lines.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Sərbəst qalıqdan artıq sifariş vermək bloklanır
          </span>
        </div>

        {/* Barcode scanner & search */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <form onSubmit={handleBarcodeQuickAdd} className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Barkodu skan edin və Enter basın..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="pl-9 h-9 text-xs font-mono"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm" className="h-9">
              Əlavə Et
            </Button>
          </form>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Kataloqdan məhsul adı və ya SKU axtarın..."
              value={variantSearch}
              onChange={(e) => setVariantSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {/* Autocomplete Results Box */}
        {variantSearch.trim().length > 1 && (
          <div className="max-h-40 overflow-y-auto border border-border rounded-xl bg-card shadow-md divide-y divide-border">
            {SEEDED_CATALOG_PRODUCTS.flatMap((p) =>
              p.variants.filter(
                (v) =>
                  p.name.toLowerCase().includes(variantSearch.toLowerCase()) ||
                  v.sku.toLowerCase().includes(variantSearch.toLowerCase()) ||
                  v.barcode.includes(variantSearch)
              ).map((v) => ({ product: p, variant: v }))
            ).slice(0, 8).map(({ product, variant }) => {
              const bal = balances.find(
                (b) => b.variantId === variant.id && b.warehouseId === sourceWarehouseId
              );
              const avail = bal ? bal.available : 0;

              return (
                <div
                  key={variant.id}
                  onClick={() => handleAddVariant(variant.id)}
                  className="p-2.5 hover:bg-muted flex items-center justify-between cursor-pointer text-xs"
                >
                  <div>
                    <span className="font-semibold">{product.name}</span>{' '}
                    <span className="font-mono text-muted-foreground">({variant.sku})</span>
                    <span className="ml-2 text-muted-foreground">
                      Ölçü: {variant.size}, Rəng: {variant.color}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] font-semibold ${avail > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {avail} ədəd sərbəst
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                      + Əlavə et
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Lines Table */}
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
              <tr>
                <th className="py-2.5 px-3">Məhsul</th>
                <th className="py-2.5 px-3">SKU & Barkod</th>
                <th className="py-2.5 px-2 text-center">Ölçü / Rəng</th>
                <th className="py-2.5 px-2 text-center">Mənbədə Sərbəst</th>
                <th className="py-2.5 px-2 text-center w-28">Tələb Miqdarı</th>
                <th className="py-2.5 px-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Transfer üçün məhsul əlavə edilməyib. Yuxarıdakı axtarış və ya barkodla məhsul daxil edin.
                  </td>
                </tr>
              ) : (
                lines.map((l) => {
                  const isExceeded = l.requestedQty > l.availableAtSource;

                  return (
                    <tr key={l.variantId} className={isExceeded ? 'bg-rose-500/10' : 'hover:bg-muted/20'}>
                      <td className="py-2 px-3 font-semibold text-foreground">{l.productName}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">
                        {l.sku} <span className="text-[10px]">({l.barcode})</span>
                      </td>
                      <td className="py-2 px-2 text-center">{l.size} / {l.color}</td>
                      <td className="py-2 px-2 text-center font-bold text-emerald-600">
                        {l.availableAtSource} ədəd
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Input
                          type="number"
                          min="1"
                          max={l.availableAtSource}
                          value={l.requestedQty}
                          onChange={(e) => handleQtyChange(l.variantId, parseInt(e.target.value) || 1)}
                          className={`h-7 text-center font-bold text-xs ${
                            isExceeded ? 'border-rose-500 text-rose-600' : ''
                          }`}
                        />
                        {isExceeded && (
                          <span className="text-[9px] text-rose-600 block mt-0.5">
                            Qalıqdan artıqdır!
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600"
                          onClick={() => handleRemoveLine(l.variantId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs font-semibold text-foreground">
            Cəmi Sifariş Həcmi: {lines.reduce((sum, l) => sum + l.requestedQty, 0)} ədəd ({lines.length} SKU)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleSubmit(false)}
            >
              Qaralama Saxla
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isSubmitting || lines.length === 0}
              onClick={() => handleSubmit(true)}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {isSubmitting ? 'İcra olunur...' : 'Təsdiqə Göndər'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
