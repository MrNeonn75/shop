import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Select } from '../../../components/ui/Select';
import { NumberInput } from '../../../components/ui/NumberInput';
import { BarcodeSvg } from '../components/BarcodeSvg';
import { catalogRepository } from '../../../shared/adapters';
import { BarcodeLabelConfig } from '../types/catalog';
import { formatMoney } from '../../../shared/utils/formatters';
import { Printer, ArrowLeft, Sliders, Tag, FileText } from 'lucide-react';
import { useToast } from '../../../components/ui';

export const BarcodeLabelsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success } = useToast();

  // Selected product IDs passed from product list or default to all
  const initialProductIds: string[] = (location.state as { selectedProductIds?: string[] })?.selectedProductIds || [];

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['catalog-products-for-labels'],
    queryFn: () => catalogRepository.getProducts({ pageSize: 50 }),
  });

  const allProducts = productsData?.items || [];

  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialProductIds.length > 0 ? initialProductIds : (allProducts.slice(0, 3).map((p) => p.id))
  );

  const [config, setConfig] = useState<BarcodeLabelConfig>({
    sizePreset: '58x40',
    showName: true,
    showBrand: true,
    showSize: true,
    showColor: true,
    showPrice: true,
    showBarcode: true,
    showWordmark: true,
    copiesPerItem: 1,
    includeVariants: true,
  });

  const selectedProducts = allProducts.filter((p) =>
    selectedIds.includes(p.id)
  );

  // Generate label items based on variants and copies
  interface LabelItem {
    id: string;
    productName: string;
    brand: string;
    size: string;
    color: string;
    barcode: string;
    priceQapik: number;
  }

  const labelItems: LabelItem[] = [];
  selectedProducts.forEach((p) => {
    if (config.includeVariants && p.variants && p.variants.length > 0) {
      p.variants.forEach((v) => {
        for (let i = 0; i < config.copiesPerItem; i++) {
          labelItems.push({
            id: `${v.id}-${i}`,
            productName: p.name,
            brand: p.brandName,
            size: v.size,
            color: v.color,
            barcode: v.barcode || p.barcode,
            priceQapik: v.priceOverrideQapik ?? p.priceQapik,
          });
        }
      });
    } else {
      for (let i = 0; i < config.copiesPerItem; i++) {
        labelItems.push({
          id: `${p.id}-${i}`,
          productName: p.name,
          brand: p.brandName,
          size: 'Standart',
          color: 'Əsas',
          barcode: p.barcode,
          priceQapik: p.priceQapik,
        });
      }
    }
  });

  const handlePrint = () => {
    window.print();
    success('Çap pəncərəsi açıldı.');
  };

  return (
    <div className="space-y-6">
      {/* Print CSS stylesheet injected for thermal and sheet labels */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-label-sheet, #printable-label-sheet * {
            visibility: visible;
          }
          #printable-label-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: ${config.sizePreset === 'a4_grid' ? 'A4 portrait' : 'auto'};
            margin: ${config.sizePreset === 'a4_grid' ? '10mm' : '0mm'};
          }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title="Barkod və Qiymət Etiketlərinin Çapı"
          description="Termal printerlər və A4 etiket vərəqləri üçün ölçü şablonları və canlı dizayn önbaxışı."
          breadcrumbs={[
            { label: 'İdarəetmə Paneli', href: '/' },
            { label: 'Kataloq', href: '/catalog' },
            { label: 'Barkod Çapı' },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => navigate('/catalog')}
              >
                Kataloqa Qayıt
              </Button>
              <Button
                size="sm"
                leftIcon={<Printer className="h-4 w-4" />}
                onClick={handlePrint}
                disabled={labelItems.length === 0}
              >
                Çap Et ({labelItems.length} etiket)
              </Button>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
        {/* Left side: Designer controls */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                <span>Etiket Parametrləri</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Ölçü Şablonu
                </label>
                <Select
                  value={config.sizePreset}
                  onValueChange={(val: string) =>
                    setConfig((prev) => ({
                      ...prev,
                      sizePreset: val as BarcodeLabelConfig['sizePreset'],
                    }))
                  }
                  options={[
                    { value: '58x40', label: '58 × 40 mm (Standart Termal)' },
                    { value: '40x25', label: '40 × 25 mm (Kompakt Termal)' },
                    { value: '30x20', label: '30 × 20 mm (Mikro Aksesuar)' },
                    { value: 'a4_grid', label: 'A4 Vərəq (3 × 8 = 24 Etiket)' },
                  ]}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Hər Məhsula Say (Nüsxə)
                </label>
                <NumberInput
                  value={config.copiesPerItem}
                  onChange={(val) =>
                    setConfig((prev) => ({ ...prev, copiesPerItem: Math.max(1, Number(val) || 1) }))
                  }
                  min={1}
                  max={100}
                  className="mt-1"
                />
              </div>

              <div className="pt-2 border-t border-border space-y-2.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Görünən Sahələr
                </label>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.showWordmark}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, showWordmark: !!c }))}
                    />
                    <span>"BRAND HOUSE" loqosu</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.showName}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, showName: !!c }))}
                    />
                    <span>Məhsulun adı</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.showBrand}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, showBrand: !!c }))}
                    />
                    <span>Brend adı</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.showSize}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, showSize: !!c }))}
                    />
                    <span>Ölçü (Size)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.showColor}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, showColor: !!c }))}
                    />
                    <span>Rəng (Color)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.showPrice}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, showPrice: !!c }))}
                    />
                    <span>Satış Qiyməti (AZN)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.showBarcode}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, showBarcode: !!c }))}
                    />
                    <span>EAN-13 Barkod xətləri</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={config.includeVariants}
                      onCheckedChange={(c) => setConfig((p) => ({ ...p, includeVariants: !!c }))}
                    />
                    <span>Bütün ölçü və rəng variantları</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product selector list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Çapa Seçilən Məhsullar</span>
                <Badge variant="neutral" size="sm">
                  {selectedIds.length} məhsul
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-xs text-muted-foreground py-2">Yüklənir...</div>
              ) : (
                allProducts.map((p) => {
                  const isChecked = selectedIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-start gap-2 p-1.5 rounded hover:bg-muted/50 text-xs cursor-pointer"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(c) => {
                          if (c) {
                            setSelectedIds((prev) => [...prev, p.id]);
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== p.id));
                          }
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-foreground">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.sku} • {formatMoney(p.priceQapik)}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right side: Live Preview */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>
                Hazır etiket sayı: <strong className="text-foreground">{labelItems.length} ədəd</strong>
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Şablon: <strong className="text-foreground">{config.sizePreset}</strong>
            </div>
          </div>

          {/* Label Canvas Preview Area */}
          <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg p-6 min-h-[500px] flex flex-wrap gap-4 items-start content-start overflow-auto">
            {labelItems.length === 0 ? (
              <div className="w-full flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Tag className="h-10 w-10 mb-2 opacity-40" />
                <p>Heç bir məhsul seçilməyib. Sol paneldən məhsulları işarələyin.</p>
              </div>
            ) : (
              labelItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white text-black border border-neutral-400 shadow-sm flex flex-col justify-between overflow-hidden p-2 transition-transform hover:scale-[1.02] ${
                    config.sizePreset === '58x40'
                      ? 'w-[220px] h-[150px]'
                      : config.sizePreset === '40x25'
                      ? 'w-[160px] h-[100px]'
                      : config.sizePreset === '30x20'
                      ? 'w-[130px] h-[85px]'
                      : 'w-[190px] h-[125px]'
                  }`}
                >
                  {/* Wordmark Header */}
                  {config.showWordmark && (
                    <div className="text-center font-bold tracking-widest text-[9px] uppercase border-b border-black pb-0.5">
                      BRAND HOUSE
                    </div>
                  )}

                  {/* Brand & Product Name */}
                  <div className="my-0.5">
                    {config.showBrand && (
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-700 truncate">
                        {item.brand}
                      </div>
                    )}
                    {config.showName && (
                      <div className="text-[11px] font-bold leading-tight line-clamp-2 text-black">
                        {item.productName}
                      </div>
                    )}
                  </div>

                  {/* Size and Color Badge */}
                  {(config.showSize || config.showColor) && (
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold my-0.5">
                      {config.showSize && (
                        <span className="bg-neutral-200 px-1 py-0.2 rounded border border-neutral-400">
                          Ölçü: {item.size}
                        </span>
                      )}
                      {config.showColor && (
                        <span className="bg-neutral-200 px-1 py-0.2 rounded border border-neutral-400">
                          {item.color}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Barcode SVG */}
                  {config.showBarcode && (
                    <div className="flex justify-center my-0.5">
                      <BarcodeSvg
                        code={item.barcode}
                        height={config.sizePreset === '30x20' ? 24 : 34}
                        showText={config.sizePreset !== '30x20'}
                        className="p-0 bg-transparent"
                      />
                    </div>
                  )}

                  {/* Price */}
                  {config.showPrice && (
                    <div className="text-right font-black text-[13px] text-black pt-0.5 border-t border-neutral-300">
                      {formatMoney(item.priceQapik)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Hidden printable element specifically targeted by @media print */}
      <div id="printable-label-sheet" className="hidden">
        <div
          className={`grid gap-2 ${
            config.sizePreset === 'a4_grid'
              ? 'grid-cols-3'
              : 'grid-cols-1'
          }`}
        >
          {labelItems.map((item) => (
            <div
              key={`print-${item.id}`}
              style={{
                width:
                  config.sizePreset === '58x40'
                    ? '58mm'
                    : config.sizePreset === '40x25'
                    ? '40mm'
                    : config.sizePreset === '30x20'
                    ? '30mm'
                    : '65mm',
                height:
                  config.sizePreset === '58x40'
                    ? '40mm'
                    : config.sizePreset === '40x25'
                    ? '25mm'
                    : config.sizePreset === '30x20'
                    ? '20mm'
                    : '33mm',
                pageBreakInside: 'avoid',
              }}
              className="bg-white text-black p-1.5 border border-black flex flex-col justify-between overflow-hidden"
            >
              {config.showWordmark && (
                <div className="text-center font-bold tracking-widest text-[8px] uppercase border-b border-black">
                  BRAND HOUSE
                </div>
              )}
              <div className="my-0.5">
                {config.showBrand && (
                  <div className="text-[9px] font-semibold uppercase">{item.brand}</div>
                )}
                {config.showName && (
                  <div className="text-[10px] font-bold leading-tight truncate">{item.productName}</div>
                )}
              </div>
              {(config.showSize || config.showColor) && (
                <div className="flex gap-1 text-[9px] font-semibold">
                  {config.showSize && <span>Ölçü: {item.size}</span>}
                  {config.showColor && <span>Rəng: {item.color}</span>}
                </div>
              )}
              {config.showBarcode && (
                <div className="flex justify-center">
                  <BarcodeSvg
                    code={item.barcode}
                    height={28}
                    showText={true}
                    className="p-0 bg-transparent"
                  />
                </div>
              )}
              {config.showPrice && (
                <div className="text-right font-black text-xs">
                  {formatMoney(item.priceQapik)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

