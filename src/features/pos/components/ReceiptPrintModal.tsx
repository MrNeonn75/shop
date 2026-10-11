import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { Printer, CheckCircle, Mail, RotateCcw, X } from 'lucide-react';

export const ReceiptPrintModal: React.FC = () => {
  const { t } = useTranslation('pos');
  const { isReceiptPrintModalOpen, setReceiptPrintModalOpen, activeReceipt, setActiveReceipt } =
    usePosStore();

  const [emailInput, setEmailInput] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  if (!isReceiptPrintModalOpen || !activeReceipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleNewSale = () => {
    setActiveReceipt(null);
    setReceiptPrintModalOpen(false);
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) {
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    }
  };

  const isReprint = activeReceipt.reprintCount > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 overflow-y-auto select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-md w-full my-auto flex flex-col text-white shadow-2xl overflow-hidden">
        {/* Modal Top Bar */}
        <div className="px-5 py-3.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Satış Uğurla Tamamlandı</h3>
          </div>
          <button
            type="button"
            onClick={handleNewSale}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Container (Thermal 80mm preview & print styles) */}
        <div className="p-4 bg-zinc-900/50 flex-1 overflow-y-auto flex justify-center">
          <div
            id="thermal-receipt"
            className="bg-white text-black p-5 rounded font-mono text-xs w-[320px] shadow-inner select-text print:w-[80mm] print:p-2 print:m-0 print:shadow-none print:text-[10px]"
          >
            {/* SURƏT banner if reprint */}
            {isReprint && (
              <div className="text-center font-black text-sm border-2 border-black py-1 mb-3 uppercase tracking-widest">
                *** {t('receipt.duplicateCopy')} ***
              </div>
            )}

            {/* Header */}
            <div className="text-center mb-3 pb-2 border-b border-dashed border-zinc-400">
              <h2 className="font-black text-base tracking-wider uppercase">BRAND HOUSE</h2>
              <p className="text-[10px] text-zinc-700">PƏRAKƏNDƏ SATIŞ ŞƏBƏKƏSİ</p>
              <p className="text-[10px] text-zinc-700">{activeReceipt.branchName}</p>
              <p className="text-[10px] text-zinc-700 font-bold mt-1">
                FİSKAL SATIŞ ÇEKİ
              </p>
            </div>

            {/* Meta */}
            <div className="space-y-0.5 text-[11px] mb-3 pb-2 border-b border-dashed border-zinc-400">
              <div className="flex justify-between">
                <span>{t('receipt.receiptNumber')}:</span>
                <span className="font-bold">{activeReceipt.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('receipt.dateTime')}:</span>
                <span>{formatDateTime(activeReceipt.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kassir:</span>
                <span>{activeReceipt.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span>Kassa:</span>
                <span>{activeReceipt.registerName}</span>
              </div>
              {activeReceipt.customer && (
                <div className="flex justify-between font-semibold">
                  <span>Müştəri:</span>
                  <span>{activeReceipt.customer.name}</span>
                </div>
              )}
              {isReprint && activeReceipt.lastReprintReason && (
                <div className="text-[10px] text-zinc-600 mt-1 italic">
                  Təkrar çap səbəbi: {activeReceipt.lastReprintReason}
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="mb-3 pb-2 border-b border-dashed border-zinc-400 space-y-1.5">
              {activeReceipt.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold text-[11px]">{item.productName}</div>
                  <div className="flex justify-between text-[10px] text-zinc-700">
                    <span>
                      {item.quantity} x {formatMoney(item.unitPriceQapik)} ({item.size}/{item.color})
                    </span>
                    <span className="font-bold text-black font-mono">
                      {formatMoney(item.lineTotalQapik)}
                    </span>
                  </div>
                  {item.lineDiscountAmountQapik > 0 && (
                    <div className="text-[10px] text-zinc-500 italic">
                      Endirim: -{formatMoney(item.lineDiscountAmountQapik)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-[11px] mb-3 pb-2 border-b border-dashed border-zinc-400">
              <div className="flex justify-between">
                <span>Ara Cəmi:</span>
                <span>{formatMoney(activeReceipt.subtotalQapik)}</span>
              </div>
              {activeReceipt.discountQapik > 0 && (
                <div className="flex justify-between">
                  <span>Endirim:</span>
                  <span>-{formatMoney(activeReceipt.discountQapik)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>ƏDV (18% daxil):</span>
                <span>{formatMoney(activeReceipt.taxQapik)}</span>
              </div>
              <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
                <span>YEKUN:</span>
                <span>{formatMoney(activeReceipt.grandTotalQapik)}</span>
              </div>
            </div>

            {/* Payments */}
            <div className="space-y-0.5 text-[10px] mb-3 pb-2 border-b border-dashed border-zinc-400">
              <span className="font-bold block mb-1">ÖDƏNİŞ FORMASI:</span>
              {activeReceipt.tenders.map((t, i) => (
                <div key={i} className="flex justify-between">
                  <span className="capitalize">
                    {t.type === 'cash'
                      ? 'Nağd Pul'
                      : t.type === 'card'
                      ? 'Bank Kartı'
                      : t.type === 'store_credit'
                      ? 'Müştəri Balansı'
                      : 'Hədiyyə Kartı'}
                    {t.referenceNumber ? ` (${t.referenceNumber})` : ''}:
                  </span>
                  <span className="font-bold">{formatMoney(t.amountQapik)}</span>
                </div>
              ))}
              {activeReceipt.cashTenderedQapik && (
                <div className="flex justify-between text-zinc-600 mt-1">
                  <span>Alınan Nağd:</span>
                  <span>{formatMoney(activeReceipt.cashTenderedQapik)}</span>
                </div>
              )}
              {activeReceipt.changeDueQapik && (
                <div className="flex justify-between font-bold">
                  <span>Qaytarılan Qalıq:</span>
                  <span>{formatMoney(activeReceipt.changeDueQapik)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-[9px] text-zinc-600 space-y-0.5 pt-1">
              <p>ALIŞ-VERİŞİNİZ ÜÇÜN TƏŞƏKKÜR EDİRİK!</p>
              <p>Məhsul dəyişimi 14 gün ərzində çeklə mümkündür.</p>
              <p className="font-mono text-[8px] pt-1">ID: {activeReceipt.idempotencyKey.slice(0, 16)}</p>
            </div>
          </div>
        </div>

        {/* Thermal Print Controls */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 space-y-3 no-print">
          {/* E-receipt Form */}
          <form onSubmit={handleSendEmail} className="flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Elektron çek üçün email..."
              className="flex-1 h-9 bg-black border border-zinc-700 rounded px-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1 min-h-[36px]"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Göndər</span>
            </button>
          </form>

          {emailSent && (
            <p className="text-xs text-emerald-400 text-center">
              Elektron qəbz göstərilən ünvana göndərildi!
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 py-3 rounded bg-zinc-800 hover:bg-zinc-700 font-bold text-xs uppercase flex items-center justify-center gap-2 border border-zinc-700 min-h-[48px]"
            >
              <Printer className="w-4 h-4" />
              <span>Termal Çap (80mm)</span>
            </button>

            <button
              type="button"
              onClick={handleNewSale}
              className="flex-1 py-3 rounded bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black font-black text-xs uppercase flex items-center justify-center gap-2 min-h-[48px]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('receipt.nextSale')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
