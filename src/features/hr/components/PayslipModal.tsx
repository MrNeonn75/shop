import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Printer, Building } from 'lucide-react';
import { PayrollItem } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { StatutoryTaxNotice } from './StatutoryTaxNotice';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PayrollItem | null;
  periodName?: string;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  isOpen,
  onClose,
  item,
  periodName = 'Aprel 2026',
}) => {
  if (!item) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Fərdi Əməkhaqqı Vərəqəsi (Payslip) — ${item.employeeName}`}
      className="max-w-2xl"
    >
      <div className="space-y-5 print:p-6 print:m-0">
        {/* Printable Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary-600" />
              <span className="font-bold text-base text-slate-900 dark:text-slate-100">
                BRAND HOUSE RETAIL MMC
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Dövr: <span className="font-semibold text-slate-800 dark:text-slate-200">{periodName}</span>
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <div>Filial: <span className="font-medium text-slate-800 dark:text-slate-200">{item.branchName}</span></div>
            <div>Departament: <span className="font-medium text-slate-800 dark:text-slate-200">{item.department}</span></div>
          </div>
        </div>

        {/* Employee Info Header */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg text-xs">
          <div>
            <span className="text-slate-400 block">Əməkdaş:</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{item.employeeName}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Vəzifə:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{item.jobTitle}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Kompensasiya Modeli:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200 uppercase">
              {item.compensationModel.replace('_', ' ')}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">İşlənmiş Saat:</span>
            <span className="font-mono text-slate-800 dark:text-slate-200">
              {item.actualWorkedHours} saat (Norma: {item.normalScheduledHours}s)
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Əlavə İş (Overtime):</span>
            <span className="font-mono text-slate-800 dark:text-slate-200">
              {item.overtimeHours > 0 ? `${item.overtimeHours} saat` : '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Bank / IBAN:</span>
            <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate block">
              {item.bankName}
            </span>
          </div>
        </div>

        {/* Earnings & Deductions Tables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Earnings (Hesablanıb) */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-slate-100/70 dark:bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Gəlir Maddələri (Earnings)
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs p-1">
              <div className="flex justify-between p-2">
                <span className="text-slate-600 dark:text-slate-400">Əsas Əməkhaqqı:</span>
                <span className="font-mono font-medium">{formatMoney(item.earnedBaseSalaryQapik)}</span>
              </div>
              {Number(item.overtimePayQapik) > 0 && (
                <div className="flex justify-between p-2">
                  <span className="text-slate-600 dark:text-slate-400">Əlavə İş Ödənişi:</span>
                  <span className="font-mono font-medium">{formatMoney(item.overtimePayQapik)}</span>
                </div>
              )}
              {Number(item.commissionBonusQapik) > 0 && (
                <div className="flex justify-between p-2">
                  <span className="text-slate-600 dark:text-slate-400">Satış Komissiyası:</span>
                  <span className="font-mono font-medium text-emerald-600">
                    {formatMoney(item.commissionBonusQapik)}
                  </span>
                </div>
              )}
              {Number(item.kpiBonusQapik) > 0 && (
                <div className="flex justify-between p-2">
                  <span className="text-slate-600 dark:text-slate-400">Performans Bonusu:</span>
                  <span className="font-mono font-medium text-emerald-600">
                    {formatMoney(item.kpiBonusQapik)}
                  </span>
                </div>
              )}
              <div className="flex justify-between p-2 font-bold bg-slate-50 dark:bg-slate-900/40 text-slate-900 dark:text-slate-100">
                <span>Cəmi Hesablanıb (Gross):</span>
                <span className="font-mono text-primary-600">{formatMoney(item.grossSalaryQapik)}</span>
              </div>
            </div>
          </div>

          {/* Deductions (Tutulmalar) */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-slate-100/70 dark:bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Qanuni Tutulmalar (Deductions)
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs p-1">
              <div className="flex justify-between p-2">
                <span className="text-slate-600 dark:text-slate-400">DSMF (Sosial Sığorta 3%):</span>
                <span className="font-mono text-rose-600">−{formatMoney(item.dsmfEmployeeQapik)}</span>
              </div>
              <div className="flex justify-between p-2">
                <span className="text-slate-600 dark:text-slate-400">İTS (İcbari Tibbi Sığorta 2%):</span>
                <span className="font-mono text-rose-600">−{formatMoney(item.itsEmployeeQapik)}</span>
              </div>
              <div className="flex justify-between p-2">
                <span className="text-slate-600 dark:text-slate-400">İşsizlikdən Sığorta (0.5%):</span>
                <span className="font-mono text-rose-600">−{formatMoney(item.unemploymentEmployeeQapik)}</span>
              </div>
              {Number(item.incomeTaxQapik) > 0 && (
                <div className="flex justify-between p-2">
                  <span className="text-slate-600 dark:text-slate-400">Gəlir Vergisi:</span>
                  <span className="font-mono text-rose-600">−{formatMoney(item.incomeTaxQapik)}</span>
                </div>
              )}
              {Number(item.advanceDeductionQapik) > 0 && (
                <div className="flex justify-between p-2">
                  <span className="text-slate-600 dark:text-slate-400">Avans Tutulması:</span>
                  <span className="font-mono text-rose-600">−{formatMoney(item.advanceDeductionQapik)}</span>
                </div>
              )}
              <div className="flex justify-between p-2 font-bold bg-slate-50 dark:bg-slate-900/40 text-slate-900 dark:text-slate-100">
                <span>Cəmi Tutulmalar:</span>
                <span className="font-mono text-rose-600">−{formatMoney(item.totalDeductionsQapik)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net Salary Highlight */}
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 p-4 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-bold text-emerald-800 dark:text-emerald-300">
              Xalis Ödəniləcək Məbləğ (Net Salary)
            </span>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              Bank kartına köçürülməsi təsdiqlənmiş son vəsait
            </p>
          </div>
          <div className="text-3xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
            {formatMoney(item.netSalaryQapik)}
          </div>
        </div>

        {/* Employer Cost Footnote */}
        <div className="text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between">
          <span>İşəgötürənin məsrəfi (DSMF, İTS, İşsizlik daxil): {formatMoney(item.totalEmployerCostQapik)}</span>
          <span className="italic">Avtomatlaşdırılmış BRAND HOUSE ERP sistemi</span>
        </div>

        <StatutoryTaxNotice compact />

        {/* Action Buttons */}
        <div className="flex justify-end gap-2.5 pt-2 print:hidden">
          <Button variant="outline" size="sm" onClick={onClose}>
            Bağla
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Çap Et / PDF Yadda Saxla
          </Button>
        </div>
      </div>
    </Modal>
  );
};

