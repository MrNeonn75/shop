import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Checkbox } from '../../../components/ui/Checkbox';
import { InventoryNavHeader } from '../components/InventoryNavHeader';
import { inventoryRepository } from '../../../shared/adapters';
import {
  StockDocument,
  StockDocumentType,
  StockDocumentLine,
  StockBalance,
} from '../types';
import { SEEDED_CATALOG_PRODUCTS } from '../../catalog/data/taxonomyData';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { multiplyMoney } from '../../../shared/utils/money';
import { usePermission } from '../../../shared/hooks/usePermission';
import { useToast } from '../../../components/ui/useToast';
import {
  Plus,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  Trash2,
  History,
  ShieldAlert,
  Search,
} from 'lucide-react';

export const StockDocumentsPage: React.FC = () => {
  const { toast } = useToast();
  const { can, user } = usePermission();

  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [currentBalances, setCurrentBalances] = useState<StockBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');

  // Modal State for New Document
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [docType, setDocType] = useState<StockDocumentType>('receipt');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [allowNegativeOverride, setAllowNegativeOverride] = useState(false);
  const [negativeOverrideReason, setNegativeOverrideReason] = useState('');
  const [lines, setLines] = useState<StockDocumentLine[]>([]);
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; sizeBytes: number; uploadedAt: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Detail Modal
  const [selectedDoc, setSelectedDoc] = useState<StockDocument | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Variant selector search inside create modal
  const [variantSearch, setVariantSearch] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docs, whs, bals] = await Promise.all([
        inventoryRepository.getStockDocuments({
          type: filterType,
          status: filterStatus,
          warehouseId: filterWarehouse,
        }),
        inventoryRepository.getWarehouses(),
        inventoryRepository.getStockBalances(),
      ]);
      setDocuments(docs);
      setWarehouses(whs);
      setCurrentBalances(bals);
      if (whs.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(whs[0].id);
      }
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterStatus, filterWarehouse, selectedWarehouseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreateModal = () => {
    setDocType('receipt');
    setReasonCode('');
    setNotes('');
    setAllowNegativeOverride(false);
    setNegativeOverrideReason('');
    setLines([]);
    setAttachments([]);
    setValidationError(null);
    setIsCreateModalOpen(true);
  };

  const handleAddLine = (variantId: string) => {
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

    // Look up current balance at selected warehouse
    const currentBal = currentBalances.find(
      (b) => b.variantId === foundVar!.id && b.warehouseId === selectedWarehouseId
    );
    const onHand = currentBal ? currentBal.onHand : 0;

    const newLine: StockDocumentLine = {
      id: `line-${Date.now()}-${Math.random()}`,
      productId: foundProd.id,
      productName: foundProd.name,
      variantId: foundVar.id,
      variantSku: foundVar.sku,
      variantBarcode: foundVar.barcode,
      size: foundVar.size,
      color: foundVar.color,
      quantity: 1,
      currentOnHand: onHand,
      unitCostQapik: foundProd.costPriceQapik,
      totalCostQapik: foundProd.costPriceQapik,
      classification: 'resalable',
    };

    setLines([...lines, newLine]);
    setVariantSearch('');
  };

  const handleRemoveLine = (id: string) => {
    setLines(lines.filter((l) => l.id !== id));
  };

  const handleUpdateLineQty = (id: string, qty: number) => {
    setLines(
      lines.map((l) => {
        if (l.id !== id) return l;
        const validQty = Math.max(1, qty);
        return {
          ...l,
          quantity: validQty,
          totalCostQapik: multiplyMoney(l.unitCostQapik, validQty),
        };
      })
    );
  };

  const handleUpdateLineClassification = (
    id: string,
    cls: 'resalable' | 'damaged' | 'restricted'
  ) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, classification: cls } : l)));
  };

  const handleAddMockAttachment = () => {
    const newAtt = {
      id: `att-${Date.now()}`,
      name: `sened_elave_${attachments.length + 1}.pdf`,
      sizeBytes: 85400,
      uploadedAt: new Date().toISOString(),
    };
    setAttachments([...attachments, newAtt]);
  };

  const handleSubmit = async (targetStatus: 'draft' | 'confirmed') => {
    setValidationError(null);

    if (lines.length === 0) {
      setValidationError('Ən azı 1 məhsul sətiri əlavə edilməlidir.');
      return;
    }

    // Adjustment documents require reason code
    if (docType === 'adjustment' && !reasonCode.trim()) {
      setValidationError('Korreksiya sənədi üçün səbəb kodu seçilməsi məcburidir.');
      return;
    }

    // Negative stock check preview for outgoing types
    const isOutgoing = docType === 'issue' || docType === 'damaged' || docType === 'lost';
    if (isOutgoing && !allowNegativeOverride) {
      for (const l of lines) {
        if (l.quantity > l.currentOnHand) {
          setValidationError(
            `Yetərsiz qalıq: ${l.productName} (${l.variantSku}) üçün mövcud qalıq ${l.currentOnHand} ədəd, tələb olunan ${l.quantity} ədəd. Mənfi qalıq bloklanıb.`
          );
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `doc-create-${Date.now()}-${Math.random()}`;
      await inventoryRepository.createStockDocument(
        {
          type: docType,
          status: targetStatus,
          warehouseId: selectedWarehouseId,
          reasonCode: reasonCode || undefined,
          notes: notes || undefined,
          allowNegativeStockOverride: allowNegativeOverride,
          negativeOverrideReason: allowNegativeOverride ? negativeOverrideReason : undefined,
          lines,
          attachments,
          createdById: user?.id || 'usr-001',
          createdByName: user?.name || 'Kamran Əliyev',
        },
        idempotencyKey
      );

      toast({
        type: 'success',
        title: targetStatus === 'confirmed' ? 'Sənəd təsdiqləndi' : 'Qaralama saxlanıldı',
        message:
          targetStatus === 'confirmed'
            ? 'Anbar hərəkətləri uğurla baş kitaba (ledger) yazıldı.'
            : 'Sənəd qaralama statusunda yadda saxlanıldı.',
      });

      setIsCreateModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Sənəd yaradılarkən xəta baş verdi';
      setValidationError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmExistingDraft = async (docId: string) => {
    try {
      await inventoryRepository.confirmStockDocument(docId, `doc-confirm-${Date.now()}`);
      toast({
        type: 'success',
        title: 'Sənəd təsdiqləndi',
        message: 'Hərəkətlər ledgerə yazıldı və qalıqlar yeniləndi.',
      });
      await loadData();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Təsdiqləmə xətası';
      toast({
        type: 'error',
        title: 'Təsdiqləmə uğursuz oldu',
        message: errorMsg,
      });
    }
  };

  const getDocTypeBadge = (type: StockDocumentType) => {
    switch (type) {
      case 'receipt':
        return <Badge variant="success" size="sm">Qəbul (Non-purchase)</Badge>;
      case 'issue':
        return <Badge variant="danger" size="sm">Silinmə</Badge>;
      case 'adjustment':
        return <Badge variant="warning" size="sm">Korreksiya</Badge>;
      case 'damaged':
        return <Badge variant="danger" size="sm">Zədəli Mal</Badge>;
      case 'lost':
        return <Badge variant="danger" size="sm">İtmiş Mal</Badge>;
      case 'return_classification':
        return <Badge variant="default" size="sm">Qaytarılma Təsnifatı</Badge>;
      case 'opening':
        return <Badge variant="default" size="sm">İlkin Qalıq</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/inventory' },
          { label: 'Anbar Sənədləri' },
        ]}
      />

      <PageHeader
        title="Anbar Sənədləri (Daxilolma, Silinmə, Korreksiya)"
        description="Qeyri-satınalma qəbulları, daxili silinmələr, zədəli və itmiş mallar, qaytarılma təsnifatı və inventarizasiya aktları."
        actions={
          <Button variant="default" size="sm" onClick={handleOpenCreateModal}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Sənəd Tərtib Et
          </Button>
        }
      />

      <InventoryNavHeader />

      {/* Filter Bar */}
      <Card className="p-3.5 bg-card border-border">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={filterType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterType(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Sənəd Növləri</option>
            <option value="receipt">Qəbul (İlkin / Qeyri-satınalma)</option>
            <option value="issue">Silinmə</option>
            <option value="adjustment">Korreksiya</option>
            <option value="damaged">Zədəli Mal Qeydiyyatı</option>
            <option value="lost">İtmiş Mal Qeydiyyatı</option>
            <option value="return_classification">Qaytarılmış Malların Təsnifatı</option>
            <option value="opening">İlkin Qalıq Aktı</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Statuslar</option>
            <option value="confirmed">Təsdiqlənmiş (Ledgerə yazılıb)</option>
            <option value="draft">Qaralama</option>
          </select>

          <select
            value={filterWarehouse}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterWarehouse(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Bütün Anbarlar</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Documents List Table */}
      <Card className="overflow-hidden border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-muted/70 border-b border-border text-muted-foreground font-semibold">
                <th className="py-3 px-3">Sənəd №</th>
                <th className="py-3 px-3">Növ</th>
                <th className="py-3 px-3">Anbar</th>
                <th className="py-3 px-3">Tarix</th>
                <th className="py-3 px-2 text-center">Sətir Sayı</th>
                <th className="py-3 px-3 text-right">Cəmi Məbləğ</th>
                <th className="py-3 px-3">İcraçı</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    Sənədlər yüklənir...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    Heç bir anbar sənədi tapılmadı.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-semibold text-foreground">
                      {doc.docNumber}
                    </td>
                    <td className="py-2.5 px-3">{getDocTypeBadge(doc.type)}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-foreground">{doc.warehouseName}</div>
                      <div className="text-[10px] text-muted-foreground">{doc.branchName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                      {formatDateTime(doc.createdAt)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-medium">
                      {doc.lines.length} bənd
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {formatMoney(doc.totalValueQapik)}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {doc.createdByName}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {doc.status === 'confirmed' ? (
                        <Badge variant="success" size="sm">Təsdiqlənib</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Qaralama</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setSelectedDoc(doc);
                            setIsDetailModalOpen(true);
                          }}
                        >
                          Baxış & Audit
                        </Button>
                        {doc.status === 'draft' && (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleConfirmExistingDraft(doc.id)}
                          >
                            Təsdiqlə
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* CREATE NEW DOCUMENT MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Yeni Anbar Sənədi Tərtibi"
        size="xl"
      >
        <div className="space-y-4 text-xs">
          {validationError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Form Header Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/40 rounded-xl border border-border">
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Sənəd Növü <span className="text-rose-500">*</span>
              </label>
              <select
                value={docType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDocType(e.target.value as StockDocumentType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="receipt">Qəbul (İlkin / Qeyri-satınalma)</option>
                <option value="issue">Silinmə (İstifadə / Xərcləmə)</option>
                <option value="adjustment">Korreksiya / Düzəliş (Sayım xətası)</option>
                <option value="damaged">Zədəli Malların Qeydiyyatı</option>
                <option value="lost">İtmiş / Əskik Malların Qeydiyyatı</option>
                <option value="return_classification">Müştəri Qaytarması Təsnifatı</option>
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Anbar <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedWarehouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Səbəb Kodu {docType === 'adjustment' && <span className="text-rose-500">*</span>}
              </label>
              <Input
                placeholder="məs. sayim_ferqi, zedeli, daxili_istifade"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Line Items Selection & Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Məhsul Sətirləri ({lines.length})
              </h5>
              <span className="text-[11px] text-muted-foreground">
                Kataloqdan variant seçin və miqdarı daxil edin
              </span>
            </div>

            {/* Autocomplete-like variant adder */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Məhsul adı, SKU və ya barkod axtarın..."
                  value={variantSearch}
                  onChange={(e) => setVariantSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>

            {/* Search results dropdown/list */}
            {variantSearch.trim().length > 1 && (
              <div className="max-h-36 overflow-y-auto border border-border rounded-lg bg-card shadow-md divide-y divide-border">
                {SEEDED_CATALOG_PRODUCTS.flatMap((p) =>
                  p.variants.filter(
                    (v) =>
                      p.name.toLowerCase().includes(variantSearch.toLowerCase()) ||
                      v.sku.toLowerCase().includes(variantSearch.toLowerCase()) ||
                      v.barcode.includes(variantSearch)
                  ).map((v) => ({ product: p, variant: v }))
                ).slice(0, 8).map(({ product, variant }) => (
                  <div
                    key={variant.id}
                    onClick={() => handleAddLine(variant.id)}
                    className="p-2 hover:bg-muted flex items-center justify-between cursor-pointer text-xs"
                  >
                    <div>
                      <span className="font-semibold">{product.name}</span>{' '}
                      <span className="text-muted-foreground font-mono">({variant.sku})</span>
                      <span className="ml-2 text-muted-foreground">
                        Ölçü: {variant.size}, Rəng: {variant.color}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                      + Əlavə et
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Lines Table */}
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Məhsul & SKU</th>
                    <th className="py-2.5 px-2 text-center">Ölçü / Rəng</th>
                    <th className="py-2.5 px-2 text-center">Cari Qalıq</th>
                    <th className="py-2.5 px-2 text-center w-28">Miqdar</th>
                    {docType === 'return_classification' && (
                      <th className="py-2.5 px-2 text-center">Təsnifat</th>
                    )}
                    <th className="py-2.5 px-3 text-right">Maya Dəyəri</th>
                    <th className="py-2.5 px-3 text-right">Cəmi</th>
                    <th className="py-2.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-muted-foreground">
                        Hələ heç bir məhsul əlavə edilməyib. Yuxarıdakı axtarışdan variant seçin.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const isNegativeRisk =
                        (docType === 'issue' || docType === 'damaged' || docType === 'lost') &&
                        line.quantity > line.currentOnHand;

                      return (
                        <tr
                          key={line.id}
                          className={isNegativeRisk ? 'bg-rose-500/10' : 'hover:bg-muted/20'}
                        >
                          <td className="py-2 px-3 font-medium text-foreground">
                            <div>{line.productName}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {line.variantSku}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center text-muted-foreground">
                            {line.size} / {line.color}
                          </td>
                          <td className="py-2 px-2 text-center font-bold">
                            {line.currentOnHand} ədəd
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) =>
                                handleUpdateLineQty(line.id, parseInt(e.target.value) || 1)
                              }
                              className={`h-7 text-center font-bold text-xs ${
                                isNegativeRisk ? 'border-rose-500 text-rose-600' : ''
                              }`}
                            />
                            {isNegativeRisk && (
                              <span className="text-[9px] text-rose-600 block mt-0.5">
                                Qalıqdan artıq!
                              </span>
                            )}
                          </td>
                          {docType === 'return_classification' && (
                            <td className="py-2 px-2 text-center">
                              <select
                                value={line.classification || 'resalable'}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                  handleUpdateLineClassification(
                                    line.id,
                                    e.target.value as 'resalable' | 'damaged' | 'restricted'
                                  )
                                }
                                className="flex h-7 rounded-md border border-input bg-background px-2 py-0 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                <option value="resalable">Yararlı (Satışa qaytar)</option>
                                <option value="damaged">Zədəli (Qüsurlu anbar)</option>
                                <option value="restricted">Məhdud / Ekspertiza</option>
                              </select>
                            </td>
                          )}
                          <td className="py-2 px-3 text-right text-muted-foreground">
                            {formatMoney(line.unitCostQapik)}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-foreground">
                            {formatMoney(line.totalCostQapik)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600"
                              onClick={() => handleRemoveLine(line.id)}
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
          </div>

          {/* Negative Stock Override Panel (Visible for privileged users if requested decrease exceeds onHand) */}
          {(can('inventory.stock.adjust') || can('superadmin')) && (
            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="chk-override"
                  checked={allowNegativeOverride}
                  onCheckedChange={(checked) => setAllowNegativeOverride(Boolean(checked))}
                />
                <label
                  htmlFor="chk-override"
                  className="font-semibold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                  Mənfi Stok İcazəsi (Privileged Override)
                </label>
              </div>
              {allowNegativeOverride && (
                <div className="pl-6 space-y-1">
                  <span className="text-[11px] text-muted-foreground block">
                    Mənfi qalığa icazə verilməsi üçün mütləq səbəb (minimum 5 simvol):
                  </span>
                  <Input
                    placeholder="məs. Sənəd daxilolmasında texniki gecikmə, fiziki mal artıq vitrindədir..."
                    value={negativeOverrideReason}
                    onChange={(e) => setNegativeOverrideReason(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Notes & Attachments */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-muted-foreground font-medium mb-1">Qeydlər</label>
              <Input
                placeholder="Sənədlə bağlı əlavə izahat..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-muted-foreground font-medium">Qoşmalar / Sənəd Faylları</label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={handleAddMockAttachment}
                >
                  <Paperclip className="h-3 w-3 mr-1" />
                  + Fayl Əlavə Et
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((att) => (
                  <Badge key={att.id} variant="neutral" size="sm" className="text-[10px]">
                    {att.name}
                  </Badge>
                ))}
                {attachments.length === 0 && (
                  <span className="text-muted-foreground text-[11px]">Qoşma yoxdur</span>
                )}
              </div>
            </div>
          </div>

          {/* Total Value Summary */}
          <div className="flex items-center justify-between p-3 bg-muted/60 rounded-xl border border-border">
            <span className="font-semibold text-foreground">Sənədin Ümumi Maya Dəyəri:</span>
            <span className="text-base font-bold text-foreground">
              {formatMoney(
                lines.reduce((sum, l) => sum + (l.totalCostQapik || 0), 0)
              )}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsCreateModalOpen(false)}
            >
              Ləğv Et
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleSubmit('draft')}
            >
              Qaralama Saxla
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleSubmit('confirmed')}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {isSubmitting ? 'İcra olunur...' : 'Təsdiqlə və Ledgerə Yaz'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* DETAIL & AUDIT MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedDoc ? `Sənəd #${selectedDoc.docNumber} Detalları və Auditi` : 'Sənəd Detalı'}
        size="lg"
      >
        {selectedDoc && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-xl border border-border">
              <div>
                <span className="text-muted-foreground block text-[10px]">Sənəd Növü</span>
                <span className="font-semibold">{selectedDoc.type}</span>
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
                <span className="text-muted-foreground block text-[10px]">Status</span>
                <Badge variant={selectedDoc.status === 'confirmed' ? 'success' : 'neutral'} size="sm">
                  {selectedDoc.status}
                </Badge>
              </div>
            </div>

            {/* Audit Trail */}
            <div className="space-y-2">
              <h5 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Audit Tarixçəsi
              </h5>
              <div className="space-y-1.5 border border-border rounded-lg p-2.5 bg-muted/20">
                {selectedDoc.auditTrail.map((trail) => (
                  <div key={trail.id} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{trail.userName}</span>
                      <span className="text-muted-foreground">({trail.action})</span>
                      {trail.details && <span className="text-foreground">— {trail.details}</span>}
                    </div>
                    <span className="text-muted-foreground">{formatDateTime(trail.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sətirlər */}
            <div className="space-y-1.5">
              <h5 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                Sənəd Sətirləri ({selectedDoc.lines.length})
              </h5>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/60 text-muted-foreground border-b border-border font-semibold">
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
                        <td className="py-2 px-3 font-medium">
                          {l.productName} ({l.variantSku})
                        </td>
                        <td className="py-2 px-2 text-center">
                          {l.size} / {l.color}
                        </td>
                        <td className="py-2 px-2 text-center font-bold">{l.quantity} ədəd</td>
                        <td className="py-2 px-3 text-right">{formatMoney(l.unitCostQapik)}</td>
                        <td className="py-2 px-3 text-right font-semibold">
                          {formatMoney(l.totalCostQapik)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsDetailModalOpen(false)}>
                Bağla
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
