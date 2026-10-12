import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface TaxComplianceNoticeProps {
  className?: string;
  compact?: boolean;
}

/**
 * Standard tax compliance advisory banner.
 * Mandatory ERP Principle:
 * "Tax rates/rules come from configuration only; never hardcode legal rates or state regulatory compliance.
 * Show a note: 'Vergi qaydaları Azərbaycan tələblərinə uyğun yoxlanılmalıdır.'"
 */
export const TaxComplianceNotice: React.FC<TaxComplianceNoticeProps> = ({ className = '', compact = false }) => {
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800 ${className}`}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>Vergi qaydaları Azərbaycan tələblərinə uyğun yoxlanılmalıdır.</span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-sm text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/30 dark:text-amber-300 ${className}`}>
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
      <div className="flex-1 space-y-1">
        <p className="font-semibold text-amber-900 dark:text-amber-200">
          Vergi və Tənzimləmə Qaydaları Qeydi
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Vergi dərəcələri və hesablamaları sistem konfiqurasiyalarından götürülür. Vergi qaydaları Azərbaycan tələblərinə uyğun yoxlanılmalıdır.
        </p>
      </div>
    </div>
  );
};

