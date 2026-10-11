import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { AZN_DENOMINATIONS_TEMPLATE, ZReportData } from '../types';
import { toQapik, formatMoney } from '../../../shared/utils/formatters';
import { X, CheckCircle2, AlertCircle, Coins, Plus, Minus, Printer, Lock } from 'lucide-react';

export const CloseShiftModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    isCloseShiftModalOpen,
    setCloseShiftModalOpen,
    activeShift,
    setActiveShift,
  } = usePosStore();

  const [denominations, setDenominations] = useState<Record<string, number>>({});
  const [varianceReason, setVarianceReason] = useState<string>('');
  const [managerPin, setManagerPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zReportData, setZReportData] = useState<ZReportData | null>(null);

  if (!isCloseShiftModalOpen || !activeShift) return null;

  // Calculate counted total from denominations
  const totalCountedQapik = AZN_DENOMINATIONS_TEMPLATE.reduce((sum, denom) => {
    const count = denominations[denom.valueAzn.toString()] || 0;
    const valueInQapik = Math.round(denom.valueAzn * 100);
    return sum + count * valueInQapik;
  }, 0);

  const expectedCashQapik = activeShift.expectedCashQapik;
  const varianceQapik = totalCountedQapik - expectedCashQapik;
  const absVariance = Math.abs(varianceQapik);
  const exceedsTolerance = absVariance > 500; // > 5.00 AZN variance

  const handleUpdateCount = (valueKey: string, delta: number) => {
    setDenominations((prev) => {
      const current = prev[valueKey] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [valueKey]: next };
    });
  };

  const handleCloseShift = async () => {
    setErrorMessage(null);

    if (exceedsTolerance && !varianceReason.trim()) {
      setErrorMessage(
        'Kassa fərqi icazə verilən limitdən çoxdur (±5.00 ₼). Fərqin səbəbi mütləq qeyd edilməlidir!'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const zReport = await PosService.closeShift({
        shiftId: activeShift.id,
        countedCashQapik: toQapik(totalCountedQapik),
        denominations,
        varianceReason: varianceReason.trim() || undefined,
        managerPin: managerPin.trim() || undefined,
      });

      setZReportData(zReport);
      setActiveShift(null); // Register is now closed and locked
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Növbə bağlanarkən xəta baş verdi';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintZReport = () => {
    window.print();
  };

  const handleFinish = () => {
    setCloseShiftModalOpen(false);
    setZReportData(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-xl w-full max-h-[92vh] flex flex-col text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-red-400" />
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {t('shift.closeShift')}
              </h2>
              <p className="text-xs text-zinc-400">
                Günün yekun Z-hesabatı və faktiki kassa sayımı
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {zReportData ? (
            /* Z-Report Print Preview */
            <div className="space-y-4">
              <div
                id="z-report"
                className="bg-white text-black p-5 rounded font-mono text-xs shadow-inner print:w-[80mm] print:p-2 select-text"
              >
                <div className="text-center pb-2 border-b border-dashed border-zinc-400 mb-3">
                  <h3 className="font-black text-sm uppercase">BRAND HOUSE ERP</h3>
                  <p className="text-[10px] font-bold">GÜNLÜK YEKUN Z-HESABAT</p>
                  <p className="text-[10px]">{zReportData.branchName}</p>
                  <p className="text-[10px]">{zReportData.registerName}</p>
                </div>

                <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-zinc-400 mb-3">
                  <div className="flex justify-between">
                    <span>Növbə Açılışı:</span>
                    <span>{new Date(zReportData.openedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Növbə Bağlanışı:</span>
                    <span>{new Date(zReportData.closedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kassir:</span>
                    <span className="font-bold">{zReportData.cashierName}</span>
                  </div>
                </div>

                <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-zinc-400 mb-3">
                  <div className="flex justify-between">
                    <span>Çek Sayı:</span>
                    <span className="font-bold">{zReportData.salesCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ümumi Satış:</span>
                    <span className="font-bold">{formatMoney(zReportData.grossSalesQapik)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Nağd Satış:</span>
                    <span>{formatMoney(zReportData.cashSalesQapik)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kart Satış:</span>
                    <span>{formatMoney(zReportData.cardSalesQapik)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ƏDV (18%):</span>
                    <span>{formatMoney(zReportData.taxQapik)}</span>
                  </div>
                </div>

                <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-zinc-400 mb-3">
                  <div className="flex justify-between">
                    <span>İlkin Qalıq (Float):</span>
                    <span>{formatMoney(zReportData.openingFloatQapik)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gözlənilən Nağd:</span>
                    <span>{formatMoney(zReportData.expectedDrawerCashQapik)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Sayılan Nağd:</span>
                    <span>{formatMoney(zReportData.countedCashQapik)}</span>
                  </div>
                  <div className="flex justify-between font-black text-black">
                    <span>Fərq (Kəsir/Artıq):</span>
                    <span>{formatMoney(zReportData.varianceQapik)}</span>
                  </div>
                  {zReportData.varianceReason && (
                    <div className="text-[10px] text-zinc-600 mt-1 italic">
                      Səbəb: {zReportData.varianceReason}
                    </div>
                  )}
                </div>

                <div className="text-center text-[10px] text-zinc-600 pt-1">
                  *** NÖVBƏ RƏSMİ BAĞLANMIŞDIR ***
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrintZReport}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded text-xs uppercase flex items-center justify-center gap-2 border border-zinc-700 min-h-[48px]"
                >
                  <Printer className="w-4 h-4" />
                  <span>Z-Hesabatı Çap Et</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="flex-1 py-3 bg-white text-black font-black rounded text-xs uppercase hover:bg-zinc-200 min-h-[48px]"
                >
                  Tamamla
                </button>
              </div>
            </div>
          ) : (
            /* Close Counting Form */
            <>
              {/* Expected vs Counted */}
              <div className="grid grid-cols-3 gap-2 bg-zinc-900 p-3 rounded border border-zinc-800 text-center font-mono">
                <div>
                  <span className="text-[10px] text-zinc-400 block uppercase font-sans">
                    {t('shift.expectedCash')}
                  </span>
                  <span className="text-sm font-bold text-white">
                    {formatMoney(expectedCashQapik)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block uppercase font-sans">
                    {t('shift.countedCash')}
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {formatMoney(totalCountedQapik)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block uppercase font-sans">
                    {t('shift.variance')}
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      varianceQapik === 0
                        ? 'text-zinc-400'
                        : varianceQapik > 0
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {formatMoney(varianceQapik)}
                  </span>
                </div>
              </div>

              {/* Denominations Counter Grid */}
              <div className="border border-zinc-800 rounded p-3 bg-zinc-900/40">
                <h4 className="text-xs font-bold text-zinc-300 mb-2">
                  {t('shift.denominationCounter')}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AZN_DENOMINATIONS_TEMPLATE.map((denom) => {
                    const key = denom.valueAzn.toString();
                    const count = denominations[key] || 0;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800 text-xs"
                      >
                        <span className="font-bold text-zinc-200">{denom.label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateCount(key, -1)}
                            className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center font-bold"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center font-mono font-bold">{count}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCount(key, 1)}
                            className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center font-bold"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Variance explanation (required if variance exceeds tolerance) */}
              {exceedsTolerance && (
                <div className="p-3 bg-red-950/40 border border-red-800 rounded space-y-2">
                  <div className="text-xs text-red-300 font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{t('shift.varianceReason')}</span>
                  </div>
                  <textarea
                    rows={2}
                    value={varianceReason}
                    onChange={(e) => setVarianceReason(e.target.value)}
                    placeholder="Kassa fərqinin səbəbini ətraflı izah edin..."
                    className="w-full bg-black border border-red-700 rounded p-2 text-xs text-white focus:outline-none"
                    required
                  />
                </div>
              )}

              {/* Manager PIN Confirmation */}
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{t('shift.managerConfirmation')} (PIN):</span>
                </label>
                <input
                  type="password"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="Menecer PIN kodu (məs: 9999)..."
                  className="w-full h-9 bg-black border border-zinc-700 rounded px-3 text-xs text-white font-mono focus:outline-none focus:border-white"
                />
              </div>

              {/* Error Notice */}
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3 bg-red-950/80 border border-red-800 rounded text-red-200 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!zReportData && (
          <div className="px-5 py-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleFinish}
              className="px-4 py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs min-h-[48px]"
            >
              {t('actions.cancel')}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleCloseShift}
              className="px-6 py-2.5 rounded bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 min-h-[48px] transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('shift.confirmAndClose')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
