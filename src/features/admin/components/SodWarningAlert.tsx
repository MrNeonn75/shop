import React from 'react';
import { SodViolation } from '../types/permissionsAdvanced';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';

interface SodWarningAlertProps {
  violations: SodViolation[];
}

export const SodWarningAlert: React.FC<SodWarningAlertProps> = ({ violations }) => {
  if (violations.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>Vəzifə Səlahiyyətlərinin Ayrılması (SoD) Ziddiyyəti Aşkar Edildi ({violations.length})</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Bu rola verilən bəzi icazələr korporativ daxili nəzarət qaydalarına (Segregation of Duties) ziddir.
        Eyni istifadəçinin həm əməliyyatı açması, həm də onu təsdiqləməsi fırıldaqçılıq və səhv riskini artırır.
      </p>

      <div className="space-y-2.5 pt-1">
        {violations.map(({ rule, presentPermissions }) => (
          <div
            key={rule.id}
            className="rounded border border-amber-500/30 bg-background/80 p-2.5 text-xs space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                {rule.titleAz} ({rule.code})
              </span>
              <Badge variant={rule.riskLevel === 'critical' ? 'danger' : 'warning'} size="sm">
                {rule.riskLevel === 'critical' ? 'KRİTİK RİSK' : 'YÜKSƏK RİSK'}
              </Badge>
            </div>

            <p className="text-muted-foreground text-[11px] leading-tight">
              {rule.descriptionAz}
            </p>

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-0.5">
              <span className="font-semibold text-foreground">Toqquşan icazələr:</span>
              <code className="bg-muted px-1 py-0.5 rounded text-destructive">{presentPermissions[0]}</code>
              <span>↔</span>
              <code className="bg-muted px-1 py-0.5 rounded text-destructive">{presentPermissions[1]}</code>
            </div>

            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
              💡 <strong>Tövsiyə:</strong> {rule.mitigationGuideAz}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
