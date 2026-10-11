import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  MOCK_INTEGRATIONS,
  SystemIntegrationItem,
} from '../../../shared/adapters/mock/adminMockData';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings2,
  RefreshCw,
} from 'lucide-react';

export const IntegrationsPage: React.FC = () => {
  const { toast } = useToast();
  const [integrations] = useState<SystemIntegrationItem[]>(MOCK_INTEGRATIONS);
  const [selectedIntegration, setSelectedIntegration] = useState<SystemIntegrationItem | null>(null);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  const getStatusBadge = (status: SystemIntegrationItem['status']) => {
    switch (status) {
      case 'active':
        return (
          <Badge variant="success" size="sm">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Aktiv
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="danger" size="sm">
            <XCircle className="h-3 w-3 mr-1" />
            Xəta
          </Badge>
        );
      case 'unconfigured':
      default:
        return (
          <Badge variant="neutral" size="sm">
            <AlertTriangle className="h-3 w-3 mr-1 text-warning" />
            Konfiqurasiya olunmayıb
          </Badge>
        );
    }
  };

  const handleTestConnection = (intg: SystemIntegrationItem) => {
    setIsTesting(intg.id);
    setTimeout(() => {
      setIsTesting(null);
      if (intg.status === 'active') {
        toast({
          type: 'success',
          title: 'Əlaqə uğurludur',
          message: `${intg.name} xidməti ilə cavab müddəti: 142 ms (Status 200 OK).`,
        });
      } else {
        toast({
          type: 'error',
          title: 'Əlaqə qurula bilmədi',
          message: `${intg.name}: ${intg.errorMessage || 'Konfiqurasiya və API açarları daxil edilməyib.'}`,
        });
      }
    }, 800);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Xarici İnteqrasiyalar' },
        ]}
      />

      <PageHeader
        title="Xarici Sistem İnteqrasiyaları"
        description="Fiskal kassa aparatları, SMS bildiriş şlüzü, e-Qaimə (DVX) və onlayn mağaza sinxronizasiyası."
        badge={
          <Badge variant="neutral" size="sm">
            {integrations.length} Xidmət Qoşulması
          </Badge>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {item.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provayder: <strong className="text-foreground">{item.provider}</strong>
                  </p>
                </div>
                {getStatusBadge(item.status)}
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Vəziyyət xülasəsi:</span>
                  <span className="font-medium text-foreground">{item.configSummary}</span>
                </div>
                {item.errorMessage && (
                  <p className="text-danger text-[11px] font-medium leading-relaxed">
                    Xəta: {item.errorMessage}
                  </p>
                )}
                {item.lastSyncAt && (
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>Son sinxronizasiya:</span>
                    <span className="font-mono text-foreground">{item.lastSyncAt}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection(item)}
                  isLoading={isTesting === item.id}
                  className="text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Əlaqəni Yoxla
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setSelectedIntegration(item)}
                  className="text-xs"
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1" />
                  Konfiqurasiya Et
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Integration Configuration Modal */}
      <Modal
        isOpen={Boolean(selectedIntegration)}
        onClose={() => setSelectedIntegration(null)}
        title={selectedIntegration ? `${selectedIntegration.name} Tənzimləmələri` : ''}
        size="md"
      >
        {selectedIntegration && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/40 rounded-lg border border-border text-xs text-muted-foreground leading-relaxed">
              Bu inteqrasiya üçün rəsmi provayder tərəfindən verilən API açarlarını və sertifikatları daxil edin.
              {selectedIntegration.id === 'int-4' && (
                <div className="mt-2 font-semibold text-foreground">
                  Qeyd: brendhouse.az mağaza inteqrasiyası BrendHouseLegacyAdapter arxitekturası üzərindən gələcəkdə birləşdiriləcəkdir.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">API Açar (API Key / Client ID)</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••••••••••"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Gizli Açar (API Secret / Certificate)</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••••••••••"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Webhook / Endpoint URL</label>
                <input
                  type="text"
                  placeholder="https://api.brendhouse.az/v1/webhook"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedIntegration(null)}
              >
                İmtina
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  toast({
                    type: 'success',
                    title: 'Parametrlər göndərildi',
                    message: `${selectedIntegration.name} üçün açarlar təhlükəsiz şəkildə qeydə alındı.`,
                  });
                  setSelectedIntegration(null);
                }}
              >
                Yadda Saxla
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
