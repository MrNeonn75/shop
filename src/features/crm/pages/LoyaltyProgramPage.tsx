import React, { useState, useEffect } from 'react';
import { crmRepository } from '../../../shared/adapters';
import { LoyaltyProgramConfig } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { LoyaltySimulatorPanel } from '../components/LoyaltySimulatorPanel';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  Award,
  Settings,
  Gift,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const LoyaltyProgramPage: React.FC = () => {
  const [config, setConfig] = useState<LoyaltyProgramConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const data = await crmRepository.getLoyaltyConfig();
        setConfig(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  if (loading || !config) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loyallıq konfiqurasiyası yüklənir...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Award className="h-7 w-7 text-primary" />
              {config.programName}
            </h1>
            <Badge variant="outline" className="text-xs font-mono">
              Versiya {config.version}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Qazanılma, silinmə, dərəcə pillələri, mükafat kataloqu və qaytarılma zamanı bal ləğvi qaydaları.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="info" className="text-xs">
            Qüvvədə olma tarixi: {config.effectiveDate}
          </Badge>
        </div>
      </div>

      {/* Simulator Sandbox */}
      <LoyaltySimulatorPanel config={config} />

      {/* Program Rules Configuration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Earn Rules */}
        <Card className="p-5 space-y-3 border border-border">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Bal Qazanma Qaydaları (Accrual)</h3>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between py-1 border-b border-border/50">
              <span>Baza Nisbəti:</span>
              <span className="font-semibold text-foreground">
                Hər {config.earnRules.qapikPerPoint / 100} ₼ üçün 1 bal
              </span>
            </div>
            <div className="py-1 border-b border-border/50">
              <span className="block mb-1 font-medium text-foreground">Dərəcə Çoxaldıcıları (Multipliers):</span>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <div>• Bürünc: 1.0x</div>
                <div>• Gümüş: {config.earnRules.tierMultipliers.silver}x</div>
                <div>• Qızıl: {config.earnRules.tierMultipliers.gold}x</div>
                <div>• Platin: {config.earnRules.tierMultipliers.platinum}x</div>
              </div>
            </div>
            <div className="py-1">
              <span className="block mb-1 font-medium text-foreground">Kateqoriya Üzrə Bonuslar:</span>
              {Object.entries(config.earnRules.categoryMultipliers).map(([cat, mult]) => (
                <div key={cat} className="flex justify-between text-[11px]">
                  <span>{cat}:</span>
                  <span className="font-semibold text-primary">{mult}x Bal</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Card 2: Redemption Rules */}
        <Card className="p-5 space-y-3 border border-border">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Ödəniş və Silinmə (Redemption)</h3>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between py-1 border-b border-border/50">
              <span>1 Balın Dəyəri:</span>
              <span className="font-semibold text-foreground">
                {formatMoney(config.redemptionRules.pointValueQapik)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span>Maks. Çek Payı:</span>
              <span className="font-semibold text-primary font-mono text-sm">
                Maks. {config.redemptionRules.maxReceiptPercentage}%
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span>Min. Silinmə Limiti:</span>
              <span className="font-semibold text-foreground">
                {config.redemptionRules.minPointsToRedeem} bal
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span>Balın Yararlılıq Müddəti:</span>
              <span className="font-semibold text-foreground">
                {config.expiryRules.pointsExpireMonths} ay fəaliyyətsizlik
              </span>
            </div>
          </div>
        </Card>

        {/* Card 3: Tier Thresholds & Reversals */}
        <Card className="p-5 space-y-3 border border-border">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <RotateCcw className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Pillələr və Qaytarılma Reversalı</h3>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="py-1 border-b border-border/50">
              <span className="block mb-1 font-medium text-foreground">
                12 Aylıq Sürüşən Xərcləmə Limitləri:
              </span>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Gümüş (Silver):</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatMoney(config.tierRules.silverThresholdQapik)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Qızıl (Gold):</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatMoney(config.tierRules.goldThresholdQapik)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Platin (Platinum):</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatMoney(config.tierRules.platinumThresholdQapik)}
                  </span>
                </div>
              </div>
            </div>
            <div className="py-1">
              <span className="block mb-1 font-medium text-foreground">Məhsul Qaytarılması Zamanı:</span>
              <div className="space-y-0.5 text-[11px]">
                <div className="text-destructive font-medium">
                  ✓ Qazanılmış ballar mütənasib silinir
                </div>
                <div className="text-success font-medium">
                  ✓ Xərclənmiş ballar müştəriyə geri qaytarılır
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Rewards Catalog */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Loyallıq Mükafatları və Hədiyyələr Kataloqu
          </h3>
          <Badge variant="outline" className="text-xs">
            {config.rewardsCatalog.length} Mükafat Növü
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {config.rewardsCatalog.map((rew) => (
            <Card key={rew.id} className="p-4 space-y-2.5 border border-border">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-sm text-foreground">{rew.title}</h4>
                <Badge variant="success" className="font-mono text-xs">
                  {rew.pointsRequired} Bal
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{rew.description}</p>
              <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{rew.category}</span>
                <span>Qalıq: <strong className="text-foreground">{rew.availableQty} ədəd</strong></span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
