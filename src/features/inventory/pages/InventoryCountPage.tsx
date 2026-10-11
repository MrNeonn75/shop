import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  InventoryCountSession,
  InventoryCountItem,
  InventoryCountScope,
  InventoryCountStatus,
} from '../types';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { useToast } from '../../../components/ui/useToast';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck,
  Plus,
  Barcode,
  Pause,
  Play,
  CheckCircle2,
  Undo2,
  EyeOff,
  FileCheck,
  RefreshCw,
} from 'lucide-react';

export const InventoryCountPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<InventoryCountSession[]>([]);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [activeSession, setActiveSession] = useState<InventoryCountSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // New Session Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newWarehouseId, setNewWarehouseId] = useState('');
  const [newScope, setNewScope] = useState<InventoryCountScope>('full');
  const [isBlindCount, setIsBlindCount] = useState(false);
  const [newNotes, setNewNotes] = useState('');

  // Scanning UI state
  const [scanInput, setScanInput] = useState('');
  const [lastScannedItem, setLastScannedItem] = useState<InventoryCountItem | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Recount / Variance review filter
  const [onlyVarianceFilter, setOnlyVarianceFilter] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [whs, sessionList] = await Promise.all([
        inventoryRepository.getWarehouses(),
        inventoryRepository.getCountSessions(),
      ]);
      setWarehouses(whs);
      setSessions(sessionList);
      if (whs.length > 0 && !newWarehouseId) {
        setNewWarehouseId(whs[0].id);
      }
    } catch (err) {
      console.error('Failed to load count sessions', err);
    } finally {
      setIsLoading(false);
    }
  }, [newWarehouseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartNewSession = async () => {
    try {
      const created = await inventoryRepository.createCountSession({
        warehouseId: newWarehouseId,
        scope: newScope,
        isBlindCount,
        notes: newNotes,
      });

      toast({
        type: 'success',
        title: 'Sayım Sessiyası Başladıldı',
        message: `Snapshot donduruldu. Sessiya #${created.sessionNumber} aktivdir.`,
      });

      setIsNewModalOpen(false);
      setActiveSession(created);
      await loadData();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Sayım yaradılarkən xəta baş verdi';
      toast({
        type: 'error',
        title: 'Xəta',
        message: errorMsg,
      });
    }
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !scanInput.trim()) return;

    try {
      const updated = await inventoryRepository.logCountScan(activeSession.id, {
        barcodeOrSku: scanInput.trim(),
        delta: 1,
      });

      const matched = updated.items.find(
        (i) =>
          i.variantBarcode === scanInput.trim() ||
          i.variantSku.toLowerCase() === scanInput.trim().toLowerCase()
      );
      if (matched) {
        setLastScannedItem(matched);
      }

      setActiveSession(updated);
      setScanInput('');
      toast({
        type: 'success',
        title: 'Sayım Artırıldı (+1)',
        message: matched ? `${matched.productName} (${matched.size}/${matched.color})` : 'Uğurlu scan',
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Barkod oxunmadı';
      toast({
        type: 'error',
        title: 'Oxuma Xətası',
        message: errorMsg,
      });
    }
  };

  const handleQuickAdjust = async (itemId: string, delta: number) => {
    if (!activeSession) return;
    const item = activeSession.items.find((i) => i.id === itemId);
    if (!item) return;

    try {
      const updated = await inventoryRepository.logCountScan(activeSession.id, {
        barcodeOrSku: item.variantBarcode,
        delta,
      });
      setActiveSession(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualQtyChange = async (itemId: string, qty: number) => {
    if (!activeSession) return;
    const item = activeSession.items.find((i) => i.id === itemId);
    if (!item) return;

    try {
      const updated = await inventoryRepository.logCountScan(activeSession.id, {
        barcodeOrSku: item.variantBarcode,
        delta: 0,
        manualQty: qty,
      });
      setActiveSession(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleRecount = async (itemId: string) => {
    if (!activeSession) return;
    try {
      const updated = await inventoryRepository.toggleRecountItem(activeSession.id, itemId);
      setActiveSession(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (status: InventoryCountStatus) => {
    if (!activeSession) return;
    try {
      const updated = await inventoryRepository.updateCountSessionStatus(activeSession.id, status);
      setActiveSession(updated);
      await loadData();
      toast({
        type: 'info',
        title: 'Status Yeniləndi',
        message: `Sessiya statusu: ${status}`,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveSession = async () => {
    if (!activeSession) return;
    try {
      const { session, adjustmentDocument } = await inventoryRepository.approveCountSession(
        activeSession.id,
        `cnt-approve-${Date.now()}`
      );
      setActiveSession(session);
      await loadData();

      toast({
        type: 'success',
        title: 'İnventarizasiya Təsdiqləndi',
        message: `Korreksiya sənədi #${adjustmentDocument.docNumber} yaradıldı və ledger qalıqları dəqiqləşdirildi.`,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Təsdiqləmə xətası';
      toast({
        type: 'error',
        title: 'Xəta',
        message: errorMsg,
      });
    }
  };

  // Review variance summary
  const varianceStats = React.useMemo(() => {
    if (!activeSession) return { surplusItems: 0, deficitItems: 0, netVarianceValue: 0 };
    let surplus = 0;
    let deficit = 0;
    let netValue = 0;

    for (const item of activeSession.items) {
      if (item.varianceQty > 0) surplus++;
      if (item.varianceQty < 0) deficit++;
      netValue += item.varianceValueQapik;
    }

    return { surplusItems: surplus, deficitItems: deficit, netVarianceValue: netValue };
  }, [activeSession]);

  const displayedItems = React.useMemo(() => {
    if (!activeSession) return [];
    if (onlyVarianceFilter) {
      return activeSession.items.filter((i) => i.varianceQty !== 0);
    }
    return activeSession.items;
  }, [activeSession, onlyVarianceFilter]);

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/inventory' },
          { label: 'Faktiki Sayım (İnventarizasiya)' },
        ]}
      />

      <PageHeader
        title="Faktiki İnventarizasiya və Sayım"
        description="Barkod skaner və planşetə uyğunlaşdırılmış sayım interfeysi, gizli sayım seçimi, fərq analizi və avtomatik korreksiya sənədləşməsi."
        actions={
          <div className="flex items-center gap-2">
            {activeSession && (
              <Button variant="outline" size="sm" onClick={() => setActiveSession(null)}>
                Bütün Sessiyalara Qayıt
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setIsNewModalOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Yeni Sayım Sessiyası
            </Button>
          </div>
        }
      />

      <InventoryNavHeader />

      {/* VIEW 1: ACTIVE COUNTING & VARIANCE REVIEW SCREEN */}
      {activeSession ? (
        <div className="space-y-4">
          {/* Active Session Control Bar */}
          <Card className="p-4 bg-card border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">
                    Sessiya #{activeSession.sessionNumber}
                  </h3>
                  <Badge
                    variant={
                      activeSession.status === 'active'
                        ? 'success'
                        : activeSession.status === 'paused'
                        ? 'warning'
                        : activeSession.status === 'review'
                        ? 'default'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {activeSession.status === 'active' && 'Aktiv Sayım'}
                    {activeSession.status === 'paused' && 'Fasilədədir'}
                    {activeSession.status === 'review' && 'Fərq Təhlili'}
                    {activeSession.status === 'approved' && 'Təsdiqlənib (Bağlı)'}
                  </Badge>
                  {activeSession.isBlindCount && (
                    <Badge variant="neutral" size="sm" className="inline-flex items-center gap-1">
                      <EyeOff className="h-3 w-3" />
                      Gizli Sayım
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Anbar: <span className="font-semibold text-foreground">{activeSession.warehouseName}</span> •
                  Dondurulma tarixi: {formatDateTime(activeSession.snapshotFrozenAt)}
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="flex items-center gap-2">
                {activeSession.status === 'active' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus('paused')}
                    >
                      <Pause className="mr-1.5 h-3.5 w-3.5" />
                      Fasilə Ver
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleUpdateStatus('review')}
                    >
                      <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                      Sayımı Bitir və Təhlilə Keç
                    </Button>
                  </>
                )}

                {activeSession.status === 'paused' && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleUpdateStatus('active')}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Sayımı Davam Etdir
                  </Button>
                )}

                {activeSession.status === 'review' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus('active')}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Sayımı Yenidən Aç
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleApproveSession}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Sayımı Təsdiqlə və Korreksiya Et
                    </Button>
                  </>
                )}

                {activeSession.status === 'approved' && activeSession.adjustmentDocNumber && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/inventory/ledger?docNumber=${activeSession.adjustmentDocNumber}`)}
                  >
                    <FileCheck className="mr-1.5 h-3.5 w-3.5" />
                    Korreksiya Sənədinə Bax (#{activeSession.adjustmentDocNumber})
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* TABLET & BARCODE SCANNER INTERFACE (When session is active) */}
          {activeSession.status === 'active' && (
            <Card className="p-4 border-2 border-primary/30 bg-primary/5 rounded-2xl">
              <form onSubmit={handleScanSubmit} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Barcode className="h-6 w-6 text-primary shrink-0" />
                  <span className="font-semibold text-sm text-foreground">
                    Barkod Skaneri / Planşet Sayım Paneli
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    ref={scanInputRef}
                    placeholder="Barkodu skan edin və ya SKU daxil edin..."
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    autoFocus
                    className="h-12 text-base font-mono bg-background border-primary/50 shadow-inner"
                  />
                  <Button type="submit" size="lg" className="h-12 px-6 font-semibold">
                    Scan (+1)
                  </Button>
                </div>
              </form>

              {lastScannedItem && (
                <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between text-emerald-800 dark:text-emerald-300">
                  <div>
                    Son oxunan: <span className="font-bold">{lastScannedItem.productName}</span> (
                    {lastScannedItem.size} / {lastScannedItem.color}) • Faktiki sayılmış:{' '}
                    <span className="font-bold text-sm">{lastScannedItem.countedQty} ədəd</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-emerald-700"
                    onClick={() => handleQuickAdjust(lastScannedItem.id, -1)}
                  >
                    <Undo2 className="h-3 w-3 mr-1" />
                    Sonunkunu geri al (-1)
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Variance Summary strip (in review mode) */}
          {activeSession.status === 'review' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card className="p-3 bg-card border-border">
                <div className="text-[11px] text-muted-foreground">Artıq Gələn Mallar (Surplus)</div>
                <div className="text-lg font-bold text-emerald-600 mt-0.5">
                  {varianceStats.surplusItems} SKU
                </div>
              </Card>
              <Card className="p-3 bg-card border-border">
                <div className="text-[11px] text-muted-foreground">Əskik Gələn Mallar (Deficit)</div>
                <div className="text-lg font-bold text-rose-600 mt-0.5">
                  {varianceStats.deficitItems} SKU
                </div>
              </Card>
              <Card className="p-3 bg-card border-border">
                <div className="text-[11px] text-muted-foreground">Xalis Dəyər Fərqi (Net Impact)</div>
                <div className="text-lg font-bold text-foreground mt-0.5">
                  {formatMoney(varianceStats.netVarianceValue)}
                </div>
              </Card>
              <Card className="p-3 bg-card border-border flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-muted-foreground">Filtr</div>
                  <div className="font-semibold text-xs mt-0.5">Yalnız Fərqli Sətirlər</div>
                </div>
                <Checkbox
                  checked={onlyVarianceFilter}
                  onCheckedChange={(checked) => setOnlyVarianceFilter(Boolean(checked))}
                />
              </Card>
            </div>
          )}

          {/* Items Table */}
          <Card className="overflow-hidden border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-muted/70 border-b border-border text-muted-foreground font-semibold">
                    <th className="py-3 px-3">Məhsul & SKU</th>
                    <th className="py-3 px-2 text-center">Ölçü / Rəng</th>
                    {!activeSession.isBlindCount && (
                      <th className="py-3 px-2 text-center">Gözlənilən (Sistem)</th>
                    )}
                    <th className="py-3 px-3 text-center w-40">Sayılmış Faktiki</th>
                    <th className="py-3 px-2 text-center">Fərq</th>
                    <th className="py-3 px-3 text-right">Fərq Dəyəri</th>
                    <th className="py-3 px-2 text-center">Təkrar Sayım</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayedItems.map((item) => (
                    <tr
                      key={item.id}
                      className={
                        item.recountFlag
                          ? 'bg-amber-500/10'
                          : item.varianceQty !== 0
                          ? 'bg-muted/10'
                          : 'hover:bg-muted/20'
                      }
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{item.productName}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono">{item.variantSku}</span>
                          <span>•</span>
                          <span className="font-mono">{item.variantBarcode}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-muted-foreground">
                        {item.size} / {item.color}
                      </td>
                      {!activeSession.isBlindCount && (
                        <td className="py-2.5 px-2 text-center font-medium">
                          {item.expectedQty} ədəd
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          {activeSession.status === 'active' ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 text-xs"
                                onClick={() => handleQuickAdjust(item.id, -1)}
                              >
                                -1
                              </Button>
                              <Input
                                type="number"
                                min="0"
                                value={item.countedQty}
                                onChange={(e) =>
                                  handleManualQtyChange(item.id, parseInt(e.target.value) || 0)
                                }
                                className="h-7 w-16 text-center font-bold text-xs"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 text-xs"
                                onClick={() => handleQuickAdjust(item.id, 1)}
                              >
                                +1
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-1.5 text-[10px]"
                                onClick={() => handleQuickAdjust(item.id, 5)}
                              >
                                +5
                              </Button>
                            </>
                          ) : (
                            <span className="font-bold text-sm text-foreground">
                              {item.countedQty} ədəd
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold">
                        {item.varianceQty === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : item.varianceQty > 0 ? (
                          <span className="text-emerald-600 font-bold">+{item.varianceQty}</span>
                        ) : (
                          <span className="text-rose-600 font-bold">{item.varianceQty}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {formatMoney(item.varianceValueQapik)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Checkbox
                          checked={item.recountFlag}
                          onCheckedChange={() => handleToggleRecount(item.id)}
                          disabled={activeSession.status === 'approved'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        /* VIEW 2: ALL COUNT SESSIONS LIST */
        <Card className="overflow-hidden border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/70 border-b border-border text-muted-foreground font-semibold">
                  <th className="py-3 px-3">Sessiya №</th>
                  <th className="py-3 px-3">Anbar</th>
                  <th className="py-3 px-3">Əhatə Dairəsi</th>
                  <th className="py-3 px-3">Tarix</th>
                  <th className="py-3 px-2 text-center">Sayılmış SKU</th>
                  <th className="py-3 px-3">Təşkilatçı</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Sayım sessiyaları yüklənir...
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Hələ heç bir inventarizasiya sessiyası açılmayıb.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-foreground">
                        {s.sessionNumber}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {s.warehouseName}
                      </td>
                      <td className="py-2.5 px-3 capitalize">
                        {s.scope === 'full' ? 'Tam Anbar' : s.scope === 'category' ? 'Kateqoriya' : 'Təsadüfi Seçmə'}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                        {formatDateTime(s.createdAt)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold">
                        {s.items.length} SKU
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {s.createdByName}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={
                            s.status === 'active'
                              ? 'success'
                              : s.status === 'review'
                              ? 'default'
                              : s.status === 'approved'
                              ? 'neutral'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {s.status === 'active' && 'Aktiv Sayım'}
                          {s.status === 'paused' && 'Fasilədədir'}
                          {s.status === 'review' && 'Fərq Təhlilində'}
                          {s.status === 'approved' && 'Təsdiqlənib'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setActiveSession(s)}
                        >
                          {s.status === 'approved' ? 'Nəticəyə Bax' : 'Sayıma Daxil Ol'}
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

      {/* CREATE NEW SESSION MODAL */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Yeni İnventarizasiya Sayımı Başlat"
        size="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-muted-foreground font-medium mb-1">
              Sayılacaq Anbar <span className="text-rose-500">*</span>
            </label>
            <select
              value={newWarehouseId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewWarehouseId(e.target.value)}
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
              Sayım Əhatəsi (Scope)
            </label>
            <select
              value={newScope}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewScope(e.target.value as InventoryCountScope)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="full">Tam Anbar Sayımı (Bütün Mallar)</option>
              <option value="category">Kateqoriya Üzrə Sayım</option>
              <option value="random">Təsadüfi Nümunə Sayımı (Cycle Count)</option>
            </select>
          </div>

          <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-center justify-between">
            <div>
              <span className="font-semibold block text-foreground">Gizli Sayım (Blind Count)</span>
              <span className="text-muted-foreground text-[11px]">
                Sayımı aparan işçilərə sistemdəki gözlənilən qalıq göstərilməyəcək (obyektivliyi təmin edir).
              </span>
            </div>
            <Checkbox
              checked={isBlindCount}
              onCheckedChange={(checked) => setIsBlindCount(Boolean(checked))}
            />
          </div>

          <div>
            <label className="block text-muted-foreground font-medium mb-1">Qeydlər</label>
            <Input
              placeholder="İnventarizasiya məqsədi və ya komissiya üzvləri..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsNewModalOpen(false)}>
              Ləğv Et
            </Button>
            <Button variant="default" size="sm" onClick={handleStartNewSession}>
              Snapshot Dondur və Sayıma Başla
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
