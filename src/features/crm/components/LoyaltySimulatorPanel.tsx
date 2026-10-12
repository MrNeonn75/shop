import React, { useState, useMemo } from 'react';
import { CustomerTier, LoyaltyProgramConfig } from '../types';
import { simulateLoyaltyCalculation } from '../utils/loyaltyEngine';
import { aznToQapik, formatMoney } from '../../../shared/utils/formatters';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Calculator, Award, Gift } from 'lucide-react';

interface LoyaltySimulatorPanelProps {
  config: LoyaltyProgramConfig;
}

export const LoyaltySimulatorPanel: React.FC<LoyaltySimulatorPanelProps> = ({ config }) => {
  const [tier, setTier] = useState<CustomerTier>('gold');
  const [cartAzn, setCartAzn] = useState<number>(250);
  const [selectedCategory, setSelectedCategory] = useState<string>('Ayaqqabı');
  const [isBirthday, setIsBirthday] = useState<boolean>(false);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(30);

  const simulation = useMemo(() => {
    return simulateLoyaltyCalculation(
      {
        tier,
        cartTotalQapik: aznToQapik(cartAzn),
        categoryNames: selectedCategory ? [selectedCategory] : [],
        pointsToRedeem,
        isBirthday,
      },
      config
    );
  }, [tier, cartAzn, selectedCategory, isBirthday, pointsToRedeem, config]);

  return (
    <Card className="p-5 space-y-5 bg-card border border-border">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Loyallıq Hesablama Qaydaları Simulyatoru (Sandbox)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Müştərinin statusuna və alış çeşidinə görə qazanılan və silinən balları real vaxtda yoxlayın.
          </p>
        </div>
        <Badge variant="outline" className="text-xs w-fit">
          Versiya: {config.version} (Qüvvədədir: {config.effectiveDate})
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Parameters */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Müştəri Dərəcəsi (Tier)
              </label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as CustomerTier)}
                className="w-full text-xs rounded-md border border-input bg-background p-2"
              >
                <option value="bronze">Bürünc (1.0x)</option>
                <option value="silver">Gümüş (1.2x)</option>
                <option value="gold">Qızıl (1.5x)</option>
                <option value="platinum">Platin (2.0x)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Səbət Məbləği (AZN)
              </label>
              <input
                type="number"
                min="10"
                step="10"
                value={cartAzn}
                onChange={(e) => setCartAzn(Math.max(1, parseFloat(e.target.value) || 0))}
                className="w-full text-xs rounded-md border border-input bg-background p-2 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Əsas Kateqoriya (Multiplikator)
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full text-xs rounded-md border border-input bg-background p-2"
              >
                <option value="Standart Geyim">Standart Geyim (1.0x)</option>
                <option value="Ayaqqabı">Ayaqqabı (1.5x Çoxaldıcı)</option>
                <option value="Aksessuarlar">Aksessuarlar (1.2x Çoxaldıcı)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Silinmək İstənən Bal
              </label>
              <input
                type="number"
                min="0"
                value={pointsToRedeem}
                onChange={(e) => setPointsToRedeem(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full text-xs rounded-md border border-input bg-background p-2 font-mono"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs p-2.5 rounded bg-muted/30 border border-border">
            <input
              type="checkbox"
              checked={isBirthday}
              onChange={(e) => setIsBirthday(e.target.checked)}
              className="rounded"
            />
            <span className="font-medium text-foreground flex items-center gap-1.5">
              <Gift className="h-4 w-4 text-primary" />
              Müştərinin Doğum Günü Həftəsidir (+{config.birthdayRules.bonusPoints} Hədiyyə Balı)
            </span>
          </label>
        </div>

        {/* Calculation Outputs */}
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2.5 text-xs">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
              <Award className="h-4 w-4 text-primary" />
              Qazanılacaq Loyallıq Balları:
            </h4>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2 rounded bg-background border border-border">
                <div className="text-muted-foreground text-[11px]">Baza Bal</div>
                <div className="text-sm font-bold text-foreground mt-0.5">
                  {simulation.basePointsEarned}
                </div>
              </div>
              <div className="p-2 rounded bg-background border border-border">
                <div className="text-muted-foreground text-[11px]">Bonus Bal</div>
                <div className="text-sm font-bold text-success mt-0.5">
                  +{simulation.bonusPointsEarned}
                </div>
              </div>
              <div className="p-2 rounded bg-background border border-border">
                <div className="text-muted-foreground text-[11px]">Cəmi Qazanc</div>
                <div className="text-sm font-bold text-primary mt-0.5">
                  {simulation.totalPointsEarned} bal
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2 text-xs">
            <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
              <span>Bal ilə Ödəniş (Redemption) Qaydası:</span>
              <span className="text-xs text-muted-foreground font-normal">
                Maks. {config.redemptionRules.maxReceiptPercentage}% limit
              </span>
            </h4>

            <div className="space-y-1.5 pt-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>İcazə Verilən Maks. Bal:</span>
                <span className="font-semibold text-foreground">
                  {simulation.maxRedeemablePoints} bal
                </span>
              </div>
              <div className="flex justify-between">
                <span>Faktiki Tətbiq Edilən Bal:</span>
                <span className="font-semibold text-primary">
                  {simulation.requestedPointsRedeemed} bal
                </span>
              </div>
              <div className="flex justify-between text-success">
                <span>Bal Endirimi Məbləği:</span>
                <span className="font-mono font-bold">
                  -{formatMoney(simulation.redemptionDiscountQapik)}
                </span>
              </div>
              <div className="pt-2 border-t border-border flex justify-between font-bold text-sm text-foreground">
                <span>Yekun Kassa Ödənişi:</span>
                <span className="font-mono text-primary text-base">
                  {formatMoney(simulation.finalPayableQapik)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
