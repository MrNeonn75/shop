import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, PaymentBreakdownItem } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney, formatQty } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';
import { CreditCard, Banknote, Split, Smartphone } from 'lucide-react';

export interface PaymentMethodsWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const PaymentMethodsWidget: React.FC<PaymentMethodsWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const { exportToCsv } = useExportCsv<PaymentBreakdownItem>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'paymentBreakdown', filterParams],
    queryFn: () => dashboardRepository.getPaymentBreakdown(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    exportToCsv(data.items, {
      filename: `brand_house_odenis_usullari_${filterParams.startDate}_${filterParams.endDate}.csv`,
      columns: [
        { header: 'Ödəniş Üsulu', accessor: 'labelAz' },
        { header: 'Məbləğ (AZN)', accessor: (row) => (row.amountQapik / 100).toFixed(2) },
        { header: 'Əməliyyat Sayı', accessor: 'transactionCount' },
        { header: 'Pay (%)', accessor: (row) => `${row.percentage}%` },
      ],
    });
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'card':
        return <CreditCard className="h-4 w-4" />;
      case 'cash':
        return <Banknote className="h-4 w-4" />;
      case 'other':
        return <Smartphone className="h-4 w-4" />;
      case 'split':
      default:
        return <Split className="h-4 w-4" />;
    }
  };

  const items = data?.items || [];

  return (
    <WidgetContainer
      title="Ödəniş Üsulları üzrə Bölgü"
      subtitle="Kassa və terminallarda nağd, kart və hissə-hissə payı"
      infoTooltip="Müştərilərin ödəmə kanalları (Bank kartları, nağd və taksit) üzrə qəbul edilmiş vəsaitlərin strukturu."
      drillDownUrl="/pos"
      drillDownLabel="POS Əməliyyatlarına Bax"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data || items.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-payment-methods"
      className="col-span-1"
    >
      <div className="space-y-3 py-1">
        {/* Cumulative Visual Progress Bar */}
        <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden flex">
          {items.map((item, idx) => {
            const colors = [
              'bg-foreground',
              'bg-bh-gray-500',
              'bg-bh-gray-400',
              'bg-bh-gray-300',
            ];
            return (
              <div
                key={item.method}
                className={`h-full ${colors[idx % colors.length]} transition-all`}
                style={{ width: `${item.percentage}%` }}
                title={`${item.labelAz}: ${item.percentage}%`}
              />
            );
          })}
        </div>

        {/* Item Rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {items.map((item) => (
            <div
              key={item.method}
              className="p-2.5 rounded-md border border-border/60 bg-muted/20 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-sm bg-muted text-foreground">
                  {getMethodIcon(item.method)}
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground truncate">{item.labelAz}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatQty(item.transactionCount)} əməliyyat
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-foreground">
                  {formatMoney(item.amountQapik, true)}
                </div>
                <div className="text-[11px] font-medium text-muted-foreground">
                  {item.percentage}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetContainer>
  );
};

