import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { InventoryNavHeader } from '../components/InventoryNavHeader';
import { VariantMatrixDrawer } from '../components/VariantMatrixDrawer';
import { inventoryRepository } from '../../../shared/adapters';
import { StockBalance, StockFilterParams, StockState } from '../types';
import { VariantMatrixData } from '../services/ledgerEngine';
import { formatMoney } from '../../../shared/utils/formatters';
import { formatDateTime } from '../../../shared/utils/formatters';
import { usePermission } from '../../../shared/hooks/usePermission';
import { maskSensitiveValue } from '../../../shared/utils/permissions';
import { useExportCsv } from '../../../shared/hooks/useExportCsv';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  Grid3X3,
  History,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
} from 'lucide-react';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';

export const StockOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const { exportToCsv } = useExportCsv();

  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedState, setSelectedState] = useState<StockState | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'low' | 'out_of_stock' | 'slow_moving' | 'dead_stock'>('all');
  const [slowDaysThreshold, setSlowDaysThreshold] = useState(30);
  const [deadDaysThreshold, setDeadDaysThreshold] = useState(90);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [matrixData, setMatrixData] = useState<VariantMatrixData | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [whList, balList] = await Promise.all([
        inventoryRepository.getWarehouses(),
        inventoryRepository.getStockBalances({
          search,
          warehouseId: selectedWarehouse,
          section: selectedSection as StockFilterParams['section'],
          type: selectedType as StockFilterParams['type'],
          stockState: selectedState,
          tab: activeTab,
          minDaysWithoutSale: activeTab === 'dead_stock' ? deadDaysThreshold : slowDaysThreshold,
        }),
      ]);
      setWarehouses(whList);
      setBalances(balList);
    } catch (err) {
      console.error('Failed to load stock overview balances', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    search,
    selectedWarehouse,
    selectedSection,
    selectedType,
    selectedState,
    activeTab,
    slowDaysThreshold,
    deadDaysThreshold,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenMatrix = async (productId: string, warehouseId: string) => {
    try {
      const data = await inventoryRepository.getVariantMatrix(productId, warehouseId);
      setMatrixData(data);
      setIsDrawerOpen(true);
    } catch (err) {
      console.error('Failed to load matrix', err);
    }
  };

  const handleExport = () => {
    const rows = balances.map((b) => ({
      'Məhsul Adı': b.productName,
      'SKU': b.variantSku,
      'Barkod': b.variantBarcode,
      'Ölçü': b.size,
      'Rəng': b.color,
      'Anbar': b.warehouseName,
      'Faktiki Qalıq': b.onHand,
      'Sərbəst Qalıq': b.available,
      'Rezerv': b.reserved,
      'Yolda Olan': b.inTransit,
      'Kritik Limit': b.minLevel,
      'Maya Dəyəri': can('products.cost_price.view') ? formatMoney(b.valuationQapik) : 'GİZLİ',
      'Son Hərəkət': formatDateTime(b.lastMovementDate),
      'Status': b.stockState,
      'Satışsız Günlər': b.daysWithoutSale,
    }));
    exportToCsv(rows, { filename: `brendhouse_stok_qaliqlari_${new Date().toISOString().slice(0, 10)}.csv` });
  };

  // Summary counts
  const summary = useMemo(() => {
    let onHandSum = 0;
    let availSum = 0;
    let resSum = 0;
    let transSum = 0;
    let valSum = 0;

    balances.forEach((b) => {
      onHandSum += b.onHand;
      availSum += b.available;
      resSum += b.reserved;
      transSum += b.inTransit;
      valSum += b.valuationQapik;
    });

    return {
      onHandSum,
      availSum,
      resSum,
      transSum,
      valSum,
      rowCount: balances.length,
    };
  }, [balances]);

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/inventory' },
          { label: 'Cari Qalıqlar (Stok Matrisi)' },
        ]}
      />

      <PageHeader
        title="Anbar və Vitrin Cari Qalıqları"
        description="Baş Kitab (Stock Ledger) əsasında hesablanan real-vaxt qalıqları, rezervasiyalar və yolda olan mallar."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={balances.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              CSV İxrac
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/transfers/new')}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Transfer Yarat
            </Button>
          </div>
        }
      />

      {/* Module Navigation Tabs */}
      <InventoryNavHeader />

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3 bg-card border-border">
          <div className="text-[11px] font-medium text-muted-foreground">Faktiki Stok</div>
          <div className="text-xl font-bold mt-1 text-foreground">{summary.onHandSum} ədəd</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{summary.rowCount} aktiv variant sətiri</div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Sərbəst Satışa Hazır</div>
          <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
            {summary.availSum} ədəd
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Rezerv xaric</div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Rezerv Edilmiş</div>
          <div className="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400">
            {summary.resSum} ədəd
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Transfer və sifarişlər</div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Yolda Olan (Tranzit)</div>
          <div className="text-xl font-bold mt-1 text-blue-600 dark:text-blue-400">
            {summary.transSum} ədəd
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Təyinat anbarına çatacaq</div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <div className="text-[11px] font-medium text-muted-foreground">Ümumi Maya Dəyəri</div>
          <div className="text-xl font-bold mt-1 text-foreground">
            {maskSensitiveValue(formatMoney(summary.valSum), can('products.cost_price.view'))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Həssas maliyyə göstəricisi</div>
        </Card>
      </div>

      {/* Tabs: All / Low Stock / Out of Stock / Slow Moving / Dead Stock */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Button
            variant={activeTab === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('all')}
            className="text-xs h-8"
          >
            Bütün Qalıqlar
          </Button>
          <Button
            variant={activeTab === 'low' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('low')}
            className="text-xs h-8 text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            Az Qalanlar (Kritik)
          </Button>
          <Button
            variant={activeTab === 'out_of_stock' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('out_of_stock')}
            className="text-xs h-8 text-rose-600 dark:text-rose-400"
          >
            Bitmişlər (0 Qalıq)
          </Button>
          <Button
            variant={activeTab === 'slow_moving' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('slow_moving')}
            className="text-xs h-8"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-bh-accent" />
            Dövriyyəsi Zəif ({slowDaysThreshold}+ gün)
          </Button>
          <Button
            variant={activeTab === 'dead_stock' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('dead_stock')}
            className="text-xs h-8 text-muted-foreground"
          >
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Ölü Stok ({deadDaysThreshold}+ gün)
          </Button>
        </div>

        {/* Threshold controls for slow-moving & dead stock */}
        {(activeTab === 'slow_moving' || activeTab === 'dead_stock') && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Satışsız gün həddi:</span>
            {activeTab === 'slow_moving' ? (
              <Input
                type="number"
                min="10"
                max="180"
                value={slowDaysThreshold}
                onChange={(e) => setSlowDaysThreshold(Number(e.target.value) || 30)}
                className="w-20 h-7 text-xs"
              />
            ) : (
              <Input
                type="number"
                min="60"
                max="365"
                value={deadDaysThreshold}
                onChange={(e) => setDeadDaysThreshold(Number(e.target.value) || 90)}
                className="w-20 h-7 text-xs"
              />
            )}
            <span className="text-muted-foreground">gün</span>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <Card className="p-3.5 bg-card border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ad, SKU, barkod, brend və ya kateqoriya ilə axtar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            value={selectedWarehouse}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedWarehouse(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Anbarlar</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.type === 'central' ? 'Mərkəz' : w.type === 'branch' ? 'Filial' : 'Tranzit'})
              </option>
            ))}
          </select>

          <select
            value={selectedSection}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSection(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Bölmələr</option>
            <option value="kisi">Kişi</option>
            <option value="qadin">Qadın</option>
            <option value="usaq">Uşaq</option>
            <option value="diger">Digər</option>
          </select>

          <select
            value={selectedType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedType(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Tiplər</option>
            <option value="clothing">Geyim</option>
            <option value="shoes">Ayaqqabı</option>
            <option value="accessories">Aksessuar</option>
          </select>

          <select
            value={selectedState}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedState(e.target.value as StockState | 'all')}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Stok Vəziyyətləri</option>
            <option value="normal">Normal Stok</option>
            <option value="low">Az Qalan (Kritik)</option>
            <option value="out_of_stock">Bitmiş (0 ədəd)</option>
            <option value="negative">Mənfi İcazəli Stok</option>
          </select>
        </div>
      </Card>

      {/* Table: Product/Variant × Location Matrix */}
      <Card className="overflow-hidden border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-muted/70 border-b border-border text-muted-foreground font-semibold">
                <th className="py-3 px-3">Məhsul & Variant</th>
                <th className="py-3 px-3">Anbar / Məkan</th>
                <th className="py-3 px-2 text-center">Faktiki Qalıq</th>
                <th className="py-3 px-2 text-center">Rezerv</th>
                <th className="py-3 px-2 text-center">Sərbəst Qalıq</th>
                <th className="py-3 px-2 text-center">Yolda (Tranzit)</th>
                <th className="py-3 px-2 text-center">Kritik Limit</th>
                <th className="py-3 px-3 text-right">Maya Dəyəri</th>
                <th className="py-3 px-3">Son Hərəkət</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    Stok qalıqları hesablanır...
                  </td>
                </tr>
              ) : balances.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    Seçilmiş filtrlərə uyğun heç bir qalıq tapılmadı.
                  </td>
                </tr>
              ) : (
                balances.map((row) => (
                  <tr key={`${row.variantId}_${row.warehouseId}`} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-foreground">{row.productName}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <span className="font-mono">{row.variantSku}</span>
                        <span>•</span>
                        <span>{row.size}</span>
                        <span>•</span>
                        <span>{row.color}</span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">{row.variantBarcode}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-foreground">{row.warehouseName}</div>
                      <div className="text-[10px] text-muted-foreground">{row.branchName}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`font-bold text-sm ${
                          row.onHand === 0
                            ? 'text-muted-foreground'
                            : row.onHand < 0
                            ? 'text-rose-600'
                            : 'text-foreground'
                        }`}
                      >
                        {row.onHand}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={row.reserved > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}>
                        {row.reserved}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`font-semibold ${
                          row.available <= 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {row.available}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {row.inTransit > 0 ? (
                        <span className="text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-0.5">
                          +{row.inTransit}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground">
                      {row.minLevel}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {maskSensitiveValue(formatMoney(row.valuationQapik), can('products.cost_price.view'))}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                      {row.lastMovementDate ? formatDateTime(row.lastMovementDate) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.stockState === 'normal' && (
                        <Badge variant="success" size="sm">Normal</Badge>
                      )}
                      {row.stockState === 'low' && (
                        <Badge variant="warning" size="sm">Kritik Az</Badge>
                      )}
                      {row.stockState === 'out_of_stock' && (
                        <Badge variant="danger" size="sm">Bitib</Badge>
                      )}
                      {row.stockState === 'negative' && (
                        <Badge variant="danger" size="sm">Mənfi Qalıq</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          title="Ölçü × Rəng Matrisi"
                          onClick={() => handleOpenMatrix(row.productId, row.warehouseId)}
                        >
                          <Grid3X3 className="h-3.5 w-3.5 mr-1" />
                          Matris
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          title="Hərəkət Tarixçəsi"
                          onClick={() =>
                            navigate(`/inventory/ledger?productId=${row.productId}&variantId=${row.variantId}`)
                          }
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Variant Drill-down Drawer */}
      <VariantMatrixDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        data={matrixData}
      />
    </div>
  );
};
