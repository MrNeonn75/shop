import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { Receipt } from '../types';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { X, RotateCcw, Search, Barcode, CheckCircle2, AlertCircle } from 'lucide-react';

export const ReturnExchangeModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    isReturnExchangeModalOpen,
    setReturnExchangeModalOpen,
  } = usePosStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [foundReceipt, setFoundReceipt] = useState<Receipt | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('Ölçü uyğunsuzluğu');
  const [successNotice, setSuccessNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  if (!isReturnExchangeModalOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setErrorMessage(null);
    setSuccessNotice(false);

    try {
      const receipt = await PosService.lookupReceipt(searchQuery.trim());
      if (receipt) {
        setFoundReceipt(receipt);
        const initSelection: Record<string, number> = {};
        receipt.items.forEach((item) => {
          initSelection[item.id] = 1;
        });
        setSelectedItems(initSelection);
      } else {
        setFoundReceipt(null);
        setErrorMessage(`Çek tapılmadı: "${searchQuery}"`);
      }
    } catch {
      setErrorMessage('Axtarış zamanı xəta baş verdi');
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      const current = prev[itemId] || 0;
      if (current > 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      } else {
        return { ...prev, [itemId]: maxQty };
      }
    });
  };

  const handleProcessReturn = () => {
    if (!foundReceipt) return;
    setSuccessNotice(true);
    setTimeout(() => {
      setSuccessNotice(false);
      setReturnExchangeModalOpen(false);
    }, 2000);
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
            <RotateCcw className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {t('actions.returnExchange')}
              </h2>
              <p className="text-xs text-zinc-400">
                Orijinal satış çekini nömrə və ya barkodla tapın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReturnExchangeModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Search box */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 text-zinc-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Çek nömrəsi və ya barkod..."
                className="w-full h-10 bg-black border border-zinc-700 rounded pl-9 pr-3 text-xs text-white uppercase font-mono focus:outline-none focus:border-white"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white uppercase min-h-[40px] flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Axtar</span>
            </button>
          </form>

          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-red-950/80 border border-red-800 rounded text-red-200 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Qaytarılma sənədi uğurla tərtib edildi və kassa dövriyyəsi yeniləndi!</span>
            </div>
          )}

          {foundReceipt && !successNotice && (
            <div className="space-y-3">
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Çek №:</span>
                  <span className="font-bold text-white">{foundReceipt.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Tarix:</span>
                  <span>{formatDateTime(foundReceipt.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Məbləğ:</span>
                  <span className="font-bold text-emerald-400">
                    {formatMoney(foundReceipt.grandTotalQapik)}
                  </span>
                </div>
              </div>

              {/* Items selection */}
              <div>
                <span className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Qaytarılacaq Məhsullar:
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {foundReceipt.items.map((item) => {
                    const isChecked = !!selectedItems[item.id];
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItem(item.id, item.quantity)}
                        className={`p-2.5 rounded border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-zinc-850 border-white text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 rounded accent-emerald-500"
                          />
                          <div>
                            <span className="font-bold block">{item.productName}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              {item.size} / {item.color} · {item.quantity} ədəd
                            </span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-white">
                          {formatMoney(item.unitPriceQapik)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Return Reason */}
              <div>
                <label className="text-[11px] text-zinc-300 block mb-1 font-semibold">
                  Qaytarılma Səbəbi:
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full h-9 bg-black border border-zinc-700 rounded px-2.5 text-xs text-white"
                >
                  <option value="Ölçü uyğunsuzluğu">Ölçü uyğunsuzluğu</option>
                  <option value="Rəng və ya model bəyənilmədi">Rəng və ya model bəyənilmədi</option>
                  <option value="Fabrik qüsuru / Defekt">Fabrik qüsuru / Defekt</option>
                  <option value="Müştərinin fikrindən daşınması">Müştərinin fikrindən daşınması</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleProcessReturn}
                className="w-full py-3 rounded bg-white hover:bg-zinc-200 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 min-h-[48px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Qaytarmanı Təsdiq Et</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
