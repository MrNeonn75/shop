import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { AlertTriangle, UserX, CheckSquare } from 'lucide-react';
import { Employee } from '../types';

interface OffboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  onConfirm: (data: {
    terminationDate: string;
    terminationReason: string;
    checklist: {
      assetsReturned: boolean;
      keysReturned: boolean;
      uniformReturned: boolean;
      accessRevoked: boolean;
      finalSettlementCalculated: boolean;
      notes?: string;
    };
  }) => Promise<void>;
}

export const OffboardingModal: React.FC<OffboardingModalProps> = ({
  isOpen,
  onClose,
  employee,
  onConfirm,
}) => {
  const [terminationDate, setTerminationDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [terminationReason, setTerminationReason] = useState('');
  const [checklist, setChecklist] = useState({
    assetsReturned: false,
    keysReturned: false,
    uniformReturned: false,
    accessRevoked: false,
    finalSettlementCalculated: true,
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminationReason.trim() || terminationReason.trim().length < 5) {
      setError('Ayrılma səbəbini ətraflı qeyd edin (minimum 5 simvol).');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm({
        terminationDate,
        terminationReason: terminationReason.trim(),
        checklist,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xəta baş verdi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`İşdən Azad Etmə və Təhvil-Təslim (Offboarding) — ${employee.fullName}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning Callout */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              Sistem Girişlərinin Ləğvi Xatırlatması
            </p>
            <p className="leading-relaxed">
              İşdən azad etmə təsdiqləndikdən sonra əməkdaşın ERP, POS terminal və anbar giriş hüquqları dərhal deaktiv ediləcək və yekun haqq-hesab siyahısına salınacaq.
            </p>
          </div>
        </div>

        {/* Date and Reason */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Son İş Günü <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Vəzifə / Departament
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={`${employee.jobTitle} (${employee.department})`}
              className="w-full rounded-md border border-slate-200 bg-slate-100 p-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Ayrılma Səbəbi / Əsaslandırma <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={2}
            required
            value={terminationReason}
            onChange={(e) => setTerminationReason(e.target.value)}
            placeholder="Məsələn: Öz ərizəsi ilə / Müqavilə müddətinin bitməsi / Ştat ixtisarı..."
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Checklist */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2.5">
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <CheckSquare className="h-4 w-4 text-primary-600" />
            Təhvil-Təslim Yoxlama Siyahısı (Offboarding Checklist)
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist.assetsReturned}
                onChange={(e) => setChecklist({ ...checklist, assetsReturned: e.target.checked })}
                className="rounded-sm border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>Şirkət avadanlığı və telefon təhvil verildi</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist.keysReturned}
                onChange={(e) => setChecklist({ ...checklist, keysReturned: e.target.checked })}
                className="rounded-sm border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>Mağaza / anbar açarları və giriş kartı</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist.uniformReturned}
                onChange={(e) => setChecklist({ ...checklist, uniformReturned: e.target.checked })}
                className="rounded-sm border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>Brend uniformaları və aksesuarlar</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist.accessRevoked}
                onChange={(e) => setChecklist({ ...checklist, accessRevoked: e.target.checked })}
                className="rounded-sm border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>ERP və e-poçt girişləri ləğv edildi</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                checked={checklist.finalSettlementCalculated}
                onChange={(e) =>
                  setChecklist({ ...checklist, finalSettlementCalculated: e.target.checked })
                }
                className="rounded-sm border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Son haqq-hesab və istifadə edilməmiş məzuniyyət kompensasiyası bayrağı (Payroll)
              </span>
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Buttons */}
        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            İmtina
          </Button>
          <Button
            type="submit"
            variant="destructive"
            isLoading={isSubmitting}
            className="gap-1.5"
          >
            <UserX className="h-4 w-4" />
            İşdən Azad Etməni Təsdiqlə
          </Button>
        </div>
      </form>
    </Modal>
  );
};

