import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, ExpenseCategoryBreakdown } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';

export interface ExpenseTrendWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const ExpenseTrendWidget: React.FC<ExpenseTrendWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const { exportToCsv } = useExportCsv<ExpenseCategoryBreakdown>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'expenseTrend', filterParams],
    queryFn: () => dashboardRepository.getExpenseTrend(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    exportToCsv(data.categories, {
      filename: `brand_house_xercler_kateqoriya_${filterParams.startDate}_${filterParams.endDate}.csv`,
      columns: [
        { header: 'Xərc Maddəsi', accessor: 'categoryNameAz' },
        { header: 'Məbləğ (AZN)', accessor: (row) => (row.amountQapik / 100).toFixed(2) },
        { header: 'Pay (%)', accessor: (row) => `${row.percentage}%` },
      ],
    });
  };

  const categories = data?.categories || [];

  return (
    <WidgetContainer
      title="Əməliyyat Xərcləri (OPEX) Strukturu"
      subtitle="Filial icarələri, əməkhaqqı, kommunal və marketinq məsrəfləri"
      infoTooltip="Xalis mənfəəti formalaşdıran əməliyyat xərclərinin maddələr üzrə bölgüsü və ümumi büdcədəki payı."
      drillDownUrl="/finance"
      drillDownLabel="Maliyyə Moduluna Keç"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data || categories.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-expense-trend"
      className="col-span-1"
    >
      <div className="space-y-3 py-1">
        {data && (
          <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
            <span className="text-muted-foreground">Ümumi Qeydə Alınmış Xərc:</span>
            <span className="font-bold text-foreground">
              {formatMoney(data.totalExpenseQapik, true)}
            </span>
          </div>
        )}

        <div className="space-y-2.5">
          {categories.map((cat) => (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground truncate pr-2">
                  {cat.categoryNameAz}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-foreground">
                    {formatMoney(cat.amountQapik, true)}
                  </span>
                  <span className="text-muted-foreground w-8 text-right font-medium text-[11px]">
                    {cat.percentage}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full transition-all duration-500"
                  style={{ width: `${cat.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetContainer>
  );
};

