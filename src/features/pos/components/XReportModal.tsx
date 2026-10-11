import React, { useState, useEffect } from 'react';
import { usePosStore } from '../stores/posStore';
import { PosService } from '../services/posService';
import { XReportData } from '../types';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { X, FileText, Printer } from 'lucide-react';

export const XReportModal: React.FC = () => {
  const { isXReportModalOpen, setXReportModalOpen, activeShift } = usePosStore();

  const [xReport, setXReport] = useState<XReportData | null>(null);

  useEffect(() => {
    if (isXReportModalOpen && activeShift) {
      PosService.getXReport(activeShift.id).then(setXReport);
    }
  }, [isXReportModalOpen, activeShift]);

  if (!isXReportModalOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 select-none"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-md w-full text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Aralıq X-Hesabat
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setXReportModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Report Content */}
        <div className="p-4 bg-zinc-900/40 flex justify-center max-h-[75vh] overflow-y-auto">
          {xReport ? (
            <div
              id="x-report-content"
              className="bg-white text-black p-5 rounded font-mono text-xs w-[320px] shadow-inner print:w-[80mm] print:p-2 select-text"
            >
              <div className="text-center pb-2 border-b border-dashed border-zinc-400 mb-3">
                <h3 className="font-black text-sm uppercase">BRAND HOUSE ERP</h3>
                <p className="text-[10px] font-bold">ARALIQ X-HESABAT (NÖVBƏ BAĞLANMIR)</p>
                <p className="text-[10px]">{xReport.branchName}</p>
                <p className="text-[10px]">{xReport.registerName}</p>
              </div>

              <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-zinc-400 mb-3">
                <div className="flex justify-between">
                  <span>Hesabat Vaxtı:</span>
                  <span>{formatDateTime(xReport.generatedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Növbə Başlanğıcı:</span>
                  <span>{formatDateTime(xReport.openedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kassir:</span>
                  <span className="font-bold">{xReport.cashierName}</span>
                </div>
              </div>

              <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-zinc-400 mb-3">
                <div className="flex justify-between">
                  <span>Çek Sayı:</span>
                  <span className="font-bold">{xReport.salesCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ümumi Satış:</span>
                  <span className="font-bold">{formatMoney(xReport.grossSalesQapik)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Nağd Satış:</span>
                  <span>{formatMoney(xReport.cashSalesQapik)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bank Kartı:</span>
                  <span>{formatMoney(xReport.cardSalesQapik)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ƏDV (18%):</span>
                  <span>{formatMoney(xReport.taxQapik)}</span>
                </div>
              </div>

              <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-zinc-400 mb-3">
                <div className="flex justify-between">
                  <span>İlkin Qalıq (Float):</span>
                  <span>{formatMoney(xReport.openingFloatQapik)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mədaxil (Cash In):</span>
                  <span>{formatMoney(xReport.cashInQapik)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Məxaric (Cash Out):</span>
                  <span>{formatMoney(xReport.cashOutQapik)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-black">
                  <span>Kassada Gözlənilən Nağd:</span>
                  <span>{formatMoney(xReport.expectedDrawerCashQapik)}</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-zinc-600 pt-1">
                *** MƏLUMAT XARAKTERLİ HESABAT ***
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 py-8">Yüklənir...</p>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex gap-2 no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-3 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase flex items-center justify-center gap-2 border border-zinc-700 min-h-[48px]"
          >
            <Printer className="w-4 h-4" />
            <span>Çap Et</span>
          </button>
          <button
            type="button"
            onClick={() => setXReportModalOpen(false)}
            className="flex-1 py-3 rounded bg-white text-black hover:bg-zinc-200 font-bold text-xs uppercase min-h-[48px]"
          >
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
};
