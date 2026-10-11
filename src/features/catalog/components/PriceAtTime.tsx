import React from 'react';
import { PriceHistoryEntry } from '../types/catalog';
import { Qapik } from '../../../shared/utils/money';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { Tooltip } from '../../../components/ui/Tooltip';
import { History, ShieldCheck } from 'lucide-react';

import { getPriceAtTime } from '../utils/priceHistory';

export interface PriceAtTimeProps {
  history: PriceHistoryEntry[];
  atTime?: string | Date;
  fallbackPriceQapik?: Qapik;
  className?: string;
  showIcon?: boolean;
}

export const PriceAtTime: React.FC<PriceAtTimeProps> = ({
  history,
  atTime,
  fallbackPriceQapik = 0 as Qapik,
  className = '',
  showIcon = true,
}) => {
  const { priceQapik, entry } = getPriceAtTime(history, atTime, fallbackPriceQapik);

  const tooltipContent = (
    <div className="max-w-xs space-y-1 text-xs">
      <div className="flex items-center gap-1 font-semibold text-primary">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Tarixi Qiymət Qoruması</span>
      </div>
      {entry ? (
        <>
          <div>
            <span className="opacity-80">Qüvvəyə minmə: </span>
            <span>{formatDateTime(entry.effectiveFrom)}</span>
          </div>
          <div>
            <span className="opacity-80">Dəyişən: </span>
            <span>{entry.changedBy}</span>
          </div>
          {entry.reason && (
            <div>
              <span className="opacity-80">Səbəb: </span>
              <span className="italic">{entry.reason}</span>
            </div>
          )}
        </>
      ) : (
        <div className="opacity-80">
          Tarixçə qeydi tapılmadı. Cari baza qiymət tətbiq olunur.
        </div>
      )}
      <div className="pt-1 text-[10px] opacity-70 border-t border-white/20">
        Keçmiş sənədlərin qiymət tarixi heç vaxt yenidən yazılmır.
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <span
        className={`inline-flex items-center gap-1.5 font-semibold text-foreground cursor-help ${className}`}
      >
        {formatMoney(priceQapik)}
        {showIcon && (
          <History className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
        )}
      </span>
    </Tooltip>
  );
};
