import React, { useState } from 'react';
import { X, Download, FileSpreadsheet, FileText, Printer, CheckCircle2, Loader2 } from 'lucide-react';
import { reportsRepository } from '../../../shared/adapters';
import { ReportFilterState } from '../types';

interface ReportExportModalProps {
  reportId: string;
  reportTitle: string;
  filters: ReportFilterState;
  isOpen: boolean;
  onClose: () => void;
}

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  reportId,
  reportTitle,
  filters,
  isOpen,
  onClose,
}) => {
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('xlsx');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setLoading(true);
      const res = await reportsRepository.exportReport(reportId, filters, format);

      // Create download link
      const link = document.createElement('a');
      link.href = res.dataUri;
      link.download = res.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Download className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold">Hesabatı İxrac Et</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="Bağla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{reportTitle}</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Tətbiq edilmiş filtrlər əsasında fayl generasiya olunacaqdır.
            </p>
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
              İxrac Formatı
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center space-y-1 ${
                  format === 'xlsx'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                <span className="text-xs font-bold">Excel (XLSX)</span>
                <span className="text-[10px] text-gray-500">Cədvəl & Formul</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center space-y-1 ${
                  format === 'csv'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <FileText className="w-6 h-6 text-blue-600" />
                <span className="text-xs font-bold">CSV</span>
                <span className="text-[10px] text-gray-500">Universal Mətn</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center space-y-1 ${
                  format === 'pdf'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <FileText className="w-6 h-6 text-rose-600" />
                <span className="text-xs font-bold">PDF Sənəd</span>
                <span className="text-[10px] text-gray-500">Çap & Arxiv</span>
              </button>
            </div>
          </div>

          {/* Quick Print Option */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="text-xs text-slate-800">Səhifəni dərhal printerə göndər</span>
            </div>
            <button
              onClick={handlePrint}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
            >
              Çap Görünüşü
            </button>
          </div>

          {/* Status Alert */}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center space-x-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Fayl uğurla generasiya olundu və yüklənməyə başlandı.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 border-t border-gray-100 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            İmtina
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                <span>Hazırlanır...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-1" />
                <span>Yüklə ({format.toUpperCase()})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

