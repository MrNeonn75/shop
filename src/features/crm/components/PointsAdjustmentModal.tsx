import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Customer } from '../types';
import { pointsAdjustmentSchema } from '../schemas/crmSchemas';
import { AlertTriangle, Award, Plus, Minus } from 'lucide-react';

interface PointsAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  onSubmit: (delta: number, reason: string) => Promise<void>;
}

export const PointsAdjustmentModal: React.FC<PointsAdjustmentModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSubmit,
}) => {
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [amount, setAmount] = useState<number>(20);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const delta = direction === 'add' ? amount : -amount;
  const newBalance = customer.pointsBalance + delta;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parse = pointsAdjustmentSchema.safeParse({ pointsDelta: delta, reason });
    if (!parse.success) {
      setError(parse.error.issues[0]?.message || 'Məlumatları düzgün daxil edin');
      return;
    }

    if (newBalance < 0) {
      setError('Müştərinin balı mənfi ola bilməz');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(delta, reason);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta baş verdi';
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
          <Award className="h-5 w-5 text-primary" />
          <span>Loyallıq Balı Əl ilə Düzəlişi</span>
        </div>
      }
      description={`${customer.firstName} ${customer.lastName} (${customer.customerCode}) üçün bal korreksiyası.`}
      maxWidth="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saxlanılır...' : 'Düzəlişi Təsdiqlə'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {error && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex rounded-md border border-border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setDirection('add')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
              direction === 'add'
                ? 'bg-success/20 text-success font-bold shadow-xs'
                : 'text-muted-foreground'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Bal Əlavə Et
          </button>
          <button
            type="button"
            onClick={() => setDirection('subtract')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
              direction === 'subtract'
                ? 'bg-destructive/20 text-destructive font-bold shadow-xs'
                : 'text-muted-foreground'
            }`}
          >
            <Minus className="h-3.5 w-3.5" />
            Bal Sil
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Bal Miqdarı *</label>
          <input
            type="number"
            min="1"
            max="500"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
          />
        </div>

        <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Cari Balans:</span>
            <span className="font-semibold text-foreground">{customer.pointsBalance} bal</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Dəyişiklik:</span>
            <span
              className={`font-semibold ${
                direction === 'add' ? 'text-success' : 'text-destructive'
              }`}
            >
              {direction === 'add' ? `+${amount}` : `-${amount}`} bal
            </span>
          </div>
          <div className="pt-1 border-t border-border/50 flex justify-between font-bold text-foreground">
            <span>Yeni Balans:</span>
            <span className="text-primary">{newBalance} bal</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            Əsaslandırma Səbəbi *
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Məs: Kassa gecikməsinə görə kompensasiya və ya xüsusi ad günü hədiyyəsi..."
            className="w-full text-xs rounded-md border border-input bg-background p-2"
          />
        </div>
      </form>
    </Modal>
  );
};

