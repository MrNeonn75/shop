import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { Tender, TenderType } from '../types';
import { toQapik, formatMoney, aznToQapik } from '../../../shared/utils/formatters';
import {
  X,
  CreditCard,
  Banknote,
  Wallet,
  Gift,
  Plus,
  Trash2,
  AlertCircle,
  WifiOff,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

export const PaymentModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    isPaymentModalOpen,
    setPaymentModalOpen,
    items,
    totals,
    customer,
    activeShift,
    isOnline,
    currentIdempotencyKey,
    setActiveReceipt,
    setReceiptPrintModalOpen,
    clearCart,
    receiptDiscountType,
    receiptDiscountValue,
    promoCode,
    redeemPoints,
  } = usePosStore();

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [selectedTenderType, setSelectedTenderType] = useState<TenderType>('cash');
  const [tenderAmountInput, setTenderAmountInput] = useState<string>('');
  const [cardAuthReference, setCardAuthReference] = useState<string>('');
  const [cashTenderedInput, setCashTenderedInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const grandTotal = totals.grandTotalQapik;
  const totalPaid = tenders.reduce((sum, t) => sum + t.amountQapik, 0);
  const remainingDue = Math.max(0, grandTotal - totalPaid);

  const terminalConfig = PosService.getTerminalConfig();

  // Reset or preset default tender when modal opens
  useEffect(() => {
    if (isPaymentModalOpen) {
      setTenders([]);
      setSelectedTenderType('cash');
      setTenderAmountInput((remainingDue / 100).toFixed(2));
      setCashTenderedInput((remainingDue / 100).toFixed(2));
      setCardAuthReference('');
      setErrorMessage(null);
      setIsProcessing(false);
    }
  }, [isPaymentModalOpen, remainingDue]);

  // Update suggested input when remaining due changes
  useEffect(() => {
    if (remainingDue > 0) {
      setTenderAmountInput((remainingDue / 100).toFixed(2));
      if (selectedTenderType === 'cash') {
        setCashTenderedInput((remainingDue / 100).toFixed(2));
      }
    }
  }, [remainingDue, selectedTenderType]);

  if (!isPaymentModalOpen) return null;

  // Change calculation for cash
  const cashTenderedQapik = aznToQapik(cashTenderedInput);
  const cashTenderLine = tenders.find((t) => t.type === 'cash');
  const cashOwed = cashTenderLine ? cashTenderLine.amountQapik : remainingDue;
  const changeDueQapik = toQapik(Math.max(0, cashTenderedQapik - cashOwed));

  // Quick cash buttons
  const quickCashPresets = [
    { label: t('payment.exact'), value: remainingDue },
    { label: '10 ₼', value: 1000 },
    { label: '20 ₼', value: 2000 },
    { label: '50 ₼', value: 5000 },
    { label: '100 ₼', value: 10000 },
    { label: '200 ₼', value: 20000 },
  ];

  const handleAddTender = () => {
    setErrorMessage(null);
    const amountQapik = aznToQapik(tenderAmountInput);
    if (amountQapik <= 0) {
      setErrorMessage('Ödəniş məbləği sıfırdan böyük olmalıdır!');
      return;
    }

    if (amountQapik > remainingDue) {
      setErrorMessage(
        `Ödəniş məbləği qalıq borcdan (${formatMoney(remainingDue)}) çox ola bilməz. Sürətli nağd qalıq hesablanması üçün nağd sayılan xanasından istifadə edin.`
      );
      return;
    }

    // Check card payment terminal requirement
    if (selectedTenderType === 'card') {
      if (!terminalConfig.isConfigured) {
        if (!cardAuthReference.trim()) {
          setErrorMessage(
            `${t('payment.terminalNotConfigured')}. Əməliyyat üçün xarici POS terminal qəbz nömrəsi (RRN / Təsdiq kodu) daxil edilməlidir!`
          );
          return;
        }
      }
    }

    const newTender: Tender = {
      type: selectedTenderType,
      amountQapik,
      referenceNumber: selectedTenderType === 'card' ? cardAuthReference.trim() : undefined,
    };

    setTenders((prev) => [...prev, newTender]);
    setCardAuthReference('');
  };

  const handleRemoveTender = (index: number) => {
    setTenders((prev) => prev.filter((_, i) => i !== index));
    setErrorMessage(null);
  };

  const handleFinalizeSale = async () => {
    if (!isOnline) {
      setErrorMessage('Şəbəkə bağlantısı yoxdur. Oflayn satışın tamamlanması qadağandır!');
      return;
    }

    if (!activeShift || activeShift.status !== 'open') {
      setErrorMessage('Aktiv açıq növbə olmadan satış tamamlana bilməz!');
      return;
    }

    if (totalPaid !== grandTotal) {
      setErrorMessage(`Ödəniş tam ödənilməyib! Qalıq borc: ${formatMoney(remainingDue)}`);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Send request using idempotencyKey
      const receipt = await PosService.processSale({
        shiftId: activeShift.id,
        branchId: activeShift.branchId,
        registerId: activeShift.registerId,
        cashierId: activeShift.cashierId,
        cashierName: activeShift.cashierName,
        items,
        customer: customer || undefined,
        tenders,
        cashTenderedQapik: cashTenderedQapik > 0 ? cashTenderedQapik : undefined,
        changeDueQapik: changeDueQapik > 0 ? changeDueQapik : undefined,
        receiptDiscountType,
        receiptDiscountValue,
        idempotencyKey: currentIdempotencyKey,
        promoCode,
        redeemPoints,
      });

      // Show receipt modal and clear active cart
      setActiveReceipt(receipt);
      setPaymentModalOpen(false);
      clearCart();
      setReceiptPrintModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Satış tamamlanarkən xəta baş verdi';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-2xl w-full max-h-[92vh] flex flex-col text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-white" />
              <span>{t('payment.title')}</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t('payment.splitPaymentNotice')}</p>
          </div>
          <button
            type="button"
            onClick={() => setPaymentModalOpen(false)}
            className="p-2 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Offline Banner */}
          {!isOnline && (
            <div
              role="alert"
              className="p-3 bg-amber-950/80 border border-amber-700 text-amber-200 text-xs font-bold rounded flex items-center gap-2"
            >
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{t('terminal.offlineNotice')}</span>
            </div>
          )}

          {/* Amount Due Dashboard */}
          <div className="grid grid-cols-3 gap-2 bg-zinc-900 p-3 rounded border border-zinc-800 text-center font-mono">
            <div>
              <span className="text-[11px] text-zinc-400 block uppercase font-sans">
                {t('payment.toPay')}
              </span>
              <span className="text-lg font-bold text-white tabular-nums">
                {formatMoney(grandTotal)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block uppercase font-sans">
                {t('payment.paid')}
              </span>
              <span className="text-lg font-bold text-emerald-400 tabular-nums">
                {formatMoney(totalPaid)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block uppercase font-sans">
                {t('payment.remaining')}
              </span>
              <span
                className={`text-lg font-black tabular-nums ${
                  remainingDue > 0 ? 'text-amber-400' : 'text-zinc-500'
                }`}
              >
                {formatMoney(remainingDue)}
              </span>
            </div>
          </div>

          {/* Tenders Added List */}
          {tenders.length > 0 && (
            <div className="bg-zinc-900/60 rounded border border-zinc-800 p-3 space-y-2">
              <span className="text-xs font-bold text-zinc-300 block">Daxil Edilən Ödənişlər:</span>
              <div className="space-y-1.5">
                {tenders.map((tender, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-zinc-850 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white capitalize">
                        {tender.type === 'cash'
                          ? 'Nağd Pul'
                          : tender.type === 'card'
                          ? 'Bank Kartı'
                          : tender.type === 'store_credit'
                          ? 'Müştəri Balansı'
                          : 'Hədiyyə Kartı'}
                      </span>
                      {tender.referenceNumber && (
                        <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          RRN: {tender.referenceNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400 tabular-nums">
                        {formatMoney(tender.amountQapik)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTender(idx)}
                        className="text-zinc-400 hover:text-red-400 p-1"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Tender Form (only if remaining due > 0) */}
          {remainingDue > 0 && (
            <div className="border border-zinc-800 rounded p-4 bg-zinc-900/40 space-y-3">
              {/* Tender Type Selector */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTenderType('cash')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded min-h-[48px] text-xs font-semibold border transition-all ${
                    selectedTenderType === 'cash'
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  <Banknote className="w-4 h-4 mb-1" />
                  <span>{t('payment.tenderCash')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTenderType('card')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded min-h-[48px] text-xs font-semibold border transition-all ${
                    selectedTenderType === 'card'
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  <CreditCard className="w-4 h-4 mb-1" />
                  <span>{t('payment.tenderCard')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTenderType('store_credit')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded min-h-[48px] text-xs font-semibold border transition-all ${
                    selectedTenderType === 'store_credit'
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  <Wallet className="w-4 h-4 mb-1" />
                  <span>{t('payment.tenderStoreCredit')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTenderType('gift_card')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded min-h-[48px] text-xs font-semibold border transition-all ${
                    selectedTenderType === 'gift_card'
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  <Gift className="w-4 h-4 mb-1" />
                  <span>{t('payment.tenderGiftCard')}</span>
                </button>
              </div>

              {/* Amount Input */}
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Ödənilən Məbləğ (₼):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={tenderAmountInput}
                    onChange={(e) => setTenderAmountInput(e.target.value)}
                    className="w-full h-11 bg-black border border-zinc-700 rounded px-3 text-white font-mono text-base font-bold focus:outline-none focus:border-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddTender}
                  className="self-end h-11 px-5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase flex items-center gap-1.5 border border-zinc-700 min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('payment.addTender')}</span>
                </button>
              </div>

              {/* Card Terminal Notice / Manual Fallback Reference */}
              {selectedTenderType === 'card' && (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded space-y-2">
                  {!terminalConfig.isConfigured ? (
                    <>
                      <div className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{t('payment.terminalNotConfigured')}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-tight">
                        Ödəniş xarici fiziki terminal vasitəsilə icra edilibsə, çek nömrəsini və ya
                        RRN kodunu qeyd edərək təsdiq edə bilərsiniz. Heç vaxt kart məlumatlarını
                        daxil etməyin!
                      </p>
                      <div>
                        <label className="text-[11px] text-zinc-300 block mb-1 font-semibold">
                          {t('payment.manualAuthReference')} *:
                        </label>
                        <input
                          type="text"
                          value={cardAuthReference}
                          onChange={(e) => setCardAuthReference(e.target.value)}
                          placeholder="Məs: RRN-94810239 və ya Təsdiq Kodu"
                          className="w-full h-9 bg-black border border-zinc-700 rounded px-2.5 text-xs text-white font-mono focus:outline-none focus:border-white"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-emerald-400 font-medium">
                      İnteqrasiya olunmuş SmartPOS terminalı aktivdir ({terminalConfig.providerName}).
                    </div>
                  )}
                </div>
              )}

              {/* Quick Cash Presets for Cash mode */}
              {selectedTenderType === 'cash' && (
                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1.5">
                    {t('payment.quickCash')}:
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {quickCashPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const val = (preset.value / 100).toFixed(2);
                          setTenderAmountInput(
                            (Math.min(remainingDue, preset.value) / 100).toFixed(2)
                          );
                          setCashTenderedInput(val);
                        }}
                        className="py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-mono font-semibold min-h-[44px]"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Cash Change Calculator */}
                  <div className="mt-3 p-3 bg-zinc-900/80 border border-zinc-800 rounded flex items-center justify-between text-xs">
                    <div>
                      <span className="text-zinc-400 block">Kassaya verilən nağd:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={cashTenderedInput}
                        onChange={(e) => setCashTenderedInput(e.target.value)}
                        className="w-28 h-8 bg-black border border-zinc-700 rounded px-2 text-white font-mono font-bold text-sm mt-0.5"
                      />
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 block">{t('payment.change')}:</span>
                      <span className="text-base font-black font-mono text-emerald-400 tabular-nums">
                        {formatMoney(changeDueQapik)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error notice */}
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

        {/* Modal Footer / Finalize Action */}
        <div className="px-5 py-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPaymentModalOpen(false)}
            className="px-4 py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs min-h-[48px]"
          >
            {t('actions.cancel')}
          </button>

          <button
            type="button"
            disabled={totalPaid !== grandTotal || !isOnline || isProcessing}
            onClick={handleFinalizeSale}
            className="flex-1 px-6 py-3 rounded bg-white hover:bg-zinc-200 active:bg-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 min-h-[48px] transition-all"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t('payment.processing')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>{t('payment.finalizeSale')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
