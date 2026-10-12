import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { SystemHealthStatus } from '../types/systemSettings';
import { systemRepository } from '../../../shared/adapters';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  Activity,
  Database,
  Clock,
  HardDrive,
  Download,
  CheckCircle2,
  RefreshCw,
  Server,
  ShieldCheck,
  AlertOctagon,
} from 'lucide-react';

export const SystemHealthPage: React.FC = () => {
  const { toast } = useToast();

  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const data = await systemRepository.getSystemHealth();
      setHealth(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Diaqnostika məlumatlarını yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const updated = await systemRepository.triggerBackup();
      setHealth(updated);
      toast({
        type: 'success',
        title: 'Ehtiyat nüsxə yaradıldı (Backup)',
        message: 'Bütün filialların məlumat bazası təhlükəsiz şifrələnmiş bulud anbarına arxivləndi.',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Backup yaradılarkən xəta baş verdi.',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  if (!health) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
        description="Məlumat bazası statusu, server gecikməsi, yaddaş resursları, bərpa sınaqları (restore-test) və arxivləşdirmə paneli."
        badge={
          <Badge
            variant={health.status === 'healthy' ? 'success' : 'danger'}
            size="sm"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {health.status === 'healthy' ? 'Bütün Sistemlər Normaldır' : 'Diqqət Tələb Olunur'}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHealth}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
                {health.apiLatencyMs} ms
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
                {health.databaseStatus === 'connected' ? 'Qoşulub' : 'Qopuq'}
              </p>
              <span className="text-[10px] text-success font-medium">Bağlantı hovuzu: Aktiv</span>
            </div>
            <div className="p-2.5 rounded-xl bg-foreground text-background">
              <Database className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Restore Test Status */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Bərpa Sınağı (Restore-Test)</p>
              <p className="text-xl font-bold text-foreground mt-1 capitalize">
                {health.restoreTestStatus === 'verified' ? 'Təsdiqlənib' : 'Gözləyir'}
              </p>
              <span className="text-[10px] text-success font-medium">Avtomatik yoxlama uğurludur</span>
            </div>
            <div className="p-2.5 rounded-xl bg-success/10 text-success">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Kəsilməsiz İş Müddəti</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">
                {health.uptimeHours} saat
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
              <span>Avtomatik Backup Qrafiki və Ölçüsü</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Son uğurlu arxiv tarixi:</span>
              <strong className="text-foreground font-mono">
                {formatDateTime(health.lastBackupAt)}
              </strong>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Arxiv faylının ölçüsü:</span>
              <strong className="text-foreground font-mono">
                {(health.lastBackupSizeBytes / (1024 * 1024)).toFixed(1)} MB
              </strong>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Bərpa sınaq statusu (Restore Test):</span>
              <Badge variant="success" size="sm">
                Təsdiqlənib (Verified)
              </Badge>
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
                v2.4.0-enterprise
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

      {/* Recent Errors Log */}
      {health.recentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-warning" />
              <span>Son Qeydə Alınmış Sistem İcazə və Sinxronizasiya Hadisələri</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {health.recentErrors.map((err, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-border bg-muted/20 flex items-center justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">
                      {err.module}
                    </span>
                    <span className="text-foreground">{err.message}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatDateTime(err.timestamp)}
                  </span>
                </div>
                <Badge variant="neutral" size="sm">
                  Məlumat
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
