import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { SuspiciousActivityMetric } from '../types/securityAudit';
import { securityAuditRepository } from '../../../shared/adapters';
import { formatMoney } from '../../../shared/utils/formatters';
import {
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Building2,
  RefreshCw,
  Sliders,
} from 'lucide-react';

export const SuspiciousActivityPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [metrics, setMetrics] = useState<SuspiciousActivityMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const data = await securityAuditRepository.getSuspiciousActivityMetrics();
      setMetrics(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Şübhəli fəaliyyət göstəricilərini yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const getRiskBadge = (score: SuspiciousActivityMetric['riskScore']) => {
    switch (score) {
      case 'critical':
        return (
          <Badge variant="danger" size="sm" className="font-bold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Yüksək Risk (Kritik)
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="warning" size="sm" className="font-semibold flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            Xəbərdarlıq
          </Badge>
        );
      default:
        return (
          <Badge variant="success" size="sm">
            Normal Limit
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Təhlükəsizlik və Audit' },
          { label: 'Şübhəli Əməliyyat Monitorinqi' },
        ]}
      />

      <PageHeader
        title="Şübhəli Əməliyyatlar və Fırıldaqçılıq İndikatorları"
        description="Kassirlər və operatorlar üzrə ləğv (void), qaytarma və endirim nisbətləri, kassa kənarlaşmaları və təkrarlanan əl ilə müdaxilələrin təhlili."
        badge={
          <Badge variant="neutral" size="sm">
            Avtomatlaşdırılmış Nəzarət
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMetrics}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Göstəriciləri Yenilə
          </Button>
        }
      />

      {/* Thresholds Info Card */}
      <Card>
        <CardContent className="p-4 bg-muted/20 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Sliders className="h-4 w-4 text-bh-accent" />
            <span>Qüvvədə Olan Təhlükəsizlik Meyarları və Limitləri (Thresholds)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-muted-foreground pt-1">
            <div className="p-2.5 rounded-lg border border-border bg-card">
              <span className="block font-semibold text-foreground">Çek Ləğvi (Void) Həddi</span>
              <span>Ümumi çeklərin &gt; 5.0%-i</span>
            </div>
            <div className="p-2.5 rounded-lg border border-border bg-card">
              <span className="block font-semibold text-foreground">Qaytarma Nisbəti</span>
              <span>Satış çeklərinin &gt; 10.0%-i</span>
            </div>
            <div className="p-2.5 rounded-lg border border-border bg-card">
              <span className="block font-semibold text-foreground">Kassa Kənarlaşması (Kassa Kəsiri)</span>
              <span>Günlük mənfi fərq &gt; 20.00 ₼</span>
            </div>
            <div className="p-2.5 rounded-lg border border-border bg-card">
              <span className="block font-semibold text-foreground">Əl ilə Stok / Qiymət Düzəlişi</span>
              <span>Həftəlik &gt; 3 dəfə əl müdaxiləsi</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">Kassir / Operator</th>
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4 text-center">Ləğv Nisbəti (Void)</th>
                <th className="py-3 px-4 text-center">Endirim Nisbəti</th>
                <th className="py-3 px-4 text-center">Qaytarma Faizi</th>
                <th className="py-3 px-4 text-center">Kassa Fərqi (Kəsir/Artıq)</th>
                <th className="py-3 px-4 text-center">Əl Düzəlişləri</th>
                <th className="py-3 px-4">Risk Dərəcəsi & Səbəb</th>
                <th className="py-3 px-4 text-right">Sübut (Audit)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {metrics.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <strong className="text-foreground block">{row.cashierName}</strong>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ID: {row.cashierId}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span>{row.branchName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-semibold">
                    <span
                      className={
                        row.voidRatePercent > 5 ? 'text-danger font-bold' : 'text-foreground'
                      }
                    >
                      {row.voidRatePercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    <span
                      className={
                        row.discountRatePercent > 10 ? 'text-warning font-semibold' : 'text-foreground'
                      }
                    >
                      {row.discountRatePercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    <span
                      className={
                        row.returnRatePercent > 10 ? 'text-danger font-bold' : 'text-foreground'
                      }
                    >
                      {row.returnRatePercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    <span
                      className={
                        row.cashVarianceAzn < 0
                          ? 'text-danger font-bold'
                          : row.cashVarianceAzn > 0
                          ? 'text-success font-semibold'
                          : 'text-muted-foreground'
                      }
                    >
                      {formatMoney(row.cashVarianceAzn, false)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    <span
                      className={
                        row.manualAdjustmentsCount > 3
                          ? 'text-danger font-bold'
                          : 'text-foreground'
                      }
                    >
                      {row.manualAdjustmentsCount} dəfə
                    </span>
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <div className="space-y-1">
                      {getRiskBadge(row.riskScore)}
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {row.criteria}
                      </p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(row.evidenceUrl)}
                      className="h-7 text-xs flex items-center gap-1 ml-auto"
                      title="Hadisənin audit jurnalındakı qeydlərini aç"
                    >
                      Auditə Keç
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
