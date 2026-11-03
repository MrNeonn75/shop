import React, { useState } from 'react';
import { RulePack } from '../types';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { complianceRepository } from '../../../shared/adapters';
import { GitPullRequest, AlertCircle } from 'lucide-react';

interface RuleProposalModalProps {
  pack: RulePack | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserName?: string;
}

export const RuleProposalModal: React.FC<RuleProposalModalProps> = ({
  pack,
  isOpen,
  onClose,
  onSuccess,
  currentUserName = 'Tural Əliyev', // Default editor user
}) => {
  const [paramsJson, setParamsJson] = useState(() => {
    if (!pack) return '{}';
    const vers = pack.versions || [];
    return JSON.stringify(vers[vers.length - 1]?.parameters || {}, null, 2);
  });
  const [changeNotes, setChangeNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!pack) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = JSON.parse(paramsJson);
    } catch {
      setErrorMessage('Parametrlər düzgün JSON formatında olmalıdır.');
      return;
    }

    if (!changeNotes.trim()) {
      setErrorMessage('Dəyişikliyin səbəbi və izahatı qeyd edilməlidir.');
      return;
    }

    try {
      setIsSubmitting(true);
      await complianceRepository.proposeChange(pack.id, {
        author: currentUserName,
        parameters: parsedParams,
        changeNotes: changeNotes.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Təklif göndərilərkən xəta baş verdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Qaydada Dəyişiklik Təklif Et (Yeni Layihə)"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-zinc-300">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-400">Paket:</div>
          <div className="font-semibold text-zinc-100">{pack.title}</div>
          <div className="text-xs text-zinc-400 mt-1">Cari versiya: v{pack.version}</div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-700 rounded-md text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Dəyişikliyin Əsaslandırılması və İzahı *
          </label>
          <Textarea
            rows={2}
            placeholder="Məs: Qanunvericiliyə edilən yeni dəyişikliyə əsasən dərəcə və ya hədd yenilənir..."
            value={changeNotes}
            onChange={(e) => setChangeNotes(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Təklif Edilən Parametrlər (JSON) *
          </label>
          <Textarea
            rows={8}
            className="font-mono text-xs text-emerald-400 bg-zinc-950"
            value={paramsJson}
            onChange={(e) => setParamsJson(e.target.value)}
            required
          />
        </div>

        <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-400">
          Qeyd: Təklif olunan dəyişiklik avtomatik olaraq UNVERIFIED statusu alacaq və qüvvəyə minməsi üçün başqa bir səlahiyyətli mütəxəssis (mühasib və ya hüquqşünas) tərəfindən təsdiqlənməlidir.
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button variant="default" type="submit" disabled={isSubmitting}>
            <GitPullRequest className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'Göndərilir...' : 'Təklifi Göndər'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
