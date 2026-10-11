import React from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { SensitiveField } from '../../../components/ui/SensitiveField';
import { Sparkles } from 'lucide-react';

interface ModulePlaceholderPageProps {
  moduleName: string;
  category: string;
  description: string;
  requiredPermission?: string;
  kpis?: { label: string; value: string; isSensitive?: boolean; permission?: string }[];
}

export const ModulePlaceholderPage: React.FC<ModulePlaceholderPageProps> = ({
  moduleName,
  category,
  description,
  requiredPermission,
  kpis = [
    { label: 'Aktiv Əməliyyatlar', value: '24' },
    { label: 'Cari Ay Üzrə Həcm', value: '14,850.00 ₼' },
    {
      label: 'Maya Dəyəri (Həssas)',
      value: '8,420.00 ₼',
      isSensitive: true,
      permission: 'products.cost_price.view',
    },
  ],
}) => {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: category },
          { label: moduleName },
        ]}
      />

      <PageHeader
        title={moduleName}
        description={description}
        badge={
          <Badge variant="neutral" size="sm">
            Faza 3 Biznes Modulu
          </Badge>
        }
      />

      {/* KPI Cards Showcase */}
      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((kpi, idx) => (
          <Card key={idx}>
            <CardContent className="p-4">
              <span className="text-xs text-muted-foreground font-medium">
                {kpi.label}
              </span>
              <div className="text-xl font-bold text-foreground mt-1 font-mono">
                {kpi.isSensitive && kpi.permission ? (
                  <SensitiveField
                    value={kpi.value}
                    permission={kpi.permission}
                    mask="*** ₼"
                  />
                ) : (
                  kpi.value
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Architectural Next Phase Notice */}
      <Card className="border-dashed border-2">
        <CardContent className="p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            {moduleName} Modulunun Əsas İnfrastrukturu Aktivdir
          </h3>
          <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Bu modul üçün RBAC icazələri (<code className="font-mono text-foreground">{requiredPermission || 'aktiv'}</code>), filial filtrləməsi, naviqasiya və sessiya idarəetməsi tam qurulub. Növbəti mərhələdə (F3) xüsusi biznes cədvəlləri və əməliyyat formaları bu ekrana inteqrasiya olunacaqdır.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
