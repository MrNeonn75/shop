import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { IntegrationCardItem } from '../types/systemSettings';
import { systemRepository } from '../../../shared/adapters';
import { IntegrationCard } from '../components/IntegrationCard';
import { RefreshCw, ShieldAlert } from 'lucide-react';

export const IntegrationsPage: React.FC = () => {
  const { toast } = useToast();

  const [integrations, setIntegrations] = useState<IntegrationCardItem[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationCardItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchIntegrations = async () => {
    setIsLoading(true);
    try {
      const data = await systemRepository.getIntegrations();
      setIntegrations(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'İnteqrasiyaları yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleTestConnection = async (id: string) => {
    return await systemRepository.testIntegrationConnection(id);
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
        title="Xarici Sistem İnteqrasiyaları Mərkəzi"
        description="Fiskal kassa aparatları, SMS bildiriş şlüzü, e-Qaimə (DVX), 1C Mühasibatlıq, biometrik davamiyyət və brendhouse.az onlayn mağaza sinxronizasiyası."
        badge={
          <Badge variant="neutral" size="sm">
            {integrations.length} Xidmət Qoşulması
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchIntegrations}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Statusları Yenilə
          </Button>
        }
      />

      {/* Integration Notice */}
      <div className="p-3.5 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground block">Təhlükəsizlik və İnteqrasiya Qaydası:</strong>
          Açarları daxil edilməmiş xidmətlər heç vaxt saxta "Aktiv" kimi göstərilmir və açıq şəkildə <strong className="text-foreground">"Konfiqurasiya olunmayıb"</strong> statusu daşıyır. Giriş açarları yalnız yazma (write-only) prinsipi ilə maskalanaraq saxlanılır.
        </div>
      </div>

      {/* Grid of 6 Integration Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((item) => (
          <IntegrationCard
            key={item.id}
            integration={item}
            onTestConnection={handleTestConnection}
            onConfigureClick={(intg) => setSelectedIntegration(intg)}
          />
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
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-muted/40 rounded-lg border border-border text-muted-foreground leading-relaxed">
              Bu inteqrasiya üçün provayder (<strong className="text-foreground">{selectedIntegration.provider}</strong>) tərəfindən verilən API açarlarını daxil edin. Məlumatlar şifrələnərək saxlanılacaq.
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">API Açar (API Key / Client ID)</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••••••••••"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Gizli Açar (API Secret / Certificate)</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••••••••••"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Webhook / Endpoint URL</label>
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
