import React from 'react';
import { Card, CardContent } from './Card';
import { Skeleton } from './Skeleton';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

export interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  changePercentage?: number; // e.g. +12.5 or -4.2
  periodText?: string; // e.g. "keçən aya nisbətən"
  icon?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  changePercentage,
  periodText = 'əvvəlki dövrə nisbətən',
  icon,
  isLoading = false,
  className,
}) => {
  if (isLoading) {
    return (
      <Card className={cn('p-5 space-y-3', className)}>
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-24 h-4" />
          <Skeleton variant="circular" className="w-8 h-8" />
        </div>
        <Skeleton variant="text" className="w-32 h-8" />
        <Skeleton variant="text" className="w-40 h-3" />
      </Card>
    );
  }

  const isPositive = changePercentage !== undefined && changePercentage > 0;
  const isNegative = changePercentage !== undefined && changePercentage < 0;
  const isZero = changePercentage !== undefined && changePercentage === 0;

  return (
    <Card className={cn('overflow-hidden transition-all hover:shadow-sm', className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground shrink-0">
              {icon}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
        </div>

        {(changePercentage !== undefined || subtitle) && (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs">
            {changePercentage !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-xs',
                  isPositive && 'bg-success/15 text-success',
                  isNegative && 'bg-danger/15 text-danger',
                  isZero && 'bg-muted text-muted-foreground'
                )}
              >
                {isPositive && <TrendingUp className="h-3 w-3" />}
                {isNegative && <TrendingDown className="h-3 w-3" />}
                {isZero && <Minus className="h-3 w-3" />}
                {Math.abs(changePercentage)}%
              </span>
            )}
            <span className="text-muted-foreground truncate">{subtitle || periodText}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

