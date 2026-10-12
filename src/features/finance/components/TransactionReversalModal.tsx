import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { formatMoney } from '../../../shared/utils/formatters';
import { Qapik } from '../../../shared/utils/money';

interface TransactionReversalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  documentNumber: string;
  amountQapik: Qapik;
  description: string;
  typeLabel?: string;
  isSubmitting?: boolean;
}

export const TransactionReversalModal: React.FC<TransactionReversalModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  documentNumber,
  amountQapik,
  description,
  typeLabel = 'Maliyyə Əməliyyatı',
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!reason || reason.trim().length < 5) {
      setError('Ləğvetmə səbəbi ən azı 5 simvol olmalıdır.');
      return;
    }
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ləğvetmə zamanı xəta baş verdi.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Əməliyyatın Ləğvi (Storno) — ${documentNumber}`}
    >
      <div className="space-y-4">
        {/* Compliance Warning */}
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-red-900 dark:text-red-200">
              Qeydlər silinmir! Əks (Storno) əməliyyat tərtib olunur.
            </p>
            <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
              Maliyyə və kassa hərəkətlərinin audit bütövlüyünü təmin etmək üçün təsdiqlənmiş qeydlər fiziki olaraq silinmir.
              Bu əməliyyat üçün əks istiqamətli bərabər storno qeydi yaradılacaq və hesab balansı avtomatik bərpa olunacaq.
            </p>
          </div>
        </div>

        {/* Transaction Summary */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3.5 space-y-2 border border-slate-200 dark:border-slate-800 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Növ:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{typeLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Sənəd №:</span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{documentNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Məbləğ:</span>
            <span className="font-mono font-semibold text-red-600 dark:text-red-400">
              {formatMoney(amountQapik)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Təsvir:</span>
            <span className="text-slate-700 dark:text-slate-300 line-clamp-1">{description}</span>
          </div>
        </div>

        {/* Reason Input */}
        <div className="space-y-1.5">
          <label htmlFor="reversal-reason-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Ləğvetmə Səbəbi <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reversal-reason-input"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Məsələn: Səhv bank hesabına köçürmə qeydə alınıb və ya kassir tərəfindən yanlış məbləğ daxil edilib..."
            className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            İmtina
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Ləğv Et (Storno Yarat)
          </Button>
        </div>
      </div>
    </Modal>
  );
};

