import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Download } from 'lucide-react';
import { DrillDownTransaction } from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  transactions: DrillDownTransaction[];
  isLoading?: boolean;
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({
  isOpen,
  onClose,
  title,
  transactions,
  isLoading = false,
}) => {
  const totalAmountQapik = transactions.reduce((sum, t) => sum + Number(t.amountQapik), 0);

  const handleExportCsv = () => {
    const headers = ['Tarix', 'Sənəd №', 'Filial', 'Kateqoriya/Tender', 'Təsvir', 'Məbləğ (AZN)'];
    const rows = transactions.map((t) => [
      t.date,
      t.documentNumber,
      `"${t.branchName}"`,
      `"${t.categoryOrTender}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      (Number(t.amountQapik) / 100).toFixed(2),
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `drilldown_${title.toLowerCase().replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`İlkin Əməliyyatlar Detalı — ${title}`}
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <div className="text-slate-600 dark:text-slate-400">
            Cəmi <span className="font-semibold text-slate-900 dark:text-slate-100">{transactions.length}</span> əməliyyat
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-500">Yekun:</span>
            <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
              {formatMoney(totalAmountQapik)}
            </span>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5 ml-2">
              <Download className="h-3.5 w-3.5" />
              CSV İxrac
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Məlumatlar yüklənir...</div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-slate-500">Əlaqəli əməliyyat tapılmadı.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Tarix</th>
                  <th className="px-3 py-2.5">Sənəd №</th>
                  <th className="px-3 py-2.5">Filial</th>
                  <th className="px-3 py-2.5">Təsvir</th>
                  <th className="px-3 py-2.5 text-right">Məbləğ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                      {t.documentNumber}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                      {t.branchName}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                      <div className="font-medium">{t.description}</div>
                      <div className="text-[11px] text-slate-400">{t.categoryOrTender}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-xs text-slate-900 dark:text-slate-100">
                      {formatMoney(t.amountQapik)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Bağla
          </Button>
        </div>
      </div>
    </Modal>
  );
};

