import React, { useState, useEffect } from 'react';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { Receipt } from '../types';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import {
  X,
  Search,
  Printer,
  Ban,
  Lock,
  FileText,
} from 'lucide-react';

export const ReceiptLookupModal: React.FC = () => {
  const {
    isReceiptLookupModalOpen,
    setReceiptLookupModalOpen,
    activeShift,
    setActiveReceipt,
    setReceiptPrintModalOpen,
  } = usePosStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [receiptsList, setReceiptsList] = useState<Receipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  // Reprint dialog state
  const [isReprintDialogOpen, setIsReprintDialogOpen] = useState(false);
  const [reprintReason, setReprintReason] = useState('Müştəri təkrar çek tələb etdi');

  // Void dialog state
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('Səhv qeydiyyat / Müştəri imtinası');
  const [managerPin, setManagerPin] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isReceiptLookupModalOpen && activeShift) {
      PosService.getShiftReceipts(activeShift.id).then((receipts) => {
        setReceiptsList(receipts);
        if (receipts.length > 0 && !selectedReceipt) {
          setSelectedReceipt(receipts[0]);
        }
      });
    }
  }, [isReceiptLookupModalOpen, activeShift, selectedReceipt]);

  if (!isReceiptLookupModalOpen) return null;

  const filteredReceipts = receiptsList.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.customer && r.customer.name.toLowerCase().includes(q))
    );
  });

  const handleReprintSubmit = async () => {
    if (!selectedReceipt || !reprintReason.trim()) return;
    setErrorMessage(null);

    try {
      const updated = await PosService.reprintReceipt(selectedReceipt.id, reprintReason.trim());
      setSelectedReceipt(updated);
      setIsReprintDialogOpen(false);
      setActiveReceipt(updated);
      setReceiptLookupModalOpen(false);
      setReceiptPrintModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Təkrar çap zamanı xəta';
      setErrorMessage(msg);
    }
  };

  const handleVoidSubmit = async () => {
    if (!selectedReceipt || !voidReason.trim()) return;
    setErrorMessage(null);

    try {
      const voided = await PosService.voidSale(selectedReceipt.id, managerPin, voidReason.trim());
      setSelectedReceipt(voided);
      setIsVoidDialogOpen(false);
      // Refresh list
      if (activeShift) {
        const refreshed = await PosService.getShiftReceipts(activeShift.id);
        setReceiptsList(refreshed);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Çek ləğv edilərkən xəta';
      setErrorMessage(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-zinc-300" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Çek Axtarışı və Təkrar Çap (SURƏT)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setReceiptLookupModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
          {/* Left: Receipts List */}
          <div className="p-4 flex flex-col overflow-hidden">
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Çek nömrəsi ilə axtar..."
                className="w-full h-10 bg-black border border-zinc-700 rounded pl-9 pr-3 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredReceipts.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-8">Çek tapılmadı</p>
              ) : (
                filteredReceipts.map((rcp) => (
                  <div
                    key={rcp.id}
                    onClick={() => setSelectedReceipt(rcp)}
                    className={`p-2.5 rounded border text-xs cursor-pointer transition-all ${
                      selectedReceipt?.id === rcp.id
                        ? 'bg-zinc-850 border-white ring-1 ring-white'
                        : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-mono font-bold text-white">{rcp.receiptNumber}</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {formatMoney(rcp.grandTotalQapik)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>{formatDateTime(rcp.createdAt)}</span>
                      <span
                        className={`font-semibold capitalize ${
                          rcp.status === 'completed'
                            ? 'text-emerald-400'
                            : rcp.status === 'voided'
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {rcp.status === 'voided' ? 'LƏĞV EDİLİB' : 'Tamamlanıb'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Selected Receipt Details & Actions */}
          <div className="p-4 flex flex-col justify-between overflow-y-auto">
            {selectedReceipt ? (
              <div className="space-y-4">
                <div className="bg-zinc-900 p-3 rounded border border-zinc-800 font-mono text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Çek №:</span>
                    <span className="font-bold text-white">{selectedReceipt.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Status:</span>
                    <span
                      className={`font-bold ${
                        selectedReceipt.status === 'voided' ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {selectedReceipt.status === 'voided' ? 'LƏĞV EDİLMİŞ' : 'TAMAMLANMIŞ'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Tarix:</span>
                    <span>{formatDateTime(selectedReceipt.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Təkrar Çap Sayı:</span>
                    <span>{selectedReceipt.reprintCount}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-zinc-750 font-bold text-sm">
                    <span>Məbləğ:</span>
                    <span>{formatMoney(selectedReceipt.grandTotalQapik)}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-zinc-300 block">Məhsullar:</span>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {selectedReceipt.items.map((i, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-xs p-1.5 rounded bg-zinc-900 border border-zinc-850"
                      >
                        <div>
                          <span className="font-semibold block truncate max-w-[200px]">
                            {i.productName}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {i.quantity} x {formatMoney(i.unitPriceQapik)}
                          </span>
                        </div>
                        <span className="font-mono font-bold">{formatMoney(i.lineTotalQapik)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions: Reprint & Void */}
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setIsReprintDialogOpen(true)}
                    className="w-full py-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase flex items-center justify-center gap-2 border border-zinc-700 min-h-[44px]"
                  >
                    <Printer className="w-4 h-4" />
                    <span>SURƏT Çap Et (Yenidən Çap)</span>
                  </button>

                  {selectedReceipt.status !== 'voided' && (
                    <button
                      type="button"
                      onClick={() => setIsVoidDialogOpen(true)}
                      className="w-full py-2.5 rounded bg-red-950/70 hover:bg-red-900 text-red-200 font-bold text-xs uppercase flex items-center justify-center gap-2 border border-red-800 min-h-[44px]"
                    >
                      <Ban className="w-4 h-4 text-red-400" />
                      <span>Çeki Ləğv Et (Void)</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 text-center my-auto">Çek seçin</p>
            )}
          </div>
        </div>

        {/* Sub-Modal: Reprint Reason Dialog */}
        {isReprintDialogOpen && (
          <div className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded p-4 max-w-sm w-full space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Təkrar Çap Qeydiyyatı (SURƏT)</span>
              </h4>
              <p className="text-[11px] text-zinc-400">
                Təkrar çap edilən çek üzərində 'SURƏT' qeydi vurulacaq və audit loquna qeyd ediləcəkdir.
              </p>
              <div>
                <label className="text-[11px] text-zinc-300 block mb-1 font-semibold">
                  Təkrar Çap Səbəbi *:
                </label>
                <select
                  value={reprintReason}
                  onChange={(e) => setReprintReason(e.target.value)}
                  className="w-full h-9 bg-black border border-zinc-700 rounded px-2.5 text-xs text-white"
                >
                  <option value="Müştəri təkrar çek tələb etdi">Müştəri təkrar çek tələb etdi</option>
                  <option value="Printer kağızı ilişdi / Zədələndi">Printer kağızı ilişdi / Zədələndi</option>
                  <option value="Mühasibatlıq / Şirkət tələbi">Mühasibatlıq / Şirkət tələbi</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReprintDialogOpen(false)}
                  className="flex-1 py-2 rounded bg-zinc-800 text-xs font-semibold"
                >
                  İmtina
                </button>
                <button
                  type="button"
                  onClick={handleReprintSubmit}
                  className="flex-1 py-2 rounded bg-white text-black font-bold text-xs uppercase"
                >
                  Çap Et
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-Modal: Void Receipt Dialog */}
        {isVoidDialogOpen && (
          <div className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-red-700 rounded p-4 max-w-sm w-full space-y-3">
              <div className="text-xs font-bold text-red-300 flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400" />
                <span>Çekin Ləğv Edilməsi (Menecer Təsdiqi)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Diqqət: Çek heç vaxt bazadan silinmir, yalnız ləğv edilərək kassa dövriyyəsi geri qaytarılır.
              </p>
              <div>
                <label className="text-[11px] text-zinc-300 block mb-1 font-semibold">
                  Ləğv Səbəbi *:
                </label>
                <select
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full h-9 bg-black border border-zinc-700 rounded px-2.5 text-xs text-white"
                >
                  <option value="Səhv qeydiyyat / Müştəri imtinası">Səhv qeydiyyat / Müştəri imtinası</option>
                  <option value="Ödəniş forması səhv vuruldu">Ödəniş forması səhv vuruldu</option>
                  <option value="Qiymət uyğunsuzluğu / Kassir xətası">Qiymət uyğunsuzluğu / Kassir xətası</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-300 block mb-1 font-semibold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Menecer PIN Kodu *:</span>
                </label>
                <input
                  type="password"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="PIN daxil edin (məs: 9999)..."
                  className="w-full h-9 bg-black border border-zinc-700 rounded px-2.5 text-xs text-white font-mono"
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="p-2 rounded bg-red-950 border border-red-800 text-red-200 text-xs">
                  {errorMessage}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVoidDialogOpen(false)}
                  className="flex-1 py-2 rounded bg-zinc-800 text-xs font-semibold"
                >
                  İmtina
                </button>
                <button
                  type="button"
                  onClick={handleVoidSubmit}
                  className="flex-1 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase"
                >
                  Ləğvi Təsdiqlə
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
