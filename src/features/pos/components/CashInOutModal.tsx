import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { aznToQapik, formatMoney } from '../../../shared/utils/formatters';
import { X, DollarSign, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';

export const CashInOutModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const user = useSessionStore((s) => s.user);
  const { isCashInOutModalOpen, setCashInOutModalOpen, activeShift, setActiveShift } =
    usePosStore();

  const [type, setType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCashInOutModalOpen || !activeShift) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const amountQapik = aznToQapik(amountInput);
    if (amountQapik <= 0) {
      setErrorMessage('Məbləğ sıfırdan böyük olmalıdır!');
      return;
    }

    if (!reason.trim()) {
      setErrorMessage('Səbəb qeyd edilməlidir!');
      return;
    }

    if (type === 'cash_out' && amountQapik > activeShift.expectedCashQapik) {
      setErrorMessage(
        `Kassada kifayət qədər nağd vəsait yoxdur! Cari nağd: ${formatMoney(activeShift.expectedCashQapik)}`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedShift = await PosService.recordCashTransaction({
        shiftId: activeShift.id,
        type,
        amountQapik,
        reason: reason.trim(),
        cashierId: user?.id || activeShift.cashierId,
        cashierName: user?.name || activeShift.cashierName,
        attachmentName: attachmentName.trim() || undefined,
      });

      setActiveShift(updatedShift);
      setCashInOutModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Əməliyyat zamanı xəta baş verdi';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-md w-full text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Kassa Mədaxil və Məxaric
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCashInOutModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('cash_in')}
              className={`p-2.5 rounded text-xs font-bold border transition-all ${
                type === 'cash_in'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800'
              }`}
            >
              Mədaxil (Cash In)
            </button>
            <button
              type="button"
              onClick={() => setType('cash_out')}
              className={`p-2.5 rounded text-xs font-bold border transition-all ${
                type === 'cash_out'
                  ? 'bg-red-600 text-white border-red-500'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800'
              }`}
            >
              Məxaric (Cash Out)
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
              Məbləğ (₼) *:
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
              className="w-full h-11 bg-black border border-zinc-700 rounded px-3 text-white font-mono text-base font-bold focus:outline-none focus:border-white"
              autoFocus
            />
          </div>

          {/* Reason */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
              Səbəb və ya Təyinat *:
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Məs: Kassa xırda pul tamamlama və ya İnkassasiya"
              className="w-full h-10 bg-black border border-zinc-700 rounded px-3 text-xs text-white focus:outline-none"
            />
          </div>

          {/* Attachment / Doc ref */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
              Qaimə / Əlavə Qeyd (İstəyə bağlı):
            </label>
            <input
              type="text"
              value={attachmentName}
              onChange={(e) => setAttachmentName(e.target.value)}
              placeholder="Məs: Qaimə №-1428"
              className="w-full h-9 bg-black border border-zinc-700 rounded px-3 text-xs text-white focus:outline-none"
            />
          </div>

          {/* Error */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-red-950/80 border border-red-800 rounded text-red-200 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setCashInOutModalOpen(false)}
              className="flex-1 py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold"
            >
              {t('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded bg-white text-black hover:bg-zinc-200 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('actions.confirm')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
