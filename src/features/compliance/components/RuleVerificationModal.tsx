import React, { useState } from 'react';
import { RulePack, VerifierRole } from '../types';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { ShieldCheck, AlertCircle, Scale, CheckCircle2 } from 'lucide-react';
import { complianceRepository } from '../../../shared/adapters';

interface RuleVerificationModalProps {
  pack: RulePack | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserName?: string;
}

export const RuleVerificationModal: React.FC<RuleVerificationModalProps> = ({
  pack,
  isOpen,
  onClose,
  onSuccess,
  currentUserName = 'Leyla Məmmədova', // Default mock user (Accountant/Lawyer)
}) => {
  const [role, setRole] = useState<VerifierRole>('ACCOUNTANT');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!pack) return null;

  // Two-person rule check: verifier cannot be the creator/editor of the latest version
  const vers = pack.versions || [];
  const latestVersion = vers[vers.length - 1];
  const isAuthor =
    latestVersion &&
    latestVersion.author &&
    latestVersion.author.trim().toLowerCase() === currentUserName.trim().toLowerCase();

  const isEvidenceValid = evidenceNotes.trim().length >= 20;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isAuthor) {
      setErrorMessage(
        'İki şəxs qaydası pozuldu: Qaydanı təklif və ya redaktə edən şəxs özü onu təsdiqləyə bilməz (verifier ≠ editor).'
      );
      return;
    }

    if (!isEvidenceValid) {
      setErrorMessage('Sübut və əsaslandırma qeydləri ən azı 20 simvol olmalıdır.');
      return;
    }

    try {
      setIsSubmitting(true);
      // 1. Verify
      await complianceRepository.verifyPack(pack.id, {
        verifierName: currentUserName,
        verifierRole: role,
        evidenceNotes: evidenceNotes.trim(),
        evidenceFileId: evidenceFile ? evidenceFile.name : undefined,
      });

      // 2. Activate with Baku midnight boundary
      const bakuMidnight = `${effectiveFrom}T00:00:00+04:00`;
      await complianceRepository.activatePack(pack.id, {
        effectiveFrom: bakuMidnight,
        activationReason: `Rəsmi təsdiq əsasında aktivləşdirildi: ${evidenceNotes.substring(0, 40)}...`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Təsdiqləmə zamanı xəta baş verdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hüquqi Qayda Paketini Təsdiqlə və Aktivləşdir"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-sm text-zinc-300">
        {/* Pack title and legal basis */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5 space-y-1">
          <div className="text-xs text-zinc-400">Paket:</div>
          <div className="font-semibold text-zinc-100">{pack.title}</div>
          <div className="text-xs text-indigo-400 font-medium flex items-center gap-1 mt-1">
            <Scale className="h-3.5 w-3.5" />
            {pack.legalReference}
          </div>
        </div>

        {/* Two-person rule notice/warning */}
        {isAuthor ? (
          <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">İki şəxs qaydası (Four-Eyes Principle):</span>
              <p className="mt-0.5">
                Siz ({currentUserName}) bu versiyanın müəllifisiniz. Qanunvericilik və daxili nəzarət tələblərinə əsasən təklif edən şəxs öz qaydasını təsdiqləyə bilməz. Zəhmət olmasa digər mühasib və ya hüquqşünasa müraciət edin.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-md text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>İki şəxs qaydası təmin olunur: Verifier ({currentUserName}) ≠ Editor ({latestVersion?.author || 'Sistem'})</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-700 rounded-md text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Verifier Role */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Təsdiq edən mütəxəssisin rolu
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={`p-3 rounded-lg border text-xs font-medium text-left transition-colors ${
                role === 'ACCOUNTANT'
                  ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
              onClick={() => setRole('ACCOUNTANT')}
            >
              <div className="font-semibold">Baş Mühasib / Vergi Mütəxəssisi</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Vergi, ƏDV və əmək haqqı qaydaları</div>
            </button>
            <button
              type="button"
              className={`p-3 rounded-lg border text-xs font-medium text-left transition-colors ${
                role === 'LAWYER'
                  ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
              onClick={() => setRole('LAWYER')}
            >
              <div className="font-semibold">Korporativ Hüquqşünas</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">İstehlakçı, əmək və fərdi məlumat hüququ</div>
            </button>
          </div>
        </div>

        {/* Effective date */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Qüvvəyə minmə tarixi (Bakı saatı ilə 00:00:00)
          </label>
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            required
          />
          <div className="text-[11px] text-zinc-500 mt-1">
            Göstərilən tarixin gecəyarısından etibarən bütün yeni əməliyyatlarda tətbiq olunacaq.
          </div>
        </div>

        {/* Evidence Notes (>= 20 chars) */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-medium text-zinc-400">
              Sübut və Əsaslandırma Qeydləri (Min. 20 simvol) *
            </label>
            <span
              className={`text-[11px] font-mono ${
                isEvidenceValid ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {evidenceNotes.trim().length} / 20
            </span>
          </div>
          <Textarea
            rows={3}
            placeholder="Məs: AR Vergi Məcəlləsinin 2026-cı il dəyişiklikləri və Nazirlər Kabinetinin müvafiq qərarı yoxlanıldı, parametrlər qanunla uyğundur."
            value={evidenceNotes}
            onChange={(e) => setEvidenceNotes(e.target.value)}
            required
          />
        </div>

        {/* Evidence File Attachment (Optional) */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Rəsmi Sənəd və ya Rəy Faylı (Könüllü)
          </label>
          <input
            type="file"
            className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setEvidenceFile(e.target.files[0]);
              }
            }}
          />
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button
            variant="default"
            type="submit"
            disabled={isSubmitting || isAuthor || !isEvidenceValid}
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'Təsdiqlənir...' : 'Təsdiqlə və Aktivləşdir'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
