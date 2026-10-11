import React from 'react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Tooltip } from '../../../components/ui/Tooltip';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { KpiSummaryMetric } from '../types';
import { getKpiDefinition, KpiMetricId } from '../kpiDefinitions';
import { formatMoney, formatQty } from '../../../shared/utils/formatters';
import { cn } from '../../../shared/utils/cn';

export interface DashboardKpiCardProps {
  metricId: KpiMetricId;
  metric?: KpiSummaryMetric;
  comparisonLabel?: string;
  isLoading?: boolean;
  className?: string;
}

export const DashboardKpiCard: React.FC<DashboardKpiCardProps> = ({
  metricId,
  metric,
  comparisonLabel = 'əvvəlki dövrə nisbətən',
  isLoading = false,
  className,
}) => {
  const definition = getKpiDefinition(metricId);

  if (isLoading || !metric) {
    return (
      <Card className={cn('p-4 space-y-3', className)} data-testid={`kpi-skeleton-${metricId}`}>
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-24 h-4" />
          <Skeleton variant="circular" className="w-6 h-6" />
        </div>
        <Skeleton variant="text" className="w-36 h-7" />
        <Skeleton variant="text" className="w-28 h-3" />
        <Skeleton variant="rectangular" className="w-full h-8 rounded-sm" />
      </Card>
    );
  }

  const isPositive = (metric.changePercentage ?? 0) > 0;
  const isNegative = (metric.changePercentage ?? 0) < 0;
  const isZero = (metric.changePercentage ?? 0) === 0;

  // Format main value based on metric definition unit
  let formattedValue: React.ReactNode;
  if (!metric.isCalculated) {
    formattedValue = (
      <span className="text-lg font-semibold text-warning flex items-center gap-1.5">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        Hesablanmayıb
      </span>
    );
  } else {
    switch (definition.unit) {
      case 'azn':
        formattedValue = formatMoney(metric.value, true);
        break;
      case 'percent':
        formattedValue = `${metric.value > 0 ? '+' : ''}${metric.value}%`;
        break;
      case 'qty':
        formattedValue = `${formatQty(metric.value)} əd.`;
        break;
      case 'ratio':
        formattedValue = `${metric.value.toFixed(2)}x`;
        break;
      default:
        formattedValue = String(metric.value);
    }
  }

  // Generate SVG Sparkline Points
  const sparklinePoints = metric.sparkline && metric.sparkline.length > 1
    ? (() => {
        const min = Math.min(...metric.sparkline);
        const max = Math.max(...metric.sparkline);
        const range = max - min || 1;
        const width = 120;
        const height = 28;
        const points = metric.sparkline
          .map((val, idx) => {
            const x = (idx / (metric.sparkline.length - 1)) * width;
            const y = height - ((val - min) / range) * (height - 6) - 3;
            return `${x},${y}`;
          })
          .join(' ');
        return { points, width, height };
      })()
    : null;

  return (
    <Card
      className={cn(
        'group overflow-hidden transition-all hover:shadow-sm border-border bg-card',
        className
      )}
      data-testid={`kpi-card-${metricId}`}
    >
      <CardContent className="p-4 flex flex-col justify-between h-full">
        {/* Card Header: Title + Info Tooltip */}
        <div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              {definition.shortNameAz}
            </span>

            {/* Comprehensive KPI Definition Tooltip */}
            <Tooltip
              side="top"
              align="end"
              content={
                <div className="space-y-1.5 max-w-xs p-1 text-left">
                  <div className="font-bold text-foreground dark:text-background border-b border-border/40 pb-1">
                    {definition.nameAz}
                  </div>
                  <div className="text-[11px] leading-relaxed text-muted-foreground dark:text-bh-gray-200">
                    <span className="font-semibold text-foreground dark:text-background">Düstur: </span>
                    {definition.formulaText}
                  </div>
                  <div className="text-[11px] leading-relaxed text-muted-foreground dark:text-bh-gray-200">
                    <span className="font-semibold text-foreground dark:text-background">Mənbə: </span>
                    {definition.dataSource}
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 dark:text-bh-gray-300 italic pt-0.5">
                    {definition.description}
                  </div>
                </div>
              }
            >
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 rounded-xs"
                aria-label={`${definition.nameAz} düsturu və məlumatı`}
                data-testid={`kpi-tooltip-trigger-${metricId}`}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>

          {/* Main Metric Value */}
          <div className="mt-2 flex items-baseline">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {formattedValue}
            </div>
          </div>
        </div>

        {/* Footer: Delta vs comparison + Sparkline */}
        <div className="mt-3 pt-2.5 border-t border-border/40 flex items-end justify-between gap-2">
          {/* Comparison Delta */}
          <div className="space-y-0.5 min-w-0">
            {metric.isCalculated && metric.changePercentage !== undefined ? (
              <div className="flex items-center gap-1 text-xs">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 font-semibold px-1 py-0.5 rounded-xs text-[11px]',
                    isPositive && 'bg-success/15 text-success',
                    isNegative && 'bg-danger/15 text-danger',
                    isZero && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isPositive && <TrendingUp className="h-3 w-3" />}
                  {isNegative && <TrendingDown className="h-3 w-3" />}
                  {isZero && <Minus className="h-3 w-3" />}
                  {Math.abs(metric.changePercentage)}%
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {comparisonLabel}
                </span>
              </div>
            ) : !metric.isCalculated ? (
              <span className="text-[11px] text-muted-foreground line-clamp-1">
                {metric.uncalculatedReason || 'Xərc sənədləri natamamdır'}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{comparisonLabel}</span>
            )}
          </div>

          {/* Micro Sparkline */}
          {sparklinePoints && (
            <div className="shrink-0 w-20 h-7 opacity-85 group-hover:opacity-100 transition-opacity">
              <svg
                viewBox={`0 0 ${sparklinePoints.width} ${sparklinePoints.height}`}
                className="w-full h-full overflow-visible"
              >
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    isNegative ? 'text-danger' : 'text-foreground'
                  )}
                  points={sparklinePoints.points}
                />
              </svg>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
