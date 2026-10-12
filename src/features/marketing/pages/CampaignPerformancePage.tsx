import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marketingRepository } from '../../../shared/adapters';
import { CampaignPerformance, Campaign } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  BarChart3,
  TrendingUp,
  Download,
  AlertTriangle,
  PieChart,
  Target,
  Info,
} from 'lucide-react';

export const CampaignPerformancePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get('campaignId') || 'cmp-1';

  const [performance, setPerformance] = useState<CampaignPerformance | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [perf, campList] = await Promise.all([
          marketingRepository.getCampaignPerformance(campaignId),
          marketingRepository.getCampaigns(),
        ]);
        setPerformance(perf);
        setCampaigns(campList);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [campaignId]);

  const handleExport = () => {
    alert('Performans hesabatı Excel formatında ixrac edildi.');
  };

  if (loading || !performance) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Performans analitikası yüklənir...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <BarChart3 className="h-7 w-7 text-primary" />
              Kampaniya Performansı və ROI Analitikası
            </h1>
            <Badge variant="outline" className="text-xs">
              Dövr: {performance.period.start} — {performance.period.end}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Satış gəliri, endirim xərcləri, filial artımı və konversiya qıfı.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            Hesabatı İxrac Et (XLSX)
          </Button>
        </div>
      </div>

      {/* Campaign Selector Banner */}
      <div className="p-3 rounded-lg border border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs font-semibold text-foreground">
          Aktiv Seçilmiş Kampaniya: <span className="text-primary">{performance.campaignName}</span>
        </span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Digər kampaniyaya bax:</span>
          <select
            value={campaignId}
            onChange={(e) => {
              window.location.search = `?campaignId=${e.target.value}`;
            }}
            className="text-xs rounded border border-input bg-background p-1"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Faktiki Satış Gəliri</span>
          <div className="text-2xl font-bold text-foreground font-mono">
            {formatMoney(performance.totalRevenueQapik)}
          </div>
          <div className="flex items-center text-xs text-success font-medium">
            <TrendingUp className="h-3.5 w-3.5 mr-1" />
            Baza dövrünə nisbətən +{performance.revenueLiftPercent}% artım
          </div>
        </Card>

        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Endirim Xərci (Güzəşt)</span>
          <div className="text-2xl font-bold text-warning font-mono">
            {formatMoney(performance.totalDiscountCostQapik)}
          </div>
          <span className="text-xs text-muted-foreground">
            {performance.unitsSold} ədəd məhsul üzrə güzəşt
          </span>
        </Card>

        {/* Gross Margin & ROI or Missing Data Notice */}
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Ümumi Marja (Gross Margin)</span>
          {performance.hasSufficientCostData && performance.grossMarginQapik !== undefined ? (
            <>
              <div className="text-2xl font-bold text-success font-mono">
                {formatMoney(performance.grossMarginQapik)}
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                Rentabellik: {performance.grossMarginPercent}%
              </span>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-warning">Məlumat çatışmır</div>
              <span className="text-xs text-muted-foreground">Maya dəyəri çatışmır</span>
            </>
          )}
        </Card>

        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Marketinq ROI</span>
          {performance.hasSufficientCostData && performance.spendRoiPercent !== undefined ? (
            <>
              <div className="text-2xl font-bold text-primary font-mono">
                {performance.spendRoiPercent}%
              </div>
              <span className="text-xs text-muted-foreground">Büdcə xərclərinə nisbətən gəlirlilik</span>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-warning">Məlumat çatışmır</div>
              <span className="text-xs text-muted-foreground">Hesablama aparılmayıb</span>
            </>
          )}
        </Card>
      </div>

      {/* Missing Data Fallback Box (if applicable) */}
      {!performance.hasSufficientCostData && performance.missingDataReasons && (
        <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-xs text-foreground space-y-1">
          <h4 className="font-semibold flex items-center gap-1.5 text-warning-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Marja və ROI Göstəriciləri üçün Məlumat Çatışmazlığı:
          </h4>
          <ul className="list-disc list-inside text-muted-foreground space-y-0.5 pt-1">
            {performance.missingDataReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Before / After Baseline Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Əvvəl / Sonra Müqayisəsi (Baseline vs Campaign)
          </h3>
          <div className="space-y-3 text-xs pt-1">
            <div className="flex justify-between items-center p-2 rounded bg-muted/40">
              <span className="text-muted-foreground">Kampaniyadan Əvvəlki Baza Dövriyyəsi:</span>
              <span className="font-mono font-semibold text-foreground">
                {formatMoney(performance.baselineRevenueQapik)}
              </span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-success/10 border border-success/20">
              <span className="text-success font-medium">Kampaniya Dövründəki Satış:</span>
              <span className="font-mono font-bold text-success text-sm">
                {formatMoney(performance.totalRevenueQapik)}
              </span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-primary/10">
              <span className="text-primary font-medium">Xalis Satış Artımı (Lift):</span>
              <span className="font-bold text-primary font-mono text-sm">
                +{performance.revenueLiftPercent}%
              </span>
            </div>
          </div>
        </Card>

        {/* Redemption Funnel */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Konversiya və İstifadə Qıfı (Funnel)
          </h3>
          <div className="space-y-2 text-xs pt-1">
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">1. Auditoriya / İzləyicilər:</span>
              <span className="font-mono font-semibold">
                {performance.funnel.impressionsOrAudience.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">2. Kupon Verilən / Maraqlanan:</span>
              <span className="font-mono font-semibold">
                {performance.funnel.codesIssuedOrEngaged.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">3. Kassa İstifadəsi (Redemptions):</span>
              <span className="font-mono font-semibold">
                {performance.funnel.redemptions.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-success/15 font-semibold text-success">
              <span>4. Real Konversiya:</span>
              <span className="font-mono text-sm">
                {performance.funnel.conversions.toLocaleString()} (
                {Math.round(
                  (performance.funnel.conversions / performance.funnel.impressionsOrAudience) * 100
                )}
                %)
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Branch Breakdown Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h3 className="font-semibold text-sm text-foreground">
            Filiallar Üzrə Nəticələrin Bölüşdürülməsi
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Filial Adı</th>
                <th className="px-3 py-3 text-right">Satış Gəliri</th>
                <th className="px-3 py-3 text-right">Endirim Xərci</th>
                <th className="px-3 py-3 text-right">Satılmış Ədəd</th>
                <th className="px-4 py-3 text-right">Gəlir Payı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {performance.branchBreakdown.map((b) => {
                const sharePercent =
                  performance.totalRevenueQapik > 0
                    ? Math.round((b.revenueQapik / performance.totalRevenueQapik) * 100)
                    : 0;
                return (
                  <tr key={b.branchId} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">{b.branchName}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                      {formatMoney(b.revenueQapik)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-warning text-xs">
                      {formatMoney(b.discountCostQapik)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
                      {b.units} ədəd
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-primary">
                      {sharePercent}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legal & Security constraint footer notice */}
      <div className="p-3 rounded-lg border border-border/80 bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 text-primary shrink-0" />
        <span>
          Təhlükəsizlik və Maliyyə Bütövlüyü Tələbi: Marketinq istifadəçiləri bağlanmış və fiskallaşmış satış sənədlərini dəyişə və ya ləğv edə bilməz.
        </span>
      </div>
    </div>
  );
};
