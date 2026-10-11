import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Tooltip } from '../../../components/ui/Tooltip';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Link } from 'react-router-dom';
import {
  Download,
  ExternalLink,
  Info,
  Table as TableIcon,
  BarChart2,
} from 'lucide-react';
import { cn } from '../../../shared/utils/cn';

export interface WidgetContainerProps {
  title: string;
  subtitle?: string;
  infoTooltip?: string;
  drillDownUrl?: string;
  drillDownLabel?: string;
  onExportCsv?: () => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  headerActions?: React.ReactNode;
  viewMode?: 'chart' | 'table';
  onToggleViewMode?: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  title,
  subtitle,
  infoTooltip,
  drillDownUrl,
  drillDownLabel = 'Hesabata Keçid',
  onExportCsv,
  isLoading = false,
  isError = false,
  errorMessage = 'Məlumatları yükləyərkən xəta baş verdi',
  onRetry,
  isEmpty = false,
  emptyMessage = 'Seçilmiş parametrlər üzrə məlumat tapılmadı',
  headerActions,
  viewMode,
  onToggleViewMode,
  children,
  className,
  testId,
}) => {
  return (
    <Card
      className={cn('flex flex-col border-border bg-card overflow-hidden shadow-xs', className)}
      data-testid={testId}
    >
      {/* Header */}
      <CardHeader className="flex flex-row items-start justify-between pb-3 space-y-0 gap-2 border-b border-border/50 bg-muted/20">
        <div>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
              {title}
            </CardTitle>
            {infoTooltip && (
              <Tooltip content={infoTooltip}>
                <button
                  type="button"
                  className="text-muted-foreground/70 hover:text-foreground transition-colors"
                  aria-label={`${title} haqqında məlumat`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
          {subtitle && (
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {subtitle}
            </CardDescription>
          )}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {headerActions}

          {/* Table / Chart Accessible Toggle */}
          {onToggleViewMode && (
            <Tooltip content={viewMode === 'chart' ? 'Cədvəl görünüşünə keç' : 'Qrafik görünüşünə keç'}>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleViewMode}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label={viewMode === 'chart' ? 'Cədvələ keçid' : 'Qrafikə keçid'}
              >
                {viewMode === 'chart' ? (
                  <TableIcon className="h-3.5 w-3.5" />
                ) : (
                  <BarChart2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </Tooltip>
          )}

          {/* Export CSV Button */}
          {onExportCsv && (
            <Tooltip content="Məlumatları CSV olaraq yüklə">
              <Button
                variant="ghost"
                size="sm"
                onClick={onExportCsv}
                disabled={isLoading || isError || isEmpty}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label={`${title} məlumatlarını CSV ixrac et`}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}

          {/* Drill-down Report Link */}
          {drillDownUrl && (
            <Tooltip content={drillDownLabel}>
              <Link to={drillDownUrl}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label={drillDownLabel}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </Tooltip>
          )}
        </div>
      </CardHeader>

      {/* Content Body */}
      <CardContent className="p-4 flex-1 flex flex-col justify-center min-h-[220px]">
        {isLoading ? (
          <div className="space-y-3 py-4 w-full">
            <Skeleton variant="text" className="w-1/3 h-4" />
            <Skeleton variant="rectangular" className="w-full h-36 rounded-md" />
            <div className="flex justify-between">
              <Skeleton variant="text" className="w-20 h-3" />
              <Skeleton variant="text" className="w-20 h-3" />
            </div>
          </div>
        ) : isError ? (
          <div className="py-6 text-center">
            <ErrorState
              title="Məlumat xətası"
              description={errorMessage}
              onRetry={onRetry}
            />
          </div>
        ) : isEmpty ? (
          <div className="py-6 text-center">
            <EmptyState
              title="Məlumat yoxdur"
              description={emptyMessage}
            />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
};
