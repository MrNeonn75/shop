import React from 'react';
import { AlertCircle } from 'lucide-react';

interface StatutoryTaxNoticeProps {
  compact?: boolean;
  className?: string;
}

export const StatutoryTaxNotice: React.FC<StatutoryTaxNoticeProps> = ({
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2.5 ${
        compact ? 'p-2.5 text-xs' : 'p-3.5 text-xs sm:text-sm'
      } ${className}`}
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
      <div className="space-y-0.5">
        <p className="font-semibold text-amber-950 dark:text-amber-100">
          Qanunvericilik və Vergi Qaydaları Bildirişi
        </p>
        <p className="leading-relaxed">
          Vergi və sosial sığorta qaydaları Azərbaycan qanunvericiliyinə (Vergi Məcəlləsi və Sosial Sığorta haqqında Qanun) uyğun yoxlanılmalıdır. Hesablanmış məbləğlər konfiqurasiya olunmuş dərəcələr əsasındadır.
        </p>
      </div>
    </div>
  );
};

