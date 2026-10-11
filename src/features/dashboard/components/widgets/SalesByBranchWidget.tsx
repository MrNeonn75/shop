import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, BranchSalesDataPoint } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';

export interface SalesByBranchWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const SalesByBranchWidget: React.FC<SalesByBranchWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const { exportToCsv } = useExportCsv<BranchSalesDataPoint>();

  const {
    data = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'salesByBranch', filterParams],
    queryFn: () => dashboardRepository.getSalesByBranch(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    exportToCsv(data, {
      filename: `brand_house_filiallar_uzre_satis_${filterParams.startDate}_${filterParams.endDate}.csv`,
      columns: [
        { header: 'Filial Kodu', accessor: 'branchCode' },
        { header: 'Filial Adı', accessor: 'branchName' },
        { header: 'Satış (AZN)', accessor: (row) => (row.salesQapik / 100).toFixed(2) },
        { header: 'Çek Sayı', accessor: 'orderCount' },
        { header: 'Şəbəkədə Payı (%)', accessor: (row) => `${row.sharePercentage}%` },
        { header: 'Qaytarılma Faizi (%)', accessor: (row) => `${row.returnRate}%` },
      ],
    });
  };

  return (
    <WidgetContainer
      title="Filiallar üzrə Satış və Reytinq"
      subtitle="Filialların şəbəkə dövriyyəsindəki payı və effektivliyi"
      infoTooltip="Filiallar üzrə dövriyyə bölgüsü, ümumi şəbəkə satışındakı faiz payı və müştəri qaytarılma dərəcəsi."
      drillDownUrl="/branches"
      drillDownLabel="Filiallar İdarəetməsinə Keç"
      isLoading={isLoading}
      isError={isError}
      isEmpty={data.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      viewMode={viewMode}
      onToggleViewMode={() => setViewMode(viewMode === 'chart' ? 'table' : 'chart')}
      testId="widget-sales-by-branch"
      className="col-span-1"
    >
      {viewMode === 'chart' ? (
        <div className="h-72 w-full pt-2" aria-label="Filiallar üzrə satış qrafiki">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
              <XAxis
                dataKey="branchCode"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${(val / 100).toFixed(0)} ₼`}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0].payload as BranchSalesDataPoint;
                    return (
                      <div className="rounded-md border border-border bg-popover p-2.5 shadow-md text-xs space-y-1">
                        <div className="font-semibold text-foreground border-b border-border/50 pb-1">
                          {row.branchName} ({row.branchCode})
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Satış Həcmi:</span>
                          <span className="font-bold text-foreground">
                            {formatMoney(row.salesQapik, true)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Şəbəkədə Payı:</span>
                          <span className="font-semibold text-foreground">
                            {row.sharePercentage}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
                          <span>Qaytarılma:</span>
                          <span>{row.returnRate}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="salesQapik" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="Satış (AZN)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs text-left" aria-label="Filiallar üzrə reytinq cədvəli">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-2">Filial</th>
                <th className="p-2 text-right">Satış (AZN)</th>
                <th className="p-2 text-right">Pay %</th>
                <th className="p-2 text-right">Qaytarılma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row) => (
                <tr key={row.branchId} className="hover:bg-muted/40 transition-colors">
                  <td className="p-2 font-medium">
                    <div>{row.branchName}</div>
                    <div className="text-[10px] text-muted-foreground">{row.branchCode}</div>
                  </td>
                  <td className="p-2 text-right font-semibold">{formatMoney(row.salesQapik, true)}</td>
                  <td className="p-2 text-right font-medium">{row.sharePercentage}%</td>
                  <td className="p-2 text-right text-muted-foreground">{row.returnRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WidgetContainer>
  );
};
