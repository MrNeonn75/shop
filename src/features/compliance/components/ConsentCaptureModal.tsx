import React, { useState } from 'react';
import { ConsentPurpose, ConsentMethod } from '../types';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { complianceRepository } from '../../../shared/adapters';
import { ShieldCheck, AlertCircle } from 'lucide-react';

interface ConsentCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectType: 'CUSTOMER' | 'EMPLOYEE';
  subjectId: string;
  subjectName: string;
  onSuccess?: () => void;
}

export const ConsentCaptureModal: React.FC<ConsentCaptureModalProps> = ({
  isOpen,
  onClose,
  subjectType,
  subjectId,
  subjectName,
  onSuccess,
}) => {
  const [purposes, setPurposes] = useState<Record<ConsentPurpose, boolean>>({
    marketing: true,
    loyalty: true,
    profiling: false,
    cross_border: false,
    retention: true,
  });

  const [method, setMethod] = useState<ConsentMethod>('E_SIGNATURE');
  const [otpCode, setOtpCode] = useState('');
  const [paperReference, setPaperReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const purposeLabels: Record<ConsentPurpose, { title: string; desc: string }> = {
    marketing: {
      title: 'Marketinq və Xəbərdarlıqlar',
      desc: 'SMS, WhatsApp və e-poçt vasitəsilə endirimlər və kampaniyalar haqqında bildirişlərin göndərilməsi.',
    },
    loyalty: {
      title: 'Loyallıq və Bonus Proqramı',
      desc: 'Keşbek və bonus xallarının toplanması, balansın izlənməsi və tətbiqi.',
    },
    profiling: {
      title: 'Fərdiləşdirilmiş Təkliflər (Profilinq)',
      desc: 'Alış tarixçəsi əsasında fərdi endirimlərin və tövsiyələrin formalaşdırılması.',
    },
    cross_border: {
      title: 'Transsərhəd Ötürülmə (Bulud Xidmətləri)',
      desc: 'Məlumatların AR hüdudlarından kənarda yerləşən beynəlxalq təhlükəsiz bulud infrastrukturunda emalı.',
    },
    retention: {
      title: 'Qanuni Saxlama Müddətləri',
      desc: 'Vergi və mühasibat uçotu qanunvericiliyinə uyğun olaraq maliyyə əməliyyatlarının 5 il saxlanması.',
    },
  };

  const handleToggle = (p: ConsentPurpose) => {
    setPurposes((prev) => ({ ...prev, [p]: !prev[p] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const grantedPurposes = Object.entries(purposes)
      .filter(([_, val]) => val)
      .map(([key]) => key as ConsentPurpose);

    if (grantedPurposes.length === 0) {
      setErrorMessage('Ən azı bir emal məqsədi seçilməlidir.');
      return;
    }

    if (method === 'OTP' && otpCode.trim().length < 4) {
      setErrorMessage('Düzgün OTP təsdiq kodu daxil edilməlidir.');
      return;
    }

    try {
      setIsSubmitting(true);
      await complianceRepository.recordConsent({
        subjectType,
        subjectId,
        purposes: grantedPurposes,
        method,
        evidenceReference:
          method === 'OTP'
            ? `OTP-SMS-VERIFIED-${otpCode}`
            : method === 'PAPER_SCAN'
            ? paperReference || 'PAPER-FORM-SIGNED'
            : 'DIGITAL-APP-CHECKBOX',
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Razılıq qeyd edilərkən xəta baş verdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fərdi Məlumatların Emalına Razılıq Ərizəsi"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-zinc-300">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-400">Subyekt:</div>
          <div className="font-semibold text-zinc-100">{subjectName}</div>
          <div className="text-xs text-zinc-500 font-mono mt-0.5">
            İD: {subjectId} ({subjectType === 'CUSTOMER' ? 'Müştəri' : 'Əməkdaş'})
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-700 rounded-md text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Legal notice */}
        <div className="text-xs text-zinc-400 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800">
          «Fərdi məlumatlar haqqında» AR Qanununun 8 və 9-cu maddələrinə uyğun olaraq, aşağıda qeyd olunan məqsədlər üçün fərdi məlumatların toplanması və işlənilməsinə könüllü razılıq verilir.
        </div>

        {/* Purposes checklist */}
        <div className="space-y-2.5">
          {(Object.keys(purposeLabels) as ConsentPurpose[]).map((pKey) => {
            const { title, desc } = purposeLabels[pKey];
            const checked = purposes[pKey];
            return (
              <div
                key={pKey}
                onClick={() => handleToggle(pKey)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'bg-zinc-800/80 border-indigo-500/60'
                    : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}} // Controlled via container div
                    className="mt-1 h-4 w-4 rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <div className="font-semibold text-zinc-100 text-xs">{title}</div>
                    <div className="text-zinc-400 text-xs mt-0.5">{desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Capture method */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Razılığın Əldə Olunma Metodu
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className={`p-2.5 rounded-lg border text-xs font-medium text-center ${
                method === 'E_SIGNATURE'
                  ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
              onClick={() => setMethod('E_SIGNATURE')}
            >
              E-İmza / Tətbiq
            </button>
            <button
              type="button"
              className={`p-2.5 rounded-lg border text-xs font-medium text-center ${
                method === 'OTP'
                  ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
              onClick={() => setMethod('OTP')}
            >
              SMS OTP
            </button>
            <button
              type="button"
              className={`p-2.5 rounded-lg border text-xs font-medium text-center ${
                method === 'PAPER_SCAN'
                  ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
              onClick={() => setMethod('PAPER_SCAN')}
            >
              Kağız Ərizə
            </button>
          </div>
        </div>

        {method === 'OTP' && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Müştərinin telefonuna göndərilən OTP kodu
            </label>
            <Input
              placeholder="Məs: 4829"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              required
            />
          </div>
        )}

        {method === 'PAPER_SCAN' && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              İmzalanmış ərizənin sənəd nömrəsi / arxiv qovluğu
            </label>
            <Input
              placeholder="Məs: RAZ-2026-0041"
              value={paperReference}
              onChange={(e) => setPaperReference(e.target.value)}
              required
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button variant="default" type="submit" disabled={isSubmitting}>
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'Qeyd olunur...' : 'Razılığı Qeydə Al'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
