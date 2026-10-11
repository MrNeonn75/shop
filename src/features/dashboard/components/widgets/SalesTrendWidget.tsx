import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, SalesTrendDataPoint } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney, formatQty } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';

export interface SalesTrendWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const SalesTrendWidget: React.FC<SalesTrendWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const { exportToCsv } = useExportCsv<SalesTrendDataPoint>();

  const {
    data = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'salesTrend', filterParams],
    queryFn: () => dashboardRepository.getSalesTrend(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    exportToCsv(data, {
      filename: `brand_house_satis_trendi_${filterParams.startDate}_${filterParams.endDate}.csv`,
      columns: [
        { header: 'Dövr / Saat', accessor: (row) => row.label },
        { header: 'Satış Məbləği (AZN)', accessor: (row) => (row.currentSalesQapik / 100).toFixed(2) },
        {
          header: 'Müqayisə Dövrü (AZN)',
          accessor: (row) => (row.previousSalesQapik ? (row.previousSalesQapik / 100).toFixed(2) : ''),
        },
        { header: 'Çek Sayı', accessor: (row) => row.orderCount },
      ],
    });
  };

  const isSingleDay =
    filterParams.datePreset === 'today' ||
    filterParams.datePreset === 'yesterday' ||
    filterParams.startDate === filterParams.endDate;

  const title = isSingleDay ? 'Günlük Saatlıq Satış Dinamikası' : 'Dövri Satış Dinamikası';
  const subtitle = isSingleDay
    ? 'Kassa çekləri üzrə saatlar üzrə xalis satış həcmi'
    : 'Günlər üzrə xalis satış və müqayisə dinamikası';

  const hasCompare = filterParams.comparisonMode !== 'none';

  return (
    <WidgetContainer
      title={title}
      subtitle={subtitle}
      infoTooltip="Xalis satış dinamikası: Qaytarılmalar çıxıldıqdan sonra faktiki qazanılmış gəliri saatlıq və ya günlük formatda göstərir."
      drillDownUrl={`/sales?startDate=${filterParams.startDate}&endDate=${filterParams.endDate}`}
      drillDownLabel="Satışlar Siyahısına Bax"
      isLoading={isLoading}
      isError={isError}
      isEmpty={data.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      viewMode={viewMode}
      onToggleViewMode={() => setViewMode(viewMode === 'chart' ? 'table' : 'chart')}
      testId="widget-sales-trend"
      className="col-span-1 lg:col-span-2"
    >
      {viewMode === 'chart' ? (
        <div className="h-72 w-full pt-2" tabIndex={0} aria-label="Satış trend qrafiki">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
              <XAxis
                dataKey="label"
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
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const currentVal = payload[0].value as number;
                    const prevVal = payload[1]?.value as number | undefined;
                    const orders = (payload[0].payload as SalesTrendDataPoint).orderCount;

                    return (
                      <div className="rounded-md border border-border bg-popover p-2.5 shadow-md text-xs space-y-1">
                        <div className="font-semibold text-foreground border-b border-border/50 pb-1">
                          {label}
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Cari Satış:</span>
                          <span className="font-bold text-foreground">
                            {formatMoney(currentVal, true)}
                          </span>
                        </div>
                        {prevVal !== undefined && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Müqayisə Dövrü:</span>
                            <span className="font-semibold text-muted-foreground">
                              {formatMoney(prevVal, true)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-4 pt-0.5 text-[11px] text-muted-foreground">
                          <span>Çek Sayı:</span>
                          <span>{formatQty(orders)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="currentSalesQapik"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#salesGradient)"
                name="Cari Satış"
              />
              {hasCompare && (
                <Line
                  type="monotone"
                  dataKey="previousSalesQapik"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Müqayisə Dövrü"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs text-left" aria-label="Satış trend cədvəli">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-2">Dövr / Saat</th>
                <th className="p-2 text-right">Cari Satış (AZN)</th>
                {hasCompare && <th className="p-2 text-right">Müqayisə Dövrü</th>}
                <th className="p-2 text-right">Çek Sayı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-muted/40 transition-colors">
                  <td className="p-2 font-medium">{row.label}</td>
                  <td className="p-2 text-right font-semibold">{formatMoney(row.currentSalesQapik, true)}</td>
                  {hasCompare && (
                    <td className="p-2 text-right text-muted-foreground">
                      {row.previousSalesQapik ? formatMoney(row.previousSalesQapik, true) : '—'}
                    </td>
                  )}
                  <td className="p-2 text-right text-muted-foreground">{formatQty(row.orderCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WidgetContainer>
  );
};

