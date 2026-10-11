import React, { useState, useEffect } from 'react';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { SuspendedCart } from '../types';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { X, Clock, ArrowDownLeft } from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';

export const SuspendRecallModal: React.FC = () => {
  const user = useSessionStore((s) => s.user);
  const {
    isSuspendModalOpen,
    setSuspendModalOpen,
    isRecallModalOpen,
    setRecallModalOpen,
    items,
    customer,
    receiptDiscountType,
    receiptDiscountValue,
    activeShift,
    clearCart,
    restoreCartFromSuspended,
  } = usePosStore();

  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [suspendedList, setSuspendedList] = useState<SuspendedCart[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const branchId = activeShift?.branchId || 'branch-2';

  // Load suspended sales when Recall modal opens
  useEffect(() => {
    if (isRecallModalOpen) {
      PosService.getSuspendedSales(branchId).then(setSuspendedList);
    }
  }, [isRecallModalOpen, branchId]);

  // SUSPEND MODAL
  if (isSuspendModalOpen) {
    const handleSuspend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (items.length === 0) return;

      setIsSubmitting(true);
      try {
        await PosService.suspendSale({
          label: label.trim() || `Səbət (${customer?.name || 'Anonim'})`,
          branchId,
          cashierId: user?.id || activeShift?.cashierId || 'usr-004',
          cashierName: user?.name || activeShift?.cashierName || 'Aytən Həsənova',
          items,
          customer: customer || undefined,
          notes: notes.trim() || undefined,
          receiptDiscountType,
          receiptDiscountValue,
        });

        clearCart();
        setSuspendModalOpen(false);
        setLabel('');
        setNotes('');
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
          <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Səbəti Gözləməyə Al (F8)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSuspendModalOpen(false)}
              className="p-1.5 text-zinc-400 hover:text-white rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSuspend} className="p-5 space-y-4">
            <p className="text-xs text-zinc-400">
              Aktiv səbət ({items.length} məhsul) serverdə saxlanılacaq və növbəti müştəriyə xidmət
              göstərmək üçün kassa ekranı boşaldılacaqdır.
            </p>

            <div>
              <label className="text-[11px] text-zinc-300 block mb-1 font-semibold">
                Səbət Qeydi / Müştəri Adı:
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Məs: Qara köynəkli bəy / Masa 4"
                className="w-full h-10 bg-black border border-zinc-700 rounded px-3 text-xs text-white focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-300 block mb-1 font-semibold">
                Əlavə Qeyd (İstəyə bağlı):
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Məs: Pul çıxarmağa getdi..."
                className="w-full h-9 bg-black border border-zinc-700 rounded px-3 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSuspendModalOpen(false)}
                className="flex-1 py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold"
              >
                İmtina
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded bg-white text-black hover:bg-zinc-200 text-xs font-bold uppercase"
              >
                Gözlət və Təmizlə
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // RECALL MODAL
  if (isRecallModalOpen) {
    const handleRecall = async (cart: SuspendedCart) => {
      const recalled = await PosService.recallSuspendedSale(cart.id);
      if (recalled) {
        restoreCartFromSuspended(recalled.items, recalled.customer);
        setRecallModalOpen(false);
      }
    };

    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
      >
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-lg w-full max-h-[85vh] flex flex-col text-white shadow-2xl overflow-hidden">
          <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Gözləmədəki Səbətlər (F9)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRecallModalOpen(false)}
              className="p-1.5 text-zinc-400 hover:text-white rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-2">
            {suspendedList.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-xs">
                Gözləmədə saxlanılan səbət yoxdur
              </div>
            ) : (
              suspendedList.map((cart) => {
                const totalQapik = cart.items.reduce(
                  (sum, item) => sum + item.unitPriceQapik * item.quantity,
                  0
                );
                return (
                  <div
                    key={cart.id}
                    className="p-3 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-2">
                        <span>{cart.label}</span>
                        {cart.customer && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                            {cart.customer.name}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        {cart.items.length} məhsul · {formatMoney(totalQapik)} ·{' '}
                        {formatDateTime(cart.savedAt)}
                      </div>
                      {cart.notes && (
                        <div className="text-[10px] text-zinc-500 italic mt-0.5">
                          Qeyd: {cart.notes}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRecall(cart)}
                      className="px-3.5 py-2 rounded bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wide min-h-[40px] shrink-0"
                    >
                      Bərpa Et
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
