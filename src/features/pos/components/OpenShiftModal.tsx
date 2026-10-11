import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { AZN_DENOMINATIONS_TEMPLATE } from '../types';
import { toQapik, formatMoney } from '../../../shared/utils/formatters';
import { X, CheckCircle2, AlertCircle, Coins, Plus, Minus } from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';

export const OpenShiftModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const user = useSessionStore((s) => s.user);
  const {
    isOpenShiftModalOpen,
    setOpenShiftModalOpen,
    registers,
    selectedRegisterId,
    selectRegister,
    setActiveShift,
  } = usePosStore();

  const [denominations, setDenominations] = useState<Record<string, number>>({
    '50': 2, // 100 AZN
    '20': 2, // 40 AZN
    '10': 1, // 10 AZN -> Default 150.00 AZN float
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpenShiftModalOpen) return null;

  const currentRegister = registers.find((r) => r.id === selectedRegisterId) || registers[0];
  const expectedFloatQapik = toQapik(15000); // 150.00 AZN default expected float

  // Calculate counted total from denominations
  const totalCountedQapik = AZN_DENOMINATIONS_TEMPLATE.reduce((sum, denom) => {
    const count = denominations[denom.valueAzn.toString()] || 0;
    const valueInQapik = Math.round(denom.valueAzn * 100);
    return sum + count * valueInQapik;
  }, 0);

  const handleUpdateCount = (valueKey: string, delta: number) => {
    setDenominations((prev) => {
      const current = prev[valueKey] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [valueKey]: next };
    });
  };

  const handleOpenShift = async () => {
    if (!currentRegister) {
      setErrorMessage('Kassa aparatı seçilməyib!');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const shift = await PosService.openShift({
        cashierId: user?.id || 'usr-004',
        cashierName: user?.name || 'Aytən Həsənova',
        branchId: currentRegister.branchId || 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        registerId: currentRegister.id,
        registerName: currentRegister.name,
        openingFloatQapik: toQapik(totalCountedQapik),
        denominations,
      });

      setActiveShift(shift);
      setOpenShiftModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Növbə açılarkən xəta baş verdi';
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
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-xl w-full max-h-[92vh] flex flex-col text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {t('shift.openShift')}
              </h2>
              <p className="text-xs text-zinc-400">
                Kassada mövcud olan ilkin nağd qalığı sayaraq qeyd edin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenShiftModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Register Picker */}
          <div className="bg-zinc-900 p-3 rounded border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-zinc-400 block uppercase font-bold">
                Kassa Aparatı
              </span>
              <span className="text-sm font-bold text-white">
                {currentRegister?.name || 'Kassa 1'}
              </span>
            </div>
            {registers.length > 1 && (
              <select
                value={selectedRegisterId}
                onChange={(e) => selectRegister(e.target.value)}
                className="bg-black border border-zinc-700 text-xs text-white px-2.5 py-1.5 rounded h-9"
              >
                {registers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Float Compare */}
          <div className="grid grid-cols-2 gap-3 bg-zinc-900 p-3 rounded border border-zinc-800 text-center font-mono">
            <div>
              <span className="text-[11px] text-zinc-400 block uppercase font-sans">
                {t('shift.openingFloat')} (Gözlənilən)
              </span>
              <span className="text-base font-bold text-zinc-300">
                {formatMoney(expectedFloatQapik)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block uppercase font-sans">
                Sayılmış Faktiki Nağd
              </span>
              <span className="text-lg font-black text-emerald-400">
                {formatMoney(totalCountedQapik)}
              </span>
            </div>
          </div>

          {/* Denominations Counter Grid */}
          <div className="border border-zinc-800 rounded p-3 bg-zinc-900/40">
            <h4 className="text-xs font-bold text-zinc-300 mb-2.5 flex items-center gap-1.5">
              <span>{t('shift.denominationCounter')}</span>
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
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpenShiftModalOpen(false)}
            className="px-4 py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs min-h-[48px]"
          >
            {t('actions.cancel')}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleOpenShift}
            className="px-6 py-2.5 rounded bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 min-h-[48px] transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('shift.confirmAndOpen')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
