import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import {
  MOCK_SYSTEM_HEALTH,
  SystemHealthMetrics,
} from '../../../shared/adapters/mock/adminMockData';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  Activity,
  Database,
  Cpu,
  Clock,
  HardDrive,
  Download,
  CheckCircle2,
  RefreshCw,
  Server,
} from 'lucide-react';

export const SystemHealthPage: React.FC = () => {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<SystemHealthMetrics>(MOCK_SYSTEM_HEALTH);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setMetrics((prev) => ({
        ...prev,
        apiLatencyMs: Math.floor(Math.random() * 15) + 18,
        memoryUsedMb: Math.floor(Math.random() * 50) + 390,
      }));
      setIsRefreshing(false);
      toast({
        type: 'info',
        title: 'Diaqnostika yeniləndi',
        message: 'Server sağlamlıq telemetriyası ən son məlumatlarla yeniləndi.',
      });
    }, 500);
  };

  const handleCreateBackup = () => {
    setIsBackingUp(true);
    setTimeout(() => {
      setIsBackingUp(false);
      setMetrics((prev) => ({
        ...prev,
        lastBackupAt: new Date().toISOString(),
      }));
      toast({
        type: 'success',
        title: 'Ehtiyat nüsxə yaradıldı (Backup)',
        message: 'Bütün filialların məlumat bazası təhlükəsiz şifrələnmiş bulud anbarına arxivləndi.',
      });
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Sistem Sağlamlığı və Backup' },
        ]}
      />

      <PageHeader
        title="Sistem Sağlamlığı və Ehtiyat Nüsxə (Backup)"
        description="Məlumat bazası statusu, server gecikməsi, yaddaş resursları və arxivləşdirmə paneli."
        badge={
          <Badge variant="success" size="sm">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Bütün Sistemlər İşləkdir
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              isLoading={isRefreshing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Yenilə
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCreateBackup}
              isLoading={isBackingUp}
            >
              <Download className="h-4 w-4 mr-2" />
              İndi Ehtiyat Nüsxə Yarat
            </Button>
          </div>
        }
      />

      {/* Primary KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Latency */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">API Gecikməsi (Latency)</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">
                {metrics.apiLatencyMs} ms
              </p>
              <span className="text-[10px] text-success font-medium">Əla sürət (&lt; 50ms)</span>
            </div>
            <div className="p-2.5 rounded-xl bg-success/10 text-success">
              <Activity className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Məlumat Bazası (PostgreSQL)</p>
              <p className="text-xl font-bold text-foreground mt-1 capitalize">
                {metrics.databaseStatus === 'connected' ? 'Qoşulub' : 'Qopuq'}
              </p>
              <span className="text-[10px] text-success font-medium">Pool: 24/50 bağlantı</span>
            </div>
            <div className="p-2.5 rounded-xl bg-foreground text-background">
              <Database className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Operativ Yaddaş (RAM)</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">
                {metrics.memoryUsedMb} MB
              </p>
              <span className="text-[10px] text-muted-foreground">
                Cəmi: {metrics.memoryTotalMb} MB ({Math.round((metrics.memoryUsedMb / metrics.memoryTotalMb) * 100)}%)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-muted text-foreground">
              <Cpu className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Kəsilməsiz İş Müddəti</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">
                {metrics.uptimeHours} saat
              </p>
              <span className="text-[10px] text-success font-medium">99.98% SLA etibarlılıq</span>
            </div>
            <div className="p-2.5 rounded-xl bg-muted text-foreground">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backup Details & System Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              <span>Avtomatik Backup Qrafiki</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Son uğurlu arxiv tarixi:</span>
              <strong className="text-foreground font-mono">
                {formatDateTime(metrics.lastBackupAt)}
              </strong>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Arxiv faylının ölçüsü:</span>
              <strong className="text-foreground font-mono">
                {(metrics.lastBackupSizeBytes / (1024 * 1024)).toFixed(1)} MB
              </strong>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Saxlama müddəti:</span>
              <strong className="text-foreground">30 gün (Gündəlik rotasiya)</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Növbəti planlaşdırılmış arxiv:</span>
              <strong className="text-foreground font-mono">Hər gecə saat 03:00</strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Server className="h-4 w-4" />
              <span>Server və İnfrastruktur Məlumatı</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">ERP Proqram Versiyası:</span>
              <Badge variant="neutral" size="sm" className="font-mono">
                {metrics.version}
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Mühit (Environment):</span>
              <strong className="text-foreground font-mono">Production (Bakı Data Mərkəzi)</strong>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">TLS / HTTPS Sertifikatı:</span>
              <Badge variant="success" size="sm">
                Aktiv (Qüvvədədir: 280 gün)
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Filial kassa sinxronizasiyası:</span>
              <strong className="text-success font-medium">Real-vaxtda aktivdir (WebSocket)</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

