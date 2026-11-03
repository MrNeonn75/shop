import React, { useEffect, useState } from 'react';
import { TurnoverMonitorData } from '../types';
import { complianceRepository } from '../../../shared/adapters';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { AlertTriangle, TrendingUp, Info, ShieldAlert } from 'lucide-react';

export const TurnoverMonitorWidget: React.FC = () => {
  const [data, setData] = useState<TurnoverMonitorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    complianceRepository.getTurnoverMonitor().then((res) => {
      if (mounted) {
        setData(res);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !data) {
    return (
      <Card className="p-4 bg-zinc-900 border-zinc-800 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-1/3 mb-3"></div>
        <div className="h-6 bg-zinc-800 rounded w-2/3"></div>
      </Card>
    );
  }

  const threshold = data.threshold || 200000;
  const cashlessTurnover = data.cashlessTurnover || 0;
  const cashTurnover = data.cashTurnover || 0;
  const cashlessCoefficient = data.cashlessCoefficient ?? (data as any).coefficientApplied ?? 0.5;
  const adjustedTurnover = data.adjustedTurnover ?? (cashTurnover + cashlessTurnover * cashlessCoefficient);
  const percentage = data.percentage ?? (data as any).percentOfThreshold ?? Math.round((adjustedTurnover / threshold) * 100);
  const alertLevel = data.alertLevel || 'NORMAL';
  const isDemo = !!data.isDemo;

  const getAlertBanner = () => {
    if (alertLevel === 'EXCEEDED') {
      return (
        <div className="flex items-center gap-2 p-2.5 bg-rose-950/80 border border-rose-700 rounded-md text-xs text-rose-200 mt-3">
          <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
          <span>HƏDD KEÇİLDİ: 200,000 AZN həddi aşıldı. AR VM 155-ci maddəsinə əsasən ƏDV qeydiyyatı zəruridir.</span>
        </div>
      );
    }
    if (alertLevel === 'CRITICAL_95') {
      return (
        <div className="flex items-center gap-2 p-2.5 bg-rose-950/50 border border-rose-800 rounded-md text-xs text-rose-300 mt-3">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>TƏCİLİ: İllik dövriyyə həddinin 95%-i tamamlandı. ƏDV qeydiyyatı sənədlərini hazırlayın.</span>
        </div>
      );
    }
    if (alertLevel === 'WARNING_80') {
      return (
        <div className="flex items-center gap-2 p-2.5 bg-amber-950/50 border border-amber-800 rounded-md text-xs text-amber-300 mt-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>DİQQƏT: İllik dövriyyə həddinin 80%-i keçildi. ƏDV öhdəliyi riski mövcuddur.</span>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-5 bg-zinc-900/90 border-zinc-800 relative overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-zinc-100">
            İllik Dövriyyə Monitorinqi (ƏDV Öhdəliyi)
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium">
              DEMO
            </span>
          )}
          <Badge
            variant={
              percentage >= 100
                ? 'danger'
                : percentage >= 80
                ? 'warning'
                : 'success'
            }
          >
            {percentage}%
          </Badge>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-800 rounded-full h-3.5 overflow-hidden mb-3">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            percentage >= 100
              ? 'bg-rose-500'
              : percentage >= 80
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Numbers Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-zinc-800/80">
        <div>
          <div className="text-zinc-500">Tənzimlənmiş Dövriyyə</div>
          <div className="text-zinc-100 font-mono font-semibold text-sm mt-0.5">
            {adjustedTurnover.toLocaleString('az-AZ')} ₼
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Qanuni Hədd</div>
          <div className="text-zinc-100 font-mono font-semibold text-sm mt-0.5">
            {threshold.toLocaleString('az-AZ')} ₼
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Nağdsız (×{cashlessCoefficient})</div>
          <div className="text-zinc-300 font-mono text-xs mt-1">
            {cashlessTurnover.toLocaleString('az-AZ')} ₼
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Nağd Satışlar</div>
          <div className="text-zinc-300 font-mono text-xs mt-1">
            {cashTurnover.toLocaleString('az-AZ')} ₼
          </div>
        </div>
      </div>

      {/* Alert banner if crossed threshold */}
      {getAlertBanner()}

      {/* Draft Disclaimer */}
      <div className="flex items-start gap-1.5 mt-3 pt-2 text-[11px] text-zinc-500 border-t border-zinc-800/40">
        <Info className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
        <span>
          DRAFT İNDİKATOR: Bu göstərici yalnız məlumat xarakterlidir və rəsmi bəyannamə yerinə keçmir. Nağdsız satışlara AR Vergi Məcəlləsinə uyğun olaraq 0.5 əmsalı tətbiq olunmuşdur.
        </span>
      </div>
    </Card>
  );
};
