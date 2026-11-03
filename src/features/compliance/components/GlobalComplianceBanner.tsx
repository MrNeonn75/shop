import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldAlert, ArrowRight, X } from 'lucide-react';
import { complianceRepository } from '../../../shared/adapters';
import { ComplianceBannerResponse } from '../types';

export const GlobalComplianceBanner: React.FC = () => {
  const [bannerData, setBannerData] = useState<ComplianceBannerResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    complianceRepository.getBannerStatus().then((data) => {
      if (mounted) {
        setBannerData(data);
      }
    }).catch(() => {
      // Graceful fallback
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!bannerData || !bannerData.showBanner || dismissed) {
    return null;
  }

  const isProduction = bannerData.environment === 'production';
  const unverified = (bannerData as any).unverifiedCount ?? bannerData.unverifiedDomains?.length ?? 0;
  const disputed = (bannerData as any).disputedCount ?? 0;
  const hasUnverified = unverified > 0;
  const hasDisputed = disputed > 0;

  return (
    <div
      role="alert"
      className={`relative z-50 px-4 py-2 text-sm flex items-center justify-between border-b transition-colors ${
        isProduction && hasUnverified
          ? 'bg-rose-900/90 text-rose-100 border-rose-700'
          : 'bg-amber-950/80 text-amber-200 border-amber-800/60'
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        {isProduction ? (
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 animate-pulse" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
        )}
        <div className="flex items-center gap-2 flex-wrap text-xs md:text-sm">
          {bannerData.isDemo && (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono text-xs font-semibold">
              DEMO
            </span>
          )}
          <span className="font-medium">
            {isProduction
              ? `BLOKLAYICI XƏBƏRDARLIQ: Sistemdə ${unverified} ədəd təsdiqlənməmiş hüquqi qayda paketi var. Əsas əməliyyatlar məhdudlaşdırılıb.`
              : `DİQQƏT (Qeyri-istehsalat): Sistemdə ${unverified} ədəd təsdiqlənməmiş qayda paketi istifadə olunur.`}
            {hasDisputed && ` (${disputed} mübahisəli)`}
          </span>
          <span className="text-zinc-400 text-xs hidden sm:inline">
            — Qaydalar mühasib/hüquqşünas tərəfindən təsdiqlənməlidir.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/compliance"
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            isProduction
              ? 'bg-rose-800 hover:bg-rose-700 text-white'
              : 'bg-amber-800/80 hover:bg-amber-700 text-amber-100'
          }`}
        >
          <span>Qaydaları təsdiqlə</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {!isProduction && (
          <button
            onClick={() => setDismissed(true)}
            aria-label="Xəbərdarlığı bağla"
            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
