import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { AuditLogEntryExtended } from '../types/securityAudit';
import { formatDateTime } from '../../../shared/utils/formatters';
import { History, Clock, User } from 'lucide-react';

interface EntityAuditTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  entityName?: string;
  timeline?: AuditLogEntryExtended[];
}

export const EntityAuditTimelineModal: React.FC<EntityAuditTimelineModalProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  timeline = [],
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Obyekt Audit Tarixçəsi: ${entityType.toUpperCase()} #${entityId}`}
      size="lg"
    >
      <div className="space-y-4">
        <div className="bg-muted/40 p-3 rounded-lg border border-border text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-bh-accent shrink-0" />
            <span>
              Obyekt Növü: <strong>{entityType}</strong> • Kod / ID: <strong>{entityId}</strong>
              {entityName && <span className="ml-2 text-muted-foreground">({entityName})</span>}
            </span>
          </div>
          <Badge variant="outline" size="sm">
            {timeline.length} Hadisə
          </Badge>
        </div>

        {timeline.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
            Bu obyekt üçün hələlik heç bir audit qeydi tapılmadı.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {timeline.map((entry) => (
              <div key={entry.id} className="relative group">
                {/* Dot */}
                <div className="absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-bh-accent ring-2 ring-bh-accent/20" />

                <div className="bg-card p-3 rounded-lg border border-border text-xs space-y-1.5 shadow-2xs hover:border-bh-accent/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground text-xs">{entry.action}</span>
                    <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(entry.timestamp)}
                    </span>
                  </div>

                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {entry.details}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-muted-foreground border-t border-border/60">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <strong>{entry.userName}</strong> ({entry.userRole})
                    </span>
                    <span>Filial: <strong>{entry.branchName}</strong></span>
                    {entry.correlationId && (
                      <span className="text-bh-accent font-mono">
                        Link: {entry.correlationId}
                      </span>
                    )}
                    {entry.isSensitive && (
                      <Badge variant="danger" size="sm" className="text-[9px] px-1 py-0">
                        HƏSSAS
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
