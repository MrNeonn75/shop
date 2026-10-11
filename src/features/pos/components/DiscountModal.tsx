import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { LineDiscountType } from '../types';
import { aznToQapik } from '../../../shared/utils/money';
import { X, Percent, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

const CASHIER_MAX_PERCENT = 5;
const CASHIER_MAX_FIXED_QAPIK = 1000; // 10.00 AZN

export const DiscountModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    isDiscountModalOpen,
    setDiscountModalOpen,
    selectedItemId,
    items,
    setLineDiscount,
    setReceiptDiscount,
    promoCode,
    setPromoCode,
  } = usePosStore();

  const [target, setTarget] = useState<'receipt' | 'line'>('receipt');
  const [discountType, setDiscountType] = useState<LineDiscountType>('percent');
  const [discountValueInput, setDiscountValueInput] = useState<string>('5');
  const [reasonCode, setReasonCode] = useState<string>('Müştəri məmnuniyyəti');
  const [managerPin, setManagerPin] = useState<string>('');
  const [customPromoInput, setCustomPromoInput] = useState<string>(promoCode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isDiscountModalOpen) return null;

  const selectedItem = items.find((i) => i.id === selectedItemId);

  // Check if discount exceeds cashier limit
  const numValue = parseFloat(discountValueInput) || 0;
  const isPercent = discountType === 'percent';
  const exceedsCashierLimit = isPercent
    ? numValue > CASHIER_MAX_PERCENT
    : aznToQapik(numValue) > CASHIER_MAX_FIXED_QAPIK;

  const handleApply = () => {
    setErrorMessage(null);

    if (numValue <= 0 && !customPromoInput.trim()) {
      setErrorMessage('Endirim dəyəri daxil edilməlidir!');
      return;
    }

    if (!reasonCode.trim()) {
      setErrorMessage('Endirim səbəbi mütləq seçilməlidir!');
      return;
    }

    // If exceeds cashier limit, verify manager PIN
    if (exceedsCashierLimit) {
      if (managerPin !== '9999' && managerPin !== '1234') {
        setErrorMessage('Menecer PIN kodu yanlışdır! (Limitdən artıq endirim üçün menecer təsdiqi tələb olunur)');
        return;
      }
    }

    // Apply promo code if provided
    if (customPromoInput.trim()) {
      setPromoCode(customPromoInput.trim());
    }

    if (numValue > 0) {
      const storedValue = isPercent ? numValue : aznToQapik(numValue);
      if (target === 'line' && selectedItem) {
        setLineDiscount(selectedItem.id, discountType, storedValue);
      } else {
        setReceiptDiscount(discountType, storedValue);
      }
    }

    setDiscountModalOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-lg w-full text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              {t('discount.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setDiscountModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Target: Receipt vs Selected Line Item */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTarget('receipt')}
              className={`p-2.5 rounded text-xs font-bold border transition-all ${
                target === 'receipt'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-850'
              }`}
            >
              Bütün Çekə Endirim
            </button>
            <button
              type="button"
              disabled={!selectedItem}
              onClick={() => setTarget('line')}
              className={`p-2.5 rounded text-xs font-bold border transition-all ${
                target === 'line'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-850 disabled:opacity-40'
              }`}
            >
              {selectedItem ? `Sətir: ${selectedItem.productName.slice(0, 15)}...` : 'Sətir Seçilməyib'}
            </button>
          </div>

          {/* Discount Type: Percent vs Fixed AZN */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDiscountType('percent')}
              className={`p-2.5 rounded text-xs font-bold border transition-all ${
                discountType === 'percent'
                  ? 'bg-zinc-800 text-white border-zinc-600'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              {t('discount.percent')}
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('fixed')}
              className={`p-2.5 rounded text-xs font-bold border transition-all ${
                discountType === 'fixed'
                  ? 'bg-zinc-800 text-white border-zinc-600'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              {t('discount.fixed')}
            </button>
          </div>

          {/* Value Input */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
              {t('discount.value')} ({discountType === 'percent' ? '%' : '₼'}):
            </label>
            <input
              type="number"
              step={discountType === 'percent' ? '1' : '0.1'}
              min="0"
              max={discountType === 'percent' ? '100' : '9999'}
              value={discountValueInput}
              onChange={(e) => setDiscountValueInput(e.target.value)}
              className="w-full h-11 bg-black border border-zinc-700 rounded px-3 text-white font-mono text-base font-bold focus:outline-none focus:border-white"
            />
          </div>

          {/* Reason Code (Required) */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
              {t('discount.reason')} *:
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full h-10 bg-black border border-zinc-700 rounded px-3 text-xs text-white focus:outline-none"
            >
              <option value="Müştəri məmnuniyyəti">Müştəri məmnuniyyəti</option>
              <option value="Mövsümi sonluq endirimi">Mövsümi sonluq endirimi</option>
              <option value="Defekt / Qüsur kompensasiyası">Defekt / Qüsur kompensasiyası</option>
              <option value="Topdan alış xüsusi razılaşması">Topdan alış xüsusi razılaşması</option>
              <option value="Rəhbərlik göstərişi">Rəhbərlik göstərişi</option>
            </select>
          </div>

          {/* Promo Code Input */}
          <div className="pt-2 border-t border-zinc-850">
            <label className="text-[11px] text-zinc-400 block mb-1 font-semibold">
              Aktiv Promokod (Kupon):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customPromoInput}
                onChange={(e) => setCustomPromoInput(e.target.value)}
                placeholder="Məs: YAY2026 və ya SALE20"
                className="flex-1 h-9 bg-black border border-zinc-700 rounded px-2.5 text-xs text-white uppercase font-mono"
              />
            </div>
            <span className="text-[10px] text-zinc-500 mt-0.5 block">
              Sınaq üçün: YAY2026 (-15 ₼) və ya SALE20 (-20%)
            </span>
          </div>

          {/* Manager Approval Notice if exceeding limit */}
          {exceedsCashierLimit && (
            <div className="p-3 bg-amber-950/40 border border-amber-800 rounded space-y-2">
              <div className="text-xs text-amber-300 font-bold flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t('discount.managerApprovalRequired')}</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Kassir üçün icazə verilən maksimum endirim {CASHIER_MAX_PERCENT}% və ya{' '}
                {CASHIER_MAX_FIXED_QAPIK / 100} ₼ təşkil edir.
              </p>
              <div>
                <label className="text-[11px] text-zinc-300 block mb-1 font-semibold">
                  {t('discount.managerPin')}:
                </label>
                <input
                  type="password"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="Menecer PIN (məs: 9999)..."
                  className="w-full h-9 bg-black border border-amber-700 rounded px-2.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-red-950/80 border border-red-800 rounded text-red-200 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDiscountModalOpen(false)}
            className="px-4 py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs min-h-[48px]"
          >
            {t('actions.cancel')}
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2.5 rounded bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 min-h-[48px] transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('actions.apply')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
