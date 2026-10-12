import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { AuditLogEntryExtended } from '../types/securityAudit';
import { formatDateTime } from '../../../shared/utils/formatters';
import { GitCompare, Link } from 'lucide-react';

interface AuditDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: AuditLogEntryExtended | null;
}

export const AuditDiffModal: React.FC<AuditDiffModalProps> = ({
  isOpen,
  onClose,
  entry,
}) => {
  if (!entry) return null;

  const hasFieldDiffs = entry.fieldDiffs && entry.fieldDiffs.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Audit Dəyişikliklərinin Müqayisəsi (Before / After Diff)"
      size="lg"
    >
      <div className="space-y-4">
        {/* Entry Overview Banner */}
        <div className="bg-muted/40 p-3 rounded-lg border border-border text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">{entry.action}</span>
              <Badge variant="outline" size="sm">
                {entry.module}
              </Badge>
              {entry.isSensitive && (
                <Badge variant="danger" size="sm">
                  HƏSSAS ƏMƏLİYYAT
                </Badge>
              )}
            </div>
            <span className="text-muted-foreground text-[11px] font-mono">
              {formatDateTime(entry.timestamp)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] border-t border-border/60">
            <div>
              <span className="text-muted-foreground">İcraçı:</span>{' '}
              <strong className="text-foreground">{entry.userName}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Filial:</span>{' '}
              <strong className="text-foreground">{entry.branchName}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">IP Ünvanı:</span>{' '}
              <strong className="text-foreground font-mono">{entry.ipAddress}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Obyekt ID:</span>{' '}
              <strong className="text-foreground font-mono">{entry.entityId || '—'}</strong>
            </div>
          </div>

          {entry.correlationId && (
            <div className="flex items-center gap-1.5 text-[11px] text-bh-accent bg-bh-accent/10 p-1.5 rounded border border-bh-accent/20">
              <Link className="h-3 w-3 shrink-0" />
              <span>Əməliyyat Korrelyasiya Kodu (Correlation ID):</span>
              <strong className="font-mono">{entry.correlationId}</strong>
            </div>
          )}
        </div>

        {/* Detailed Explanation */}
        <div className="text-xs">
          <p className="font-semibold text-foreground mb-1">Əməliyyat Təfərrüatı:</p>
          <p className="p-2.5 rounded bg-background border border-border text-muted-foreground leading-relaxed">
            {entry.details}
          </p>
        </div>

        {/* Field Level Diffs */}
        {hasFieldDiffs ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <GitCompare className="h-3.5 w-3.5 text-bh-accent" />
              <span>Sahə Səviyyəsində Dəyişikliklər (Field-level Highlighting)</span>
            </div>

            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              <div className="bg-muted/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground grid grid-cols-12 gap-2">
                <div className="col-span-4">Parametr / Sahə</div>
                <div className="col-span-4 text-rose-600 dark:text-rose-400">Əvvəlki Dəyər (Before)</div>
                <div className="col-span-4 text-emerald-600 dark:text-emerald-400">Yeni Dəyər (After)</div>
              </div>

              {entry.fieldDiffs!.map((diff, i) => (
                <div
                  key={i}
                  className="px-3 py-2 text-xs grid grid-cols-12 gap-2 items-center bg-card hover:bg-muted/20"
                >
                  <div className="col-span-4">
                    <p className="font-semibold text-foreground">{diff.labelAz}</p>
                    <code className="text-[10px] text-muted-foreground">{diff.field}</code>
                    {diff.isSensitive && (
                      <span className="block text-[9px] text-amber-500 font-bold uppercase">Həssas</span>
                    )}
                  </div>

                  <div className="col-span-4 font-mono text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 p-1.5 rounded truncate">
                    {typeof diff.beforeValue === 'object'
                      ? JSON.stringify(diff.beforeValue)
                      : String(diff.beforeValue ?? '—')}
                  </div>

                  <div className="col-span-4 font-mono text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 p-1.5 rounded truncate">
                    {typeof diff.afterValue === 'object'
                      ? JSON.stringify(diff.afterValue)
                      : String(diff.afterValue ?? '—')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
            Bu hadisə üçün xüsusi sahə fərqi (diff) qeydə alınmayıb; əməliyyat yalnız oxu və ya daxilolma xarakterlidir.
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Bağla
          </Button>
        </div>
      </div>
    </Modal>
  );
};
