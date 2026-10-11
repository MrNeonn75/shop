import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Select, SelectOption } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Tooltip } from '../../../components/ui/Tooltip';
import {
  RotateCw,
  Calendar,
  Clock,
  Sparkles,
} from 'lucide-react';
import { DashboardFilterParams, DatePreset, ComparisonMode } from '../types';
import { DATE_PRESETS } from '../utils/datePresets';
import { formatDateTime } from '../../../shared/utils/formatters';

export interface DashboardFilterBarProps {
  filterParams: DashboardFilterParams;
  userCanAccessAll: boolean;
  onBranchChange: (branchId: string) => void;
  onPresetChange: (preset: DatePreset) => void;
  onCustomDateChange: (startDate: string, endDate: string) => void;
  onComparisonChange: (mode: ComparisonMode) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdatedAt?: string;
  autoRefreshEnabled?: boolean;
  onToggleAutoRefresh?: () => void;
}

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  filterParams,
  userCanAccessAll,
  onBranchChange,
  onPresetChange,
  onCustomDateChange,
  onComparisonChange,
  onRefresh,
  isRefreshing = false,
  lastUpdatedAt,
  autoRefreshEnabled = true,
  onToggleAutoRefresh,
}) => {
  const [customStart, setCustomStart] = useState(filterParams.startDate);
  const [customEnd, setCustomEnd] = useState(filterParams.endDate);

  const branchOptions: SelectOption[] = userCanAccessAll
    ? [
        { value: 'all', label: 'Bütün Filiallar (Şəbəkə)' },
        { value: 'branch_28may', label: '28 May Filialı' },
        { value: 'branch_genclik', label: 'Gənclik Mall Filialı' },
        { value: 'branch_nizami', label: 'Nizami Filialı' },
        { value: 'branch_deniz', label: 'Dəniz Mall Filialı' },
      ]
    : [
        { value: filterParams.branchId, label: 'Təhkim Olunmuş Filial' },
      ];

  const comparisonOptions: SelectOption[] = [
    { value: 'previous_period', label: 'Əvvəlki dövr ilə müqayisə' },
    { value: 'same_period_last_year', label: 'Keçən ilin eyni dövrü ilə' },
    { value: 'none', label: 'Müqayisəsiz' },
  ];

  const handleApplyCustomDates = () => {
    if (customStart && customEnd) {
      onCustomDateChange(customStart, customEnd);
    }
  };

  return (
    <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background/95 backdrop-blur-md border-b border-border shadow-xs transition-colors">
      <div className="flex flex-col gap-3">
        {/* Top Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Branch & Comparison Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Selector */}
            <div className="w-56" data-testid="dashboard-branch-select">
              <Select
                value={filterParams.branchId}
                options={branchOptions}
                onValueChange={onBranchChange}
                disabled={!userCanAccessAll}
              />
            </div>

            {/* Comparison Mode */}
            <div className="w-64" data-testid="dashboard-compare-select">
              <Select
                value={filterParams.comparisonMode}
                options={comparisonOptions}
                onValueChange={(val) => onComparisonChange(val as ComparisonMode)}
              />
            </div>

            {/* Demo Data Notice Chip */}
            <Tooltip
              content="Bu idarəetmə panelindəki bütün rəqəmlər deterministik DEMO generatoru vasitəsilə tərtib olunmuşdur. Əsl mağaza API inteqrasiyası aktivləşdirildikdə canlı məlumatlar əks olunacaqdır."
            >
              <Badge variant="neutral" size="sm" className="hidden xl:inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-warning" />
                DEMO Rejimi
              </Badge>
            </Tooltip>
          </div>

          {/* Right: Refresh Controls & Auto-refresh status */}
          <div className="flex items-center gap-2 shrink-0">
            {lastUpdatedAt && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Yeniləndi: {formatDateTime(lastUpdatedAt, true)}</span>
              </span>
            )}

            {onToggleAutoRefresh && (
              <Tooltip content="Məlumatların hər 60 saniyədən bir avtomatik yenilənməsi">
                <Button
                  variant={autoRefreshEnabled ? 'outline' : 'ghost'}
                  size="sm"
                  onClick={onToggleAutoRefresh}
                  className="text-xs font-normal"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full mr-1.5 ${
                      autoRefreshEnabled ? 'bg-success animate-pulse' : 'bg-muted-foreground'
                    }`}
                  />
                  Avto (60s)
                </Button>
              </Tooltip>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              leftIcon={<RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
            >
              Yenilə
            </Button>
          </div>
        </div>

        {/* Date Presets Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex flex-wrap items-center gap-1.5" data-testid="dashboard-preset-buttons">
            <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Dövr:
            </span>
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.preset}
                onClick={() => onPresetChange(preset.preset)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  filterParams.datePreset === preset.preset
                    ? 'bg-foreground text-background shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                data-testid={`preset-${preset.preset}`}
              >
                {preset.labelAz}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs (when 'custom' preset is active) */}
          {filterParams.datePreset === 'custom' && (
            <div className="flex items-center gap-2 animate-in fade-in-50">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 text-xs w-36"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 text-xs w-36"
              />
              <Button size="sm" variant="secondary" onClick={handleApplyCustomDates} className="h-8 text-xs">
                Tətbiq et
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
