import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { TransferStepper } from '../components/TransferStepper';
import { TransferPrintModal } from '../components/TransferPrintModal';
import { ConflictRetryDialog } from '../../../shared/components/ConflictRetryDialog';
import { transferRepository } from '../../../shared/adapters';
import { Transfer } from '../types';
import { useToast } from '../../../components/ui/useToast';
import {
  Printer,
  CheckCircle2,
  XCircle,
  Truck,
  Barcode,
  PackageCheck,
  Ban,
} from 'lucide-react';

export const TransferDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Print Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Concurrency conflict dialog
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);

  // Reject / Cancel modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Picking state
  const [pickingItems, setPickingItems] = useState<
    Array<{ itemId: string; pickedQty: number; shortPickReason?: string }>
  >([]);

  // Receiving state
  const [receivingItems, setReceivingItems] = useState<
    Array<{
      itemId: string;
      receivedQty: number;
      damagedQty: number;
      missingQty: number;
      discrepancyReason?: string;
    }>
  >([]);
  const [receiveScanInput, setReceiveScanInput] = useState('');
  const [isSubmittingReceive, setIsSubmittingReceive] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await transferRepository.getTransferById(id);
      if (!data) {
        navigate('/transfers');
        return;
      }
      setTransfer(data);

      // Initialize picking items
      setPickingItems(
        data.items.map((i) => ({
          itemId: i.id,
          pickedQty: i.pickedQty > 0 ? i.pickedQty : i.requestedQty,
          shortPickReason: i.shortPickReason || '',
        }))
      );

      // Initialize receiving items: default receivedQty to remaining in transit
      setReceivingItems(
        data.items.map((i) => ({
          itemId: i.id,
          receivedQty: i.remainingInTransit > 0 ? i.remainingInTransit : 0,
          damagedQty: 0,
          missingQty: 0,
          discrepancyReason: '',
        }))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actions
  const handleApprove = async () => {
    if (!transfer) return;
    try {
      const updated = await transferRepository.approveTransfer(
        transfer.id,
        'Baş menecer tərəfindən təsdiqləndi',
        `tr-app-${Date.now()}`
      );
      setTransfer(updated);
      toast({
        type: 'success',
        title: 'Transfer Təsdiqləndi',
        message: 'Mallar anbar yığımı (picking) mərhələsinə keçirildi.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta';
      if (msg.includes('409') || msg.includes('Konflikt')) {
        setIsConflictDialogOpen(true);
      } else {
        toast({ type: 'error', title: 'Xəta', message: msg });
      }
    }
  };

  const handleReject = async () => {
    if (!transfer || !rejectionReason.trim()) return;
    try {
      const updated = await transferRepository.rejectTransfer(
        transfer.id,
        rejectionReason.trim(),
        `tr-rej-${Date.now()}`
      );
      setTransfer(updated);
      setIsRejectModalOpen(false);
      toast({
        type: 'info',
        title: 'Transfer İmtina Edildi',
        message: 'Transfer sorğusu rədd edildi və rezervasiya ləğv edildi.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta';
      toast({ type: 'error', title: 'Xəta', message: msg });
    }
  };

  const handleStartPicking = async () => {
    if (!transfer) return;
    try {
      const updated = await transferRepository.startPicking(transfer.id, `tr-pick-${Date.now()}`);
      setTransfer(updated);
      toast({
        type: 'info',
        title: 'Yığıma Başlandı',
        message: 'Barkod oxuyucu ilə malları skan edərək yığımı tamamlayın.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta';
      toast({ type: 'error', title: 'Xəta', message: msg });
    }
  };

  const handleDispatch = async () => {
    if (!transfer) return;
    try {
      // First persist any picking quantity updates
      await transferRepository.updatePicking(transfer.id, { items: pickingItems });

      // Then dispatch transfer
      const updated = await transferRepository.dispatchTransfer(
        transfer.id,
        `tr-disp-${Date.now()}`
      );
      setTransfer(updated);

      toast({
        type: 'success',
        title: 'Mallar Yola Salındı (Tranzitdədir)',
        message: 'Mal mənbə anbarı tərk etdi, tranzitdədir.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta';
      if (msg.includes('409') || msg.includes('Konflikt')) {
        setIsConflictDialogOpen(true);
      } else {
        toast({ type: 'error', title: 'Xəta', message: msg });
      }
    }
  };

  const handleReceiveScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transfer || !receiveScanInput.trim()) return;

    const input = receiveScanInput.trim().toLowerCase();
    const item = transfer.items.find(
      (i) => i.variantBarcode.toLowerCase() === input || i.variantSku.toLowerCase() === input
    );

    if (item) {
      setReceivingItems((prev) =>
        prev.map((pi) =>
          pi.itemId === item.id
            ? { ...pi, receivedQty: Math.min(item.dispatchedQty, pi.receivedQty + 1) }
            : pi
        )
      );
      toast({
        type: 'success',
        title: 'Skan Qəbul Edildi (+1)',
        message: `${item.productName} (${item.size}/${item.color})`,
      });
      setReceiveScanInput('');
    } else {
      toast({
        type: 'error',
        title: 'Barkod Uyğun Gəlmir',
        message: 'Bu barkod cari transfer sənədindəki mallar arasında yoxdur.',
      });
    }
  };

  const handleConfirmReceive = async () => {
    if (!transfer) return;

    // Validate that received + damaged + missing doesn't exceed in-transit
    for (const line of receivingItems) {
      const orig = transfer.items.find((i) => i.id === line.itemId);
      if (!orig) continue;

      const totalThisStep = line.receivedQty + line.damagedQty + line.missingQty;
      if (totalThisStep > orig.remainingInTransit) {
        toast({
          type: 'error',
          title: 'Say Uyğunsuzluğu',
          message: `${orig.productName}: Yolda olan saydan (${orig.remainingInTransit}) artıq qəbul edilə bilməz.`,
        });
        return;
      }

      if ((line.damagedQty > 0 || line.missingQty > 0) && !line.discrepancyReason?.trim()) {
        toast({
          type: 'error',
          title: 'İzahat Mütləqdir',
          message: `${orig.productName}: Zədəli və ya əskik mallar üçün səbəb qeyd edilməlidir.`,
        });
        return;
      }
    }

    setIsSubmittingReceive(true);
    try {
      const idempotencyKey = `tr-rcv-${transfer.id}-${Date.now()}`;
      const updated = await transferRepository.receiveTransfer(
        transfer.id,
        { items: receivingItems },
        idempotencyKey
      );
      setTransfer(updated);

      toast({
        type: 'success',
        title: updated.status === 'received' ? 'Transfer Tam Qəbul Edildi' : 'Qismən Qəbul Edildi',
        message:
          updated.status === 'received'
            ? 'Bütün mallar təyinat anbarına daxil edildi və ledger hərəkətləri qeydə alındı.'
            : 'Qəbul edilən mallar anbara daxil edildi, qalanı tranzitdə saxlanıldı.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Qəbul zamanı xəta';
      if (msg.includes('409') || msg.includes('Konflikt') || msg.includes('təkrarlana bilməz')) {
        setIsConflictDialogOpen(true);
      } else {
        toast({ type: 'error', title: 'Qəbul Xətası', message: msg });
      }
    } finally {
      setIsSubmittingReceive(false);
    }
  };

  const handleCancelTransfer = async () => {
    if (!transfer || !cancellationReason.trim()) return;
    try {
      const updated = await transferRepository.cancelTransfer(
        transfer.id,
        cancellationReason.trim(),
        `tr-cancel-${Date.now()}`
      );
      setTransfer(updated);
      setIsCancelModalOpen(false);
      toast({
        type: 'info',
        title: 'Transfer Ləğv Edildi',
        message: 'Rezerv edilmiş mallar mənbə anbarında sərbəst buraxıldı.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta';
      toast({ type: 'error', title: 'Xəta', message: msg });
    }
  };

  if (isLoading || !transfer) {
    return (
      <div className="py-16 text-center text-muted-foreground text-xs">
        Transfer məlumatları yüklənir...
      </div>
    );
  }

  const isDispatchedOrInTransit =
    transfer.status === 'dispatched' ||
    transfer.status === 'in_transit' ||
    transfer.status === 'partially_received';

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Filial Transferləri', href: '/transfers' },
          { label: `Transfer #${transfer.transferNumber}` },
        ]}
      />

      <PageHeader
        title={`Transfer Sorğusu #${transfer.transferNumber}`}
        description={`${transfer.sourceWarehouseName} ➔ ${transfer.destinationWarehouseName} istiqamətində yerdəyişmə.`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsPrintModalOpen(true)}>
              <Printer className="mr-2 h-4 w-4" />
              Transfer Qaiməsini Çap Et
            </Button>
            {(transfer.status === 'draft' ||
              transfer.status === 'submitted' ||
              transfer.status === 'approved') && (
              <Button
                variant="outline"
                size="sm"
                className="text-rose-600 border-rose-300 dark:border-rose-800"
                onClick={() => setIsCancelModalOpen(true)}
              >
                <Ban className="mr-1.5 h-4 w-4" />
                Transferi Ləğv Et
              </Button>
            )}
          </div>
        }
      />

      {/* STEPPER COMPONENT WITH TIMESTAMPS AND ACTORS */}
      <TransferStepper status={transfer.status} timeline={transfer.timeline} />

      {/* DISPATCH TRANSIT NOTICE BANNER */}
      {isDispatchedOrInTransit && transfer.status !== 'received' && (
        <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-sm">Mal mənbə anbarı tərk etdi, tranzitdədir</div>
              <div className="text-[11px] mt-0.5 opacity-90">
                Mallar mənbə anbarın ({transfer.sourceWarehouseName}) faktiki qalığından silinib və təyinat anbarında təhvil təsdiqini gözləyir.
              </div>
            </div>
          </div>
          <Badge variant="default" className="bg-blue-600 text-white font-mono">
            Yoldadır
          </Badge>
        </div>
      )}

      {/* WORKFLOW ACTION PANELS BASED ON CURRENT STATUS */}

      {/* PANEL 1: APPROVAL ACTION (for managers when submitted) */}
      {transfer.status === 'submitted' && (
        <Card className="p-4 bg-muted/40 border-border flex items-center justify-between">
          <div className="text-xs">
            <div className="font-bold text-foreground">Rəhbərlik Təsdiqi Tələb Olunur</div>
            <div className="text-muted-foreground mt-0.5">
              Sorğunu təsdiqləyərək anbar heyətinə yığım tapşırığı verin və ya imtina edin.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-rose-600"
              onClick={() => setIsRejectModalOpen(true)}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              İmtina Et
            </Button>
            <Button variant="default" size="sm" onClick={handleApprove}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Təsdiqlə və Yığıma Ötür
            </Button>
          </div>
        </Card>
      )}

      {/* PANEL 2: PICKING START (when approved) */}
      {transfer.status === 'approved' && (
        <Card className="p-4 bg-muted/40 border-border flex items-center justify-between">
          <div className="text-xs">
            <div className="font-bold text-foreground">Transfer Təsdiqlənib: Yığıma Başlamaq Lazımdır</div>
            <div className="text-muted-foreground mt-0.5">
              Anbardar mənbə anbarda ({transfer.sourceWarehouseName}) malların fiziki yığımına başlaya bilər.
            </div>
          </div>
          <Button variant="default" size="sm" onClick={handleStartPicking}>
            <PackageCheck className="mr-1.5 h-4 w-4" />
            Yığıma Başla
          </Button>
        </Card>
      )}

      {/* PANEL 3: PICKING INTERFACE & DISPATCH (when picking) */}
      {transfer.status === 'picking' && (
        <Card className="p-4 border-2 border-amber-500/30 bg-amber-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                <Barcode className="h-4 w-4 text-amber-600" />
                Mənbə Anbarda Fiziki Yığım (Picking)
              </div>
              <div className="text-muted-foreground mt-0.5">
                Malların faktiki yığılan sayını daxil edin. Əgər mal əskik çıxarsa səbəbini qeyd edin.
              </div>
            </div>
            <Button variant="default" size="sm" onClick={handleDispatch}>
              <Truck className="mr-1.5 h-4 w-4" />
              Yola Sal (Dispatched)
            </Button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Məhsul</th>
                  <th className="py-2.5 px-2 text-center">Ölçü / Rəng</th>
                  <th className="py-2.5 px-2 text-center">Tələb Olunan</th>
                  <th className="py-2.5 px-2 text-center w-32">Yığılan Say</th>
                  <th className="py-2.5 px-3">Əskik Yığım Səbəbi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfer.items.map((item) => {
                  const pickItem = pickingItems.find((p) => p.itemId === item.id);
                  const pickedQty = pickItem ? pickItem.pickedQty : item.requestedQty;
                  const isShort = pickedQty < item.requestedQty;

                  return (
                    <tr key={item.id}>
                      <td className="py-2.5 px-3 font-semibold text-foreground">
                        {item.productName}
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {item.variantSku}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-muted-foreground">
                        {item.size} / {item.color}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold">
                        {item.requestedQty} ədəd
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Input
                          type="number"
                          min="0"
                          max={item.requestedQty}
                          value={pickedQty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setPickingItems((prev) =>
                              prev.map((pi) =>
                                pi.itemId === item.id ? { ...pi, pickedQty: val } : pi
                              )
                            );
                          }}
                          className={`h-7 text-center font-bold text-xs ${
                            isShort ? 'border-amber-500 text-amber-600' : ''
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        {isShort ? (
                          <Input
                            placeholder="məs. Vitrində tapılmadı, zədəli aşkarlandı..."
                            value={pickItem?.shortPickReason || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPickingItems((prev) =>
                                prev.map((pi) =>
                                  pi.itemId === item.id ? { ...pi, shortPickReason: val } : pi
                                )
                              );
                            }}
                            className="h-7 text-xs bg-background"
                          />
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* PANEL 4: DESTINATION RECEIVING INTERFACE (when dispatched, in transit, or partially received) */}
      {isDispatchedOrInTransit && transfer.status !== 'received' && (
        <Card className="p-4 border-2 border-emerald-500/30 bg-emerald-500/5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                <PackageCheck className="h-5 w-5 text-emerald-600" />
                Təyinat Anbarında Təhvil Qəbul Paneli ({transfer.destinationWarehouseName})
              </div>
              <div className="text-muted-foreground mt-0.5">
                Barkodla və ya əllə faktiki salamat, zədəli və ya əskik malları qeyd edin. Qismən qəbul dəstəklənir.
              </div>
            </div>

            <Button
              variant="default"
              size="sm"
              disabled={isSubmittingReceive}
              onClick={handleConfirmReceive}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {isSubmittingReceive ? 'Qəbul Təsdiqlənir...' : 'Təhvili Təsdiqlə (Ledgerə Yaz)'}
            </Button>
          </div>

          {/* Quick scan input */}
          <form onSubmit={handleReceiveScan} className="flex gap-2 max-w-md">
            <div className="relative flex-1">
              <Barcode className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Qəbul üçün barkodu skan edin..."
                value={receiveScanInput}
                onChange={(e) => setReceiveScanInput(e.target.value)}
                className="pl-8 h-8 text-xs font-mono bg-background"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm" className="h-8">
              +1 Qəbul
            </Button>
          </form>

          {/* Receiving Lines Table */}
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Məhsul</th>
                  <th className="py-2.5 px-2 text-center">Yolda Olan (Tranzit)</th>
                  <th className="py-2.5 px-2 text-center w-28">Yararlı Qəbul</th>
                  <th className="py-2.5 px-2 text-center w-24">Zədəli Say</th>
                  <th className="py-2.5 px-2 text-center w-24">Əskik / İtmiş</th>
                  <th className="py-2.5 px-3">Fərq İzahatı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfer.items.map((item) => {
                  const lineRec = receivingItems.find((r) => r.itemId === item.id);
                  const rcv = lineRec?.receivedQty || 0;
                  const dmg = lineRec?.damagedQty || 0;
                  const mis = lineRec?.missingQty || 0;
                  const hasDiscrepancy = dmg > 0 || mis > 0;

                  return (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{item.productName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {item.variantSku} ({item.size}/{item.color})
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-blue-600">
                        {item.remainingInTransit} ədəd
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Input
                          type="number"
                          min="0"
                          max={item.remainingInTransit}
                          value={rcv}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setReceivingItems((prev) =>
                              prev.map((pi) =>
                                pi.itemId === item.id ? { ...pi, receivedQty: val } : pi
                              )
                            );
                          }}
                          className="h-7 text-center font-bold text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Input
                          type="number"
                          min="0"
                          max={item.remainingInTransit}
                          value={dmg}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setReceivingItems((prev) =>
                              prev.map((pi) =>
                                pi.itemId === item.id ? { ...pi, damagedQty: val } : pi
                              )
                            );
                          }}
                          className={`h-7 text-center font-bold text-xs ${
                            dmg > 0 ? 'border-rose-500 text-rose-600' : ''
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Input
                          type="number"
                          min="0"
                          max={item.remainingInTransit}
                          value={mis}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setReceivingItems((prev) =>
                              prev.map((pi) =>
                                pi.itemId === item.id ? { ...pi, missingQty: val } : pi
                              )
                            );
                          }}
                          className={`h-7 text-center font-bold text-xs ${
                            mis > 0 ? 'border-rose-500 text-rose-600' : ''
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        {hasDiscrepancy ? (
                          <Input
                            placeholder="Zədə və ya çatışmazlıq səbəbini qeyd edin..."
                            value={lineRec?.discrepancyReason || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setReceivingItems((prev) =>
                                prev.map((pi) =>
                                  pi.itemId === item.id
                                    ? { ...pi, discrepancyReason: val }
                                    : pi
                                )
                              );
                            }}
                            className="h-7 text-xs bg-background"
                          />
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px]">Fərq yoxdur</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ITEMS OVERVIEW TABLE */}
      <Card className="overflow-hidden border-border bg-card">
        <div className="p-3 border-b border-border bg-muted/40 font-semibold text-xs flex justify-between items-center">
          <span>Transfer Sənədinin Ümumi Siyahısı ({transfer.items.length} SKU)</span>
          <span className="text-muted-foreground text-[11px]">
            Tələb olunan: {transfer.items.reduce((acc, i) => acc + i.requestedQty, 0)} ədəd
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
              <tr>
                <th className="py-2.5 px-3">Məhsul</th>
                <th className="py-2.5 px-3">SKU & Barkod</th>
                <th className="py-2.5 px-2 text-center">Ölçü / Rəng</th>
                <th className="py-2.5 px-2 text-center">Tələb</th>
                <th className="py-2.5 px-2 text-center">Yığılan</th>
                <th className="py-2.5 px-2 text-center">Yola Salınan</th>
                <th className="py-2.5 px-2 text-center">Qəbul Edilən</th>
                <th className="py-2.5 px-2 text-center">Tranzitdə Qalan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transfer.items.map((i) => (
                <tr key={i.id} className="hover:bg-muted/20">
                  <td className="py-2 px-3 font-semibold text-foreground">{i.productName}</td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">
                    {i.variantSku} <span className="text-[10px]">({i.variantBarcode})</span>
                  </td>
                  <td className="py-2 px-2 text-center">{i.size} / {i.color}</td>
                  <td className="py-2 px-2 text-center font-medium">{i.requestedQty} ədəd</td>
                  <td className="py-2 px-2 text-center font-medium">{i.pickedQty || 0}</td>
                  <td className="py-2 px-2 text-center font-medium">{i.dispatchedQty || 0}</td>
                  <td className="py-2 px-2 text-center font-bold text-emerald-600">
                    {i.receivedQty || 0}
                  </td>
                  <td className="py-2 px-2 text-center font-bold text-blue-600">
                    {i.remainingInTransit || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* PRINT WAYBILL MODAL */}
      <TransferPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        transfer={transfer}
      />

      {/* 409 CONFLICT RETRY MODAL */}
      <ConflictRetryDialog
        isOpen={isConflictDialogOpen}
        onClose={() => setIsConflictDialogOpen(false)}
        onRefresh={loadData}
        message="Bu transfer başqa bir istifadəçi və ya anbar prosesi tərəfindən artıq yenilənmiş və ya qəbul edilmişdir."
      />

      {/* REJECT MODAL */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Transfer Sorğusuna İmtina"
        size="sm"
      >
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            İmtina səbəbini qeyd edin. Mənbə anbarda rezerv edilmiş mallar sərbəst buraxılacaq.
          </p>
          <Input
            placeholder="İmtina səbəbi (məs. Mənbə anbarda faktiki ehtiyac var)..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="text-xs"
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsRejectModalOpen(false)}>
              Bağla
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!rejectionReason.trim()}
              onClick={handleReject}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              İmtinanı Təsdiqlə
            </Button>
          </div>
        </div>
      </Modal>

      {/* CANCEL MODAL */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Transferin Ləğvi"
        size="sm"
      >
        <div className="space-y-3 text-xs">
          <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
            <span className="font-semibold block">Nəticələr:</span>
            Transfer ləğv edildikdə mənbə anbarda saxlanılmış bütün rezervasiyalar ləğv olunur və mallar sərbəst satışa qayıdır.
          </div>
          <div>
            <label className="block text-muted-foreground font-medium mb-1">Ləğv Səbəbi</label>
            <Input
              placeholder="məs. Sifariş verən filialın tələbi ləğv edildi..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsCancelModalOpen(false)}>
              Geri
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!cancellationReason.trim()}
              onClick={handleCancelTransfer}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Transferi Ləğv Et
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
