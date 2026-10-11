import React from 'react';
import { Search, RotateCcw, X, Building2 } from 'lucide-react';
import { Button } from './Button';
import { DateRangePicker, DateRange } from './DateRangePicker';
import { Badge } from './Badge';
import { formatDate } from '../../shared/utils/formatters';
import { cn } from '../../shared/utils/cn';

export interface BranchOption {
  id: string;
  name: string;
}

export interface FilterBarValues {
  search: string;
  branchId: string;
  dateRange: DateRange;
}

export interface FilterBarProps {
  branches?: BranchOption[];
  values: FilterBarValues;
  onChange: (values: FilterBarValues) => void;
  onReset?: () => void;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  branches = [
    { id: 'all', name: 'Bütün filiallar' },
    { id: 'branch-1', name: 'Nizami (Baş Filial)' },
    { id: 'branch-2', name: 'Gənclik Mall Filialı' },
    { id: 'branch-3', name: '28 Mall Filialı' },
    { id: 'branch-4', name: 'Dəniz Mall Filialı' },
  ],
  values,
  onChange,
  onReset,
  className,
}) => {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, search: e.target.value });
  };

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...values, branchId: e.target.value });
  };

  const handleDateRangeChange = (range: DateRange) => {
    onChange({ ...values, dateRange: range });
  };

  const hasActiveFilters =
    Boolean(values.search.trim()) ||
    (values.branchId && values.branchId !== 'all') ||
    Boolean(values.dateRange.startDate);

  const selectedBranchName = branches.find((b) => b.id === values.branchId)?.name;

  return (
    <div className={cn('flex flex-col gap-2.5 p-3.5 rounded-lg border border-border bg-card', className)}>
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={values.search}
            onChange={handleSearchChange}
            placeholder="Məhsul adı, SKU, barkod və ya brend ilə axtar..."
            className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {values.search && (
            <button
              type="button"
              onClick={() => onChange({ ...values, search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Branch Selector */}
        <div className="relative min-w-[190px]">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <select
            value={values.branchId}
            onChange={handleBranchChange}
            className="flex h-10 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Picker */}
        <div className="min-w-[240px]">
          <DateRangePicker
            value={values.dateRange}
            onChange={handleDateRangeChange}
            placeholder="Tarix aralığı seçin"
          />
        </div>

        {/* Reset Button */}
        {hasActiveFilters && onReset && (
          <Button
            variant="ghost"
            size="md"
            onClick={onReset}
            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            className="text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            Sıfırla
          </Button>
        )}
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50 text-xs text-muted-foreground">
          <span>Aktiv filtrlər:</span>
          {values.search && (
            <Badge variant="neutral" size="sm" className="gap-1">
              Axtarış: &quot;{values.search}&quot;
              <X
                className="h-3 w-3 cursor-pointer hover:text-foreground"
                onClick={() => onChange({ ...values, search: '' })}
              />
            </Badge>
          )}
          {values.branchId && values.branchId !== 'all' && (
            <Badge variant="neutral" size="sm" className="gap-1">
              Filial: {selectedBranchName}
              <X
                className="h-3 w-3 cursor-pointer hover:text-foreground"
                onClick={() => onChange({ ...values, branchId: 'all' })}
              />
            </Badge>
          )}
          {values.dateRange.startDate && (
            <Badge variant="neutral" size="sm" className="gap-1">
              Tarix: {formatDate(values.dateRange.startDate)}
              {values.dateRange.endDate && ` - ${formatDate(values.dateRange.endDate)}`}
              <X
                className="h-3 w-3 cursor-pointer hover:text-foreground"
                onClick={() =>
                  onChange({
                    ...values,
                    dateRange: { startDate: null, endDate: null },
                  })
                }
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};

