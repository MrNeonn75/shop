import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, SlowMovingItem } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney, formatQty } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';
import { Badge } from '../../../../components/ui/Badge';
import { Hourglass, Lock } from 'lucide-react';

export interface SlowMovingStockWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const SlowMovingStockWidget: React.FC<SlowMovingStockWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const { exportToCsv } = useExportCsv<SlowMovingItem>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'slowMovingStock', filterParams],
    queryFn: () => dashboardRepository.getSlowMovingStock(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    exportToCsv(data.items, {
      filename: `brand_house_hereketsiz_stoklar_${filterParams.startDate}.csv`,
      columns: [
        { header: 'Məhsul', accessor: 'name' },
        { header: 'SKU', accessor: 'sku' },
        { header: 'Kateqoriya', accessor: 'categoryNameAz' },
        { header: 'Satışsız Gün Sayı', accessor: 'daysWithoutSale' },
        { header: 'Qalıq Sayı', accessor: 'stockQty' },
        { header: 'Dondurulmuş Maya Dəyəri (AZN)', accessor: (row) => (row.tiedUpCapitalQapik / 100).toFixed(2) },
        { header: 'Filial / Anbar', accessor: 'branchName' },
      ],
    });
  };

  const items = data?.items || [];

  return (
    <WidgetContainer
      title="Hərəkətsiz və Passiv Ehtiyatlar (Dead Stock)"
      subtitle="Son 60+ gün ərzində satışı qeydə alınmamış mallar"
      infoTooltip="Dövriyyəsi dayanmış, anbar sahəsi tutan və dövriyyə kapitalını donduran məhsulların siyahısı və maya dəyəri."
      drillDownUrl="/inventory?filter=slow_moving"
      drillDownLabel="İnventara Bax"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data || items.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-slow-moving-stock"
      className="col-span-1"
    >
      <div className="space-y-3 py-1">
        {data && (
          <div className="p-2.5 rounded-md bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-warning" />
              Dondurulmuş Ümumi Maya Kapitalı:
            </span>
            <span className="font-bold text-foreground">
              {formatMoney(data.totalTiedUpCapitalQapik, true)}
            </span>
          </div>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-md border border-border/70 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-xs"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{item.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {item.sku} • {item.branchName}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-bold text-foreground">
                  {formatMoney(item.tiedUpCapitalQapik, true)}
                </div>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1">
                    <Hourglass className="h-2.5 w-2.5 mr-0.5" />
                    {item.daysWithoutSale} gün
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    ({formatQty(item.stockQty)} əd.)
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetContainer>
  );
};

