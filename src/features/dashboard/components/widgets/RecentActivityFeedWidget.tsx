import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, DashboardActivityItem } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney, formatDateTime } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';
import { Badge } from '../../../../components/ui/Badge';
import { AlertTriangle, Tag, RotateCcw, FileText } from 'lucide-react';

export interface RecentActivityFeedWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const RecentActivityFeedWidget: React.FC<RecentActivityFeedWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const { exportToCsv } = useExportCsv<DashboardActivityItem>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'activities', filterParams],
    queryFn: () => dashboardRepository.getActivities(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    exportToCsv(data.activities, {
      filename: `brand_house_diqqet_teleb_eden_hadiseler_${filterParams.startDate}.csv`,
      columns: [
        { header: 'Tarix və Saat', accessor: (row) => formatDateTime(row.timestamp, true) },
        { header: 'Hadisə Növü', accessor: 'typeLabelAz' },
        { header: 'Başlıq', accessor: 'title' },
        { header: 'Filial', accessor: 'branchName' },
        { header: 'İcraçı', accessor: 'userName' },
        { header: 'Məbləğ (AZN)', accessor: (row) => (row.amountQapik ? (row.amountQapik / 100).toFixed(2) : '') },
        { header: 'Açıqlama', accessor: 'description' },
      ],
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'large_refund':
        return <RotateCcw className="h-4 w-4" />;
      case 'high_discount':
        return <Tag className="h-4 w-4" />;
      case 'cancellation':
        return <AlertTriangle className="h-4 w-4" />;
      case 'stock_adjustment':
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getSeverityBadge = (severity: 'info' | 'warning' | 'danger', label: string) => {
    switch (severity) {
      case 'danger':
        return <Badge variant="danger" size="sm">{label}</Badge>;
      case 'warning':
        return <Badge variant="warning" size="sm">{label}</Badge>;
      case 'info':
      default:
        return <Badge variant="neutral" size="sm">{label}</Badge>;
    }
  };

  const activities = data?.activities || [];

  return (
    <WidgetContainer
      title="Nəzarət və Kritik Hadisələr Lenti"
      subtitle="Böyük qaytarmalar, kassa ləğvləri, sayım aktları və xüsusi endirimlər"
      infoTooltip="Rəhbərlik nəzarəti tələb edən əsas riskli və ya qeyri-standart əməliyyatların real-vaxt xronologiyası."
      drillDownUrl="/admin/audit"
      drillDownLabel="Audit Jurnalına Keç"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data || activities.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-recent-activities"
      className="col-span-1 lg:col-span-2"
    >
      <div className="space-y-2.5 py-1">
        {activities.map((act) => (
          <div
            key={act.id}
            className="p-3 rounded-md border border-border/70 bg-card hover:bg-muted/30 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-md bg-muted text-foreground shrink-0 mt-0.5 sm:mt-0">
                {getActivityIcon(act.type)}
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-foreground">{act.title}</span>
                  {getSeverityBadge(act.severity, act.typeLabelAz)}
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-1">
                  {act.description}
                </div>
                <div className="text-[10px] text-muted-foreground/80">
                  {formatDateTime(act.timestamp, true)} • {act.branchName} • {act.userName}
                </div>
              </div>
            </div>

            {act.amountQapik !== undefined && (
              <div className="shrink-0 self-end sm:self-center font-bold text-sm text-foreground">
                {formatMoney(act.amountQapik, true)}
              </div>
            )}
          </div>
        ))}
      </div>
    </WidgetContainer>
  );
};

