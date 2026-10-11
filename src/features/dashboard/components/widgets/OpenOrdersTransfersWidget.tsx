import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney, formatQty } from '../../../../shared/utils/formatters';
import { Truck, ShoppingCart, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface OpenOrdersTransfersWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const OpenOrdersTransfersWidget: React.FC<OpenOrdersTransfersWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'operationsStatus', filterParams],
    queryFn: () => dashboardRepository.getOperationsStatus(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  return (
    <WidgetContainer
      title="Açıq Satınalmalar və Yolda Olan Transferlər"
      subtitle="Təchizatçılardan gözlənilən mallar və filiallararası daşınmalar"
      infoTooltip="Təsdiqlənmiş, lakin anbara hələ çatdırılmamış xarici satınalma qaimələri və filiallar arasında daşınan daxili transferlər."
      drillDownUrl="/procurement"
      drillDownLabel="Satınalmalara Keç"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data}
      onRetry={() => refetch()}
      testId="widget-open-orders-transfers"
      className="col-span-1"
    >
      <div className="space-y-3 py-1">
        {/* Open Purchase Orders Card */}
        <Link
          to="/procurement"
          className="p-3 rounded-md border border-border/70 bg-card hover:bg-muted/40 transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">
                Gözləyən Satınalma Sifarişləri (PO)
              </div>
              <div className="text-[11px] text-muted-foreground">
                {data?.openPurchaseOrdersCount || 0} aktiv təchizat müqaviləsi
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-foreground">
              {formatMoney(data?.openPurchaseOrdersAmountQapik || 0, true)}
            </div>
            <span className="text-[10px] text-muted-foreground flex items-center justify-end gap-0.5 group-hover:text-foreground">
              Bax <ArrowRight className="h-2.5 w-2.5" />
            </span>
          </div>
        </Link>

        {/* In-Transit Transfers Card */}
        <Link
          to="/transfers"
          className="p-3 rounded-md border border-border/70 bg-card hover:bg-muted/40 transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
              <Truck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">
                Yolda Olan Transferlər (In-Transit)
              </div>
              <div className="text-[11px] text-muted-foreground">
                {data?.inTransitTransfersCount || 0} filiallararası daşınma aktı
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-foreground">
              {formatQty(data?.inTransitUnitsCount || 0)} ədəd
            </div>
            <span className="text-[10px] text-muted-foreground flex items-center justify-end gap-0.5 group-hover:text-foreground">
              Bax <ArrowRight className="h-2.5 w-2.5" />
            </span>
          </div>
        </Link>
      </div>
    </WidgetContainer>
  );
};

