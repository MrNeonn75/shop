import React, { useState } from 'react';
import { usePosStore } from '../stores/posStore';
import { Lock, Delete, Unlock, AlertCircle } from 'lucide-react';

export const PosLockModal: React.FC = () => {
  const { isLockModalOpen, unlockTerminal, activeShift } = usePosStore();

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isLockModalOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setError(false);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleUnlock = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length >= 4) {
      const ok = unlockTerminal(pin);
      if (ok) {
        setPin('');
        setError(false);
      } else {
        setError(true);
        setPin('');
      }
    } else {
      setError(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-sm w-full p-6 text-white text-center shadow-2xl space-y-5">
        <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-700 mx-auto flex items-center justify-center text-zinc-300">
          <Lock className="w-7 h-7" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Kassa Kilidlənib</h2>
          <p className="text-xs text-zinc-400 mt-1">
            {activeShift?.cashierName || 'Kassir'} növbəsi davam edir. Səbətiniz təhlükəsiz qorunur.
          </p>
        </div>

        {/* PIN Dots Display */}
        <div className="flex justify-center items-center gap-3 py-2">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                pin.length > idx
                  ? 'bg-white border-white scale-110'
                  : 'bg-zinc-900 border-zinc-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="text-xs text-red-400 font-semibold flex items-center justify-center gap-1">
            <AlertCircle className="w-4 h-4" />
            <span>PIN kod yanlışdır (min. 4 rəqəm)</span>
          </div>
        )}

        {/* Numeric Keypad (touch friendly min 48px) */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-white active:text-black text-xl font-bold font-mono transition-colors"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Sil"
            className="h-14 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <Delete className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-white active:text-black text-xl font-bold font-mono transition-colors"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleUnlock()}
            disabled={pin.length < 4}
            aria-label="Kiliddən çıxar"
            className="h-14 rounded-lg bg-white hover:bg-zinc-200 active:bg-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed text-black font-black flex items-center justify-center transition-colors"
          >
            <Unlock className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
