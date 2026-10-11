import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { InventoryNavHeader } from '../components/InventoryNavHeader';
import { inventoryRepository } from '../../../shared/adapters';
import { StockMovement, StockMovementType, StockDocument } from '../types';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { usePermission } from '../../../shared/hooks/usePermission';
import { maskSensitiveValue } from '../../../shared/utils/permissions';
import { useExportCsv } from '../../../shared/hooks/useExportCsv';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  ArrowRight,
  ExternalLink,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';

export const StockLedgerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const { exportToCsv } = useExportCsv();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters initialized from deep link params if present
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedType, setSelectedType] = useState<StockMovementType | 'all'>(
    (searchParams.get('type') as StockMovementType) || 'all'
  );
  const [selectedWarehouse, setSelectedWarehouse] = useState(searchParams.get('warehouseId') || 'all');
  const [docNumberFilter, setDocNumberFilter] = useState(searchParams.get('docNumber') || '');
  const productIdParam = searchParams.get('productId') || undefined;
  const variantIdParam = searchParams.get('variantId') || undefined;

  // Reference Document Modal
  const [selectedDoc, setSelectedDoc] = useState<StockDocument | null>(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [whList, result] = await Promise.all([
        inventoryRepository.getWarehouses(),
        inventoryRepository.getMovements({
          search,
          type: selectedType,
          warehouseId: selectedWarehouse,
          docNumber: docNumberFilter || undefined,
          productId: productIdParam,
          variantId: variantIdParam,
        }),
      ]);
      setWarehouses(whList);
      setMovements(result.items);
    } catch (err) {
      console.error('Failed to load ledger movements', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedType, selectedWarehouse, docNumberFilter, productIdParam, variantIdParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenReferenceDoc = async (m: StockMovement) => {
    if (m.referenceDocType === 'transfer') {
      navigate(`/transfers/${m.referenceDocId}`);
      return;
    }

    setIsLoadingDoc(true);
    setIsDocModalOpen(true);
    try {
      const doc = await inventoryRepository.getStockDocumentById(m.referenceDocId);
      setSelectedDoc(doc);
    } catch (err) {
      console.error('Failed to load reference document', err);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const handleExport = () => {
    const rows = movements.map((m) => ({
      'Hərəkət ID': m.id,
      'Tarix (Asia/Baku)': formatDateTime(m.timestamp),
      'Hərəkət Növü': m.type,
      'Məhsul': m.productName,
      'SKU': m.variantSku,
      'Barkod': m.variantBarcode,
      'Ölçü': m.size,
      'Rəng': m.color,
      'Mənbə': m.fromWarehouseName || '—',
      'Təyinat': m.toWarehouseName || '—',
      'Miqdar': m.quantity,
      'Vahid Maya Dəyəri': can('products.cost_price.view') ? formatMoney(m.unitCostQapik) : 'GİZLİ',
      'Cəmi Maya Dəyəri': can('products.cost_price.view') ? formatMoney(m.totalCostQapik) : 'GİZLİ',
      'Əsas Sənəd': m.referenceDocNumber,
      'İcraçı İstifadəçi': m.userName,
      'Səbəb / Qeyd': m.reasonCode || m.notes || '—',
    }));
    exportToCsv(rows, { filename: `brendhouse_hereket_jurnali_${new Date().toISOString().slice(0, 10)}.csv` });
  };

  const getTypeBadge = (type: StockMovementType) => {
    switch (type) {
      case 'receipt':
        return <Badge variant="success" size="sm">Qəbul</Badge>;
      case 'issue':
        return <Badge variant="danger" size="sm">Silinmə</Badge>;
      case 'transfer_out':
        return <Badge variant="warning" size="sm">Transfer Çıxış</Badge>;
      case 'transfer_in':
        return <Badge variant="default" size="sm">Transfer Giriş</Badge>;
      case 'sale':
        return <Badge variant="neutral" size="sm">Satış (Kassa)</Badge>;
      case 'return':
        return <Badge variant="success" size="sm">Qaytarılma</Badge>;
      case 'adjustment':
        return <Badge variant="warning" size="sm">Korreksiya</Badge>;
      case 'inventory_count':
        return <Badge variant="default" size="sm">İnventarizasiya</Badge>;
      case 'damaged':
        return <Badge variant="danger" size="sm">Zədəli Mal</Badge>;
      case 'lost':
        return <Badge variant="danger" size="sm">İtmiş Mal</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/inventory' },
          { label: 'Hərəkət Jurnalı (Stock Ledger)' },
        ]}
      />

      <PageHeader
        title="Stok Hərəkət Jurnalı (Baş Kitab)"
        description="Bütün daxilolma, silinmə, transfer və korreksiya hərəkətlərinin dəyişdirilməz rəsmi auditi və qeydiyyatı."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={movements.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              CSV İxrac
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/inventory/documents')}
            >
              <FileText className="mr-2 h-4 w-4" />
              Yeni Sənəd Tərtibi
            </Button>
          </div>
        }
      />

      <InventoryNavHeader />

      {/* Deep Link Active Notice */}
      {(productIdParam || docNumberFilter || variantIdParam) && (
        <div className="p-2.5 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <span>
              Xüsusi filtr aktivdir: {docNumberFilter ? `Sənəd #${docNumberFilter}` : ''}{' '}
              {productIdParam ? `Məhsul ID: ${productIdParam}` : ''}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setDocNumberFilter('');
              navigate('/inventory/ledger');
            }}
          >
            Filtri Təmizlə
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <Card className="p-3.5 bg-card border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Məhsul, SKU, barkod, icraçı axtar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedType(e.target.value as StockMovementType | 'all')}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Hərəkət Növləri</option>
            <option value="receipt">Qəbul (Daxilolma)</option>
            <option value="issue">Silinmə</option>
            <option value="transfer_out">Transfer Çıxış</option>
            <option value="transfer_in">Transfer Giriş</option>
            <option value="sale">Satış</option>
            <option value="return">Qaytarılma</option>
            <option value="adjustment">Korreksiya</option>
            <option value="inventory_count">İnventarizasiya</option>
            <option value="damaged">Zədəli Mal</option>
            <option value="lost">İtmiş Mal</option>
          </select>

          <select
            value={selectedWarehouse}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedWarehouse(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Anbarlar</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <Input
            placeholder="Sənəd № (məs. DOC-2026-00001)"
            value={docNumberFilter}
            onChange={(e) => setDocNumberFilter(e.target.value)}
            className="h-9 text-xs"
          />
        </div>
      </Card>

      {/* Read-Only Ledger Table */}
      <Card className="overflow-hidden border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-muted/70 border-b border-border text-muted-foreground font-semibold">
                <th className="py-3 px-3">Hərəkət ID</th>
                <th className="py-3 px-3">Tarix & Saat (Asia/Baku)</th>
                <th className="py-3 px-3">Növ</th>
                <th className="py-3 px-3">Məhsul & Variant</th>
                <th className="py-3 px-3">Məkan (Mənbə → Təyinat)</th>
                <th className="py-3 px-2 text-center">Miqdar</th>
                <th className="py-3 px-3 text-right">Vahid Maya</th>
                <th className="py-3 px-3 text-right">Cəmi Maya</th>
                <th className="py-3 px-3">Əsas Sənəd</th>
                <th className="py-3 px-3">İcraçı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    Hərəkət qeydləri yüklənir...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    Seçilmiş filtrlərə uyğun heç bir hərəkət qeydi tapılmadı.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isPositive =
                    m.type === 'receipt' ||
                    m.type === 'transfer_in' ||
                    m.type === 'return' ||
                    (m.type === 'adjustment' && m.toWarehouseId);

                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-foreground">
                        {m.id}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                        {formatDateTime(m.timestamp)}
                      </td>
                      <td className="py-2.5 px-3">{getTypeBadge(m.type)}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{m.productName}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono">{m.variantSku}</span>
                          <span>•</span>
                          <span>{m.size}</span>
                          <span>•</span>
                          <span>{m.color}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <span className="truncate max-w-[130px]" title={m.fromWarehouseName || 'Xaric'}>
                            {m.fromWarehouseName || '—'}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[130px] font-medium" title={m.toWarehouseName || 'Daxil'}>
                            {m.toWarehouseName || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {isPositive ? `+${m.quantity}` : `-${m.quantity}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {maskSensitiveValue(formatMoney(m.unitCostQapik), can('products.cost_price.view'))}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {maskSensitiveValue(formatMoney(m.totalCostQapik), can('products.cost_price.view'))}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleOpenReferenceDoc(m)}
                          className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-[11px] font-medium cursor-pointer"
                        >
                          {m.referenceDocNumber}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                        {m.userName}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reference Document Details Modal */}
      <Modal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        title={selectedDoc ? `Sənəd #${selectedDoc.docNumber} Detalları` : 'Sənəd Məlumatı'}
        size="lg"
      >
        {isLoadingDoc ? (
          <div className="py-8 text-center text-muted-foreground">Sənəd məlumatları yüklənir...</div>
        ) : selectedDoc ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg border border-border">
              <div>
                <span className="text-muted-foreground block text-[10px]">Sənəd Növü</span>
                <span className="font-semibold uppercase">{selectedDoc.type}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Anbar</span>
                <span className="font-semibold">{selectedDoc.warehouseName}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Tarix</span>
                <span>{formatDateTime(selectedDoc.createdAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">İcraçı</span>
                <span>{selectedDoc.createdByName}</span>
              </div>
            </div>

            {selectedDoc.notes && (
              <div className="p-2.5 bg-muted/20 rounded border border-border">
                <span className="font-semibold text-muted-foreground">Qeyd:</span> {selectedDoc.notes}
              </div>
            )}

            <div className="space-y-2">
              <h5 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                Sənəd Sətirləri ({selectedDoc.lines.length})
              </h5>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2 px-3">Məhsul</th>
                      <th className="py-2 px-2 text-center">Ölçü / Rəng</th>
                      <th className="py-2 px-2 text-center">Miqdar</th>
                      <th className="py-2 px-3 text-right">Vahid Qiymət</th>
                      <th className="py-2 px-3 text-right">Cəmi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedDoc.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 px-3 font-medium">{l.productName} ({l.variantSku})</td>
                        <td className="py-2 px-2 text-center">{l.size} / {l.color}</td>
                        <td className="py-2 px-2 text-center font-bold">{l.quantity} ədəd</td>
                        <td className="py-2 px-3 text-right">{formatMoney(l.unitCostQapik)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatMoney(l.totalCostQapik)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsDocModalOpen(false)}>
                Bağla
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Sənəd tapılmadı.</div>
        )}
      </Modal>
    </div>
  );
};
