import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { SettingsFieldDiff } from '../types/systemSettings';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface SettingsDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  diffs: SettingsFieldDiff[];
  onConfirmSave?: (reason: string) => Promise<void>;
  onConfirm?: (reason: string) => Promise<void>;
  isSaving?: boolean;
}

export const SettingsDiffModal: React.FC<SettingsDiffModalProps> = ({
  isOpen,
  onClose,
  diffs,
  onConfirmSave,
  onConfirm,
  isSaving = false,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmAction = onConfirmSave || onConfirm;
  const isBusy = isSubmitting || isSaving;

  const hasSensitiveChanges = diffs.some((d) => d.isSensitive);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 5) {
      setError('Parametrlərin yenilənməsi üçün əsaslandırılmış səbəb (ən azı 5 simvol) daxil edilməlidir.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (confirmAction) {
        await confirmAction(reason);
      }
      setReason('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Yadda saxlamaq mümkün olmadı';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Parametr Dəyişikliklərinin Təsdiqi (Fərqlərə Baxış və Səbəb)"
      size="lg"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Sistem parametrlərini yadda saxlamazdan əvvəl dəyişdirilən sahələri nəzərdən keçirin. Bütün dəyişikliklər versiyalanır və audit jurnalında qeydə alınır.
        </p>

        {hasSensitiveChanges && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Həssas Maliyyə / Əməliyyat Parametri Dəyişdirilir!</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Vergi dərəcəsi, mənfi qalıq, qaytarma müddəti və ya kassa endirim limiti kimi kritik biznes qaydaları dəyişdirilir. Əsaslandırma məcburidir.
              </p>
            </div>
          </div>
        )}

        {/* Diffs Table */}
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          <div className="bg-muted/60 px-3 py-2 text-[11px] font-semibold text-muted-foreground grid grid-cols-12 gap-2">
            <div className="col-span-4">Bölmə & Sahə</div>
            <div className="col-span-4 text-rose-600 dark:text-rose-400">Əvvəlki Dəyər</div>
            <div className="col-span-4 text-emerald-600 dark:text-emerald-400">Yeni Dəyər</div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-border/60">
            {diffs.map((diff, idx) => (
              <div key={idx} className="px-3 py-2 text-xs grid grid-cols-12 gap-2 items-center hover:bg-muted/20">
                <div className="col-span-4 space-y-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">
                    {diff.sectionLabelAz}
                  </span>
                  <p className="font-semibold text-foreground">{diff.fieldLabelAz}</p>
                  {diff.isSensitive && (
                    <Badge variant="danger" size="sm" className="text-[9px] px-1 py-0">
                      HƏSSAS
                    </Badge>
                  )}
                </div>

                <div className="col-span-4 font-mono text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 p-1 rounded truncate">
                  {String(diff.oldValue ?? '—')}
                </div>

                <div className="col-span-4 font-mono text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 p-1 rounded truncate">
                  {String(diff.newValue ?? '—')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reason / Justification Input */}
        <div className="space-y-1.5 pt-1">
          <label className="block text-xs font-semibold text-foreground">
            Dəyişikliyin Əsaslandırılması (Audit üçün səbəb) <span className="text-destructive">*</span>
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder="məs: Rəhbərliyin qərarı ilə bayram ərəfəsində filial kassa endirim limitinin artırılması"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isBusy}>
            Ləğv Et
          </Button>
          <Button type="submit" variant="default" size="sm" disabled={isBusy}>
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            Təsdiq Et və Yadda Saxla
          </Button>
        </div>
      </form>
    </Modal>
  );
};
