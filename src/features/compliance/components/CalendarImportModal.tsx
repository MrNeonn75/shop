import React, { useState } from 'react';

import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { Calendar, Upload, AlertCircle } from 'lucide-react';
import { complianceRepository } from '../../../shared/adapters';

interface CalendarImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CalendarImportModal: React.FC<CalendarImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const defaultJson = JSON.stringify(
    {
      year: 2026,
      totalWorkingDays: 241,
      totalWorkingHours: 1922,
      preHolidayShortenedDays: 7,
      publicHolidaysCount: 19,
      notes: 'AR Əmək və Əhalinin Sosial Müdafiəsi Nazirliyinin 2026-cı il İstehsalat Təqvimi sərəncamı',
    },
    null,
    2
  );

  const [inputData, setInputData] = useState(defaultJson);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    let parsed: any;
    try {
      parsed = JSON.parse(inputData);
    } catch {
      setErrorMessage('Daxil edilən məlumat düzgün JSON formatında deyil.');
      return;
    }

    if (!parsed.year || !parsed.totalWorkingDays || !parsed.totalWorkingHours) {
      setErrorMessage('Təqvim məlumatlarında il, iş günlərinin və iş saatlarının sayı mütləqdir.');
      return;
    }

    try {
      setIsSubmitting(true);
      await complianceRepository.importProductionCalendar({
        year: Number(parsed.year),
        workingDays: Number(parsed.totalWorkingDays || parsed.workingDays),
        workingHours: Number(parsed.totalWorkingHours || parsed.workingHours),
        sourceRef: parsed.notes || 'AR İstehsalat Təqvimi 2026',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Təqvim idxal edilərkən xəta baş verdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rəsmi İstehsalat Təqviminin İdxalı (2026)"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-zinc-300">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs space-y-1">
          <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-indigo-400" />
            Azərbaycan Respublikası İstehsalat Təqvimi Standartı
          </div>
          <p className="text-zinc-400">
            Hər il Nazirlər Kabineti və ƏƏSMN tərəfindən təsdiq edilən rəsmi iş saatları norması (241 iş günü, 1922 saat). Bu norma cədvəl tərtibatı və artıq iş vaxtı hesablamalarında əsas götürülür.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-700 rounded-md text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Təqvim Məlumatları (JSON strukturu)
          </label>
          <Textarea
            rows={8}
            className="font-mono text-xs text-indigo-300 bg-zinc-950"
            value={inputData}
            onChange={(e) => setInputData(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button variant="default" type="submit" disabled={isSubmitting}>
            <Upload className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'İdxal olunur...' : 'Təsdiq et və İdxal et'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
