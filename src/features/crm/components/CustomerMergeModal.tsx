import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Customer } from '../types';
import { formatMoney, toQapik } from '../../../shared/utils/formatters';
import { AlertTriangle, GitMerge, ShieldCheck } from 'lucide-react';

interface CustomerMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCustomer?: Customer;
  allCustomers: Customer[];
  onMerge: (sourceId: string, targetId: string, reason: string) => Promise<void>;
}

export const CustomerMergeModal: React.FC<CustomerMergeModalProps> = ({
  isOpen,
  onClose,
  currentCustomer,
  allCustomers,
  onMerge,
}) => {
  const [sourceId, setSourceId] = useState<string>(
    currentCustomer ? '' : allCustomers[1]?.id || ''
  );
  const [targetId, setTargetId] = useState<string>(
    currentCustomer?.id || allCustomers[0]?.id || ''
  );
  const [reason, setReason] = useState<string>('Dublikat telefon nömrəsi və ya müştəri müraciəti');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceCustomer = allCustomers.find((c) => c.id === sourceId);
  const targetCustomer = allCustomers.find((c) => c.id === targetId);

  // Preview combined metrics
  const combinedPoints = (targetCustomer?.pointsBalance || 0) + (sourceCustomer?.pointsBalance || 0);
  const combinedSpendQapik = toQapik(
    (targetCustomer?.totalSpentQapik || 0) + (sourceCustomer?.totalSpentQapik || 0)
  );
  const combinedOrders = (targetCustomer?.ordersCount || 0) + (sourceCustomer?.ordersCount || 0);

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sourceId || !targetId) {
      setError('Hər iki müştəri seçilməlidir');
      return;
    }
    if (sourceId === targetId) {
      setError('Eyni müştərini özü ilə birləşdirmək mümkün deyil');
      return;
    }
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Birləşdirmənin səbəbi (audit üçün) ən azı 5 simvol olmalıdır');
      return;
    }

    setIsSubmitting(true);
    try {
      await onMerge(sourceId, targetId, reason);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Birləşdirmə zamanı xəta baş verdi';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-primary" />
          <span>Müştəri Profillərini Birləşdir (Merge)</span>
        </div>
      }
      description="Dublikat kartların balanslarını və sifariş tarixçəsini vahid əsas hesaba konsolidasiya edin."
      maxWidth="lg"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button size="sm" onClick={handleMergeSubmit} disabled={isSubmitting || !sourceId || !targetId}>
            <GitMerge className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'Birləşdirilir...' : 'Birləşdirməni Təsdiqlə'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleMergeSubmit} className="space-y-4 py-2">
        {error && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Target Customer (Kept) */}
          <div className="p-3.5 rounded-lg border-2 border-primary/40 bg-primary/5 space-y-2">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider block">
              1. Əsas Müştəri (Saxlanılacaq)
            </span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full text-xs rounded-md border border-input bg-background p-2"
            >
              <option value="">Müştəri seçin...</option>
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === sourceId}>
                  {c.firstName} {c.lastName} ({c.phone}) - {c.customerCode}
                </option>
              ))}
            </select>

            {targetCustomer && (
              <div className="pt-2 border-t border-border/50 text-xs space-y-1 text-muted-foreground">
                <div>Balans: <span className="font-semibold text-foreground">{targetCustomer.pointsBalance} bal</span></div>
                <div>Cəmi Xərcləmə: <span className="font-mono text-foreground">{formatMoney(targetCustomer.totalSpentQapik)}</span></div>
                <div>Sifariş sayı: <span className="font-semibold text-foreground">{targetCustomer.ordersCount}</span></div>
                <div>Status: <span className="capitalize font-semibold text-primary">{targetCustomer.tier}</span></div>
              </div>
            )}
          </div>

          {/* Source Customer (Merged into Target) */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              2. Köməkçi Dublikat (Birləşdirilib Bağlanacaq)
            </span>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full text-xs rounded-md border border-input bg-background p-2"
            >
              <option value="">Dublikat müştərini seçin...</option>
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === targetId}>
                  {c.firstName} {c.lastName} ({c.phone}) - {c.customerCode}
                </option>
              ))}
            </select>

            {sourceCustomer && (
              <div className="pt-2 border-t border-border/50 text-xs space-y-1 text-muted-foreground">
                <div>Balans: <span className="font-semibold text-foreground">+{sourceCustomer.pointsBalance} bal</span></div>
                <div>Cəmi Xərcləmə: <span className="font-mono text-foreground">+{formatMoney(sourceCustomer.totalSpentQapik)}</span></div>
                <div>Sifariş sayı: <span className="font-semibold text-foreground">+{sourceCustomer.ordersCount}</span></div>
                <div>Status: <span className="capitalize text-muted-foreground">{sourceCustomer.tier}</span></div>
              </div>
            )}
          </div>
        </div>

        {/* Combined Outcome Preview */}
        {targetCustomer && sourceCustomer && (
          <div className="p-3.5 rounded-lg border border-success/30 bg-success/5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <ShieldCheck className="h-4 w-4" />
              Birləşmədən Sonrakı Əsas Profil Xülasəsi:
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded bg-background border border-border">
                <div className="text-muted-foreground text-[11px]">Yekun Balans</div>
                <div className="text-sm font-bold text-foreground mt-0.5">{combinedPoints} bal</div>
              </div>
              <div className="p-2 rounded bg-background border border-border">
                <div className="text-muted-foreground text-[11px]">Yekun Xərcləmə</div>
                <div className="text-sm font-bold font-mono text-primary mt-0.5">{formatMoney(combinedSpendQapik)}</div>
              </div>
              <div className="p-2 rounded bg-background border border-border">
                <div className="text-muted-foreground text-[11px]">Yekun Sifarişlər</div>
                <div className="text-sm font-bold text-foreground mt-0.5">{combinedOrders} sifariş</div>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            Birləşdirmə Səbəbi (Audit Qeydi) *
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Məs: Kassada təkrar nömrə ilə açılmış kartın əsas profilə inteqrasiyası"
            className="w-full text-xs rounded-md border border-input bg-background p-2"
          />
        </div>
      </form>
    </Modal>
  );
};
