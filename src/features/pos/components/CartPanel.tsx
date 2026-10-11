import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { formatMoney } from '../../../shared/utils/formatters';
import {
  Trash2,
  Plus,
  Minus,
  User,
  Tag,
  Percent,
  Clock,
  ArrowDownLeft,
  CreditCard,
  Sparkles,
  X,
} from 'lucide-react';

export const CartPanel: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    items,
    selectedItemId,
    setSelectedItemId,
    updateQuantity,
    removeItem,
    clearCart,
    customer,
    setCustomer,
    appliedPromotions,
    totals,
    setPaymentModalOpen,
    setCustomerModalOpen,
    setDiscountModalOpen,
    setSuspendModalOpen,
    setRecallModalOpen,
    receiptDiscountType,
    receiptDiscountValue,
    setReceiptDiscount,
  } = usePosStore();

  const handlePayClick = () => {
    if (items.length === 0) return;
    setPaymentModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden select-none">
      {/* Top Cart Bar: Customer Tag & Clear Cart */}
      <div className="p-3 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        {/* Customer Badge */}
        {customer ? (
          <div className="flex items-center gap-2 bg-zinc-800 px-3 py-1.5 rounded border border-zinc-700 min-h-[44px]">
            <User className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>{customer.name}</span>
                <span className="text-[10px] font-mono uppercase bg-amber-400 text-black px-1.5 py-0.2 rounded font-black">
                  {customer.tier}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                {customer.phone} · Bonus: {(customer.pointsAvailable / 100).toFixed(2)} ₼ ({customer.pointsAvailable} xal)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCustomer(null)}
              className="ml-2 text-zinc-400 hover:text-white p-1"
              title="Müştərini ayır"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCustomerModalOpen(true)}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 min-h-[44px]"
          >
            <User className="w-4 h-4 text-zinc-400" />
            <span>Müştəri Seç (F2)</span>
          </button>
        )}

        {/* Clear Cart */}
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 px-2.5 py-1.5 rounded transition-colors font-medium min-h-[40px] flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('cart.clearCart')}</span>
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-850 p-2">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center p-6">
            <CreditCard className="w-12 h-12 mb-3 stroke-1 text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-400">{t('cart.emptyCart')}</p>
            <p className="text-xs text-zinc-600 mt-1">Barkod oxudun və ya F2 ilə müştəri seçin</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => {
              const isSelected = selectedItemId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`p-3 rounded border transition-all ${
                    isSelected
                      ? 'bg-zinc-900 border-white ring-1 ring-white'
                      : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-850'
                  }`}
                >
                  {/* Row 1: Title, Variant, Remove */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white truncate leading-tight">
                        {item.productName}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mt-0.5">
                        <span className="uppercase text-zinc-300">{item.sku}</span>
                        <span>·</span>
                        <span className="bg-zinc-850 px-1.5 py-0.2 rounded text-zinc-200">
                          {item.size} / {item.color}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      aria-label="Səbətdən sil"
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                      title="Sil (Del)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Row 2: Price, Qty Stepper, Line Discount, Line Total */}
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-zinc-850/80 flex-wrap">
                    {/* Unit Price */}
                    <div className="text-xs font-mono text-zinc-300">
                      <span className="text-zinc-500 mr-1">Qiymət:</span>
                      <span className="font-semibold text-white">{formatMoney(item.unitPriceQapik)}</span>
                    </div>

                    {/* Quantity Stepper (min 48px touch friendly) */}
                    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-750 rounded p-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(item.id, item.quantity - 1);
                        }}
                        aria-label="Sayı azalt"
                        className="w-9 h-9 rounded bg-zinc-800 hover:bg-zinc-700 active:bg-white active:text-black flex items-center justify-center text-white transition-colors"
                        title="Azalt (-)"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <span className="w-10 text-center font-bold text-sm font-mono tabular-nums">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(item.id, item.quantity + 1);
                        }}
                        aria-label="Sayı artır"
                        className="w-9 h-9 rounded bg-zinc-800 hover:bg-zinc-700 active:bg-white active:text-black flex items-center justify-center text-white transition-colors"
                        title="Artır (+)"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Line Total */}
                    <div className="text-right">
                      {item.lineDiscountAmountQapik > 0 && (
                        <div className="text-[10px] text-amber-400 font-mono">
                          -{formatMoney(item.lineDiscountAmountQapik)}
                        </div>
                      )}
                      <div className="text-sm font-bold font-mono text-white tabular-nums">
                        {formatMoney(item.lineTotalQapik)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary & Active Promotions Breakdown */}
      <div className="bg-zinc-900 border-t border-zinc-800 p-3 shrink-0">
        {/* Applied Promotions */}
        {appliedPromotions.length > 0 && (
          <div className="mb-2 pb-2 border-b border-zinc-800/80 space-y-1">
            {appliedPromotions.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs text-emerald-400 font-medium"
              >
                <div className="flex items-center gap-1 truncate">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </div>
                <span className="font-mono tabular-nums shrink-0">
                  -{formatMoney(p.discountQapik)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Receipt Level Discount if applied */}
        {receiptDiscountType !== 'none' && (
          <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              <span>
                Xüsusi Çek Endirimi ({receiptDiscountType === 'percent' ? `${receiptDiscountValue}%` : formatMoney(receiptDiscountValue)})
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono">-{formatMoney(totals.receiptDiscountQapik)}</span>
              <button
                type="button"
                onClick={() => setReceiptDiscount('none', 0)}
                className="text-zinc-400 hover:text-white"
                title="Ləğv et"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Breakdown Totals */}
        <div className="space-y-1 text-xs text-zinc-400">
          <div className="flex justify-between">
            <span>{t('cart.subtotal')} ({totals.itemCount} əd.):</span>
            <span className="font-mono text-zinc-200 tabular-nums">{formatMoney(totals.subtotalQapik)}</span>
          </div>

          {totals.totalDiscountQapik > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>{t('cart.discounts')}:</span>
              <span className="font-mono tabular-nums">-{formatMoney(totals.totalDiscountQapik)}</span>
            </div>
          )}

          <div className="flex justify-between text-zinc-400">
            <span>{t('cart.vat')}:</span>
            <span className="font-mono tabular-nums">{formatMoney(totals.taxQapik)}</span>
          </div>
        </div>

        {/* Grand Total */}
        <div className="mt-2 pt-2 border-t border-zinc-750 flex items-baseline justify-between">
          <span className="text-sm font-bold tracking-tight uppercase text-zinc-300">
            {t('cart.grandTotal')}:
          </span>
          <span className="text-2xl font-black font-mono text-white tracking-tight tabular-nums">
            {formatMoney(totals.grandTotalQapik)}
          </span>
        </div>
      </div>

      {/* POS Touch Action Bar (min 48px height touch targets) */}
      <div className="p-2.5 bg-zinc-950 border-t border-zinc-800 shrink-0">
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          {/* F2 Customer */}
          <button
            type="button"
            onClick={() => setCustomerModalOpen(true)}
            className="flex flex-col items-center justify-center p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 min-h-[48px] text-xs font-semibold transition-colors"
          >
            <User className="w-4 h-4 mb-0.5 text-blue-400" />
            <span>Müştəri (F2)</span>
          </button>

          {/* F4 Discount */}
          <button
            type="button"
            onClick={() => setDiscountModalOpen(true)}
            className="flex flex-col items-center justify-center p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 min-h-[48px] text-xs font-semibold transition-colors"
          >
            <Percent className="w-4 h-4 mb-0.5 text-amber-400" />
            <span>Endirim (F4)</span>
          </button>

          {/* F8 Suspend */}
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => setSuspendModalOpen(true)}
            className="flex flex-col items-center justify-center p-2 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-zinc-200 hover:text-white border border-zinc-800 min-h-[48px] text-xs font-semibold transition-colors"
          >
            <Clock className="w-4 h-4 mb-0.5 text-zinc-400" />
            <span>Gözlət (F8)</span>
          </button>

          {/* F9 Recall */}
          <button
            type="button"
            onClick={() => setRecallModalOpen(true)}
            className="flex flex-col items-center justify-center p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 min-h-[48px] text-xs font-semibold transition-colors"
          >
            <ArrowDownLeft className="w-4 h-4 mb-0.5 text-emerald-400" />
            <span>Geri Çağır (F9)</span>
          </button>
        </div>

        {/* F10 Pay Button (Massive touch CTA min 60px) */}
        <button
          type="button"
          disabled={items.length === 0}
          onClick={handlePayClick}
          className="w-full min-h-[60px] rounded bg-white hover:bg-zinc-200 active:bg-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-lg tracking-wide uppercase flex items-center justify-center gap-3 transition-all shadow-lg"
        >
          <CreditCard className="w-6 h-6" />
          <span>{t('actions.pay')}</span>
          <span className="font-mono text-xl tabular-nums">
            {formatMoney(totals.grandTotalQapik)}
          </span>
        </button>
      </div>
    </div>
  );
};
