import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, LowStockItem } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';
import { Badge } from '../../../../components/ui/Badge';
import { AlertCircle, AlertTriangle } from 'lucide-react';

export interface LowStockAlertsWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const LowStockAlertsWidget: React.FC<LowStockAlertsWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const { exportToCsv } = useExportCsv<LowStockItem>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'inventoryAlerts', filterParams],
    queryFn: () => dashboardRepository.getInventoryAlerts(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    exportToCsv(data.lowStockItems, {
      filename: `brand_house_azalan_stoklar_${filterParams.startDate}.csv`,
      columns: [
        { header: 'Məhsul', accessor: 'name' },
        { header: 'SKU', accessor: 'sku' },
        { header: 'Filial', accessor: 'branchName' },
        { header: 'Cari Qalıq', accessor: 'currentStock' },
        { header: 'Kritik Limit', accessor: 'minThreshold' },
        { header: 'Status', accessor: (row) => (row.status === 'critical' ? 'Bitib (0)' : 'Azalıb') },
      ],
    });
  };

  const items = data?.lowStockItems || [];

  return (
    <WidgetContainer
      title="Kritik və Azalan Stok Siqnalları"
      subtitle="Satışda tükənmək üzrə və ya bitmiş məhsullar"
      infoTooltip="Stok qalığı müəyyən edilmiş kritik təhlükəsizlik limitindən aşağı düşmüş və ya tamamilə bitmiş çeşidlər."
      drillDownUrl="/inventory?filter=low_stock"
      drillDownLabel="Anbar İdarəetməsinə Keç"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data || items.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-low-stock-alerts"
      className="col-span-1"
    >
      <div className="space-y-2 py-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-2.5 rounded-md border border-border/70 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-xs"
          >
            <div className="min-w-0">
              <div className="font-semibold text-foreground truncate">{item.name}</div>
              <div className="text-[10px] text-muted-foreground">
                SKU: {item.sku} • {item.branchName}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <span className="font-bold text-foreground">{item.currentStock}</span>
                <span className="text-[10px] text-muted-foreground"> / {item.minThreshold} limit</span>
              </div>

              {item.status === 'critical' ? (
                <Badge variant="danger" size="sm" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Bitib (0)
                </Badge>
              ) : (
                <Badge variant="warning" size="sm" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Azalıb
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </WidgetContainer>
  );
};
