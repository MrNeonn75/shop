import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDate } from '../../shared/utils/formatters';
import { cn } from '../../shared/utils/cn';

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export interface DateRangePickerProps {
  value?: DateRange;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  onChange?: (range: DateRange) => void;
}

const AZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'İyun',
  'İyul',
  'Avqust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
];

const AZ_WEEKDAYS = ['B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş', 'B'];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  placeholder = 'Tarix aralığı seçin',
  disabled,
  hasError,
  className,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(
    value || { startDate: null, endDate: null }
  );

  const [viewDate, setViewDate] = useState<Date>(
    range.startDate || new Date()
  );

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const startingDay = (firstDayOfMonth + 6) % 7;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const handleSelectDay = (day: number) => {
    const clickedDate = new Date(currentYear, currentMonth, day);

    if (!range.startDate || (range.startDate && range.endDate)) {
      const next = { startDate: clickedDate, endDate: null };
      setRange(next);
      onChange?.(next);
    } else if (range.startDate && !range.endDate) {
      if (clickedDate < range.startDate) {
        const next = { startDate: clickedDate, endDate: range.startDate };
        setRange(next);
        onChange?.(next);
      } else {
        const next = { startDate: range.startDate, endDate: clickedDate };
        setRange(next);
        onChange?.(next);
      }
    }
  };

  const setPreset = (type: 'today' | 'week' | 'month' | 'last30') => {
    const now = new Date();
    let start: Date;
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (type === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (type === 'week') {
      const day = now.getDay() || 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    } else if (type === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    }

    const nextRange = { startDate: start, endDate: end };
    setRange(nextRange);
    onChange?.(nextRange);
    setViewDate(start);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    const empty = { startDate: null, endDate: null };
    setRange(empty);
    onChange?.(empty);
  };

  const displayText =
    range.startDate && range.endDate
      ? `${formatDate(range.startDate)} — ${formatDate(range.endDate)}`
      : range.startDate
      ? `${formatDate(range.startDate)} — ...`
      : placeholder;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-invalid={hasError ? 'true' : undefined}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            hasError && 'border-danger focus:ring-danger',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 opacity-50 shrink-0" />
            <span className={cn(!range.startDate && 'text-muted-foreground')}>
              {displayText}
            </span>
          </div>
          {range.startDate && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 flex flex-col md:flex-row gap-3 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-80"
        >
          {/* Quick presets sidebar */}
          <div className="flex md:flex-col gap-1 border-b md:border-b-0 md:border-r border-border pb-2 md:pb-0 md:pr-3 min-w-[100px]">
            <span className="text-xs font-semibold text-muted-foreground mb-1 hidden md:block">
              Tez seçimlər
            </span>
            <button
              type="button"
              onClick={() => setPreset('today')}
              className="text-xs text-left px-2 py-1 rounded hover:bg-muted"
            >
              Bu gün
            </button>
            <button
              type="button"
              onClick={() => setPreset('week')}
              className="text-xs text-left px-2 py-1 rounded hover:bg-muted"
            >
              Bu həftə
            </button>
            <button
              type="button"
              onClick={() => setPreset('month')}
              className="text-xs text-left px-2 py-1 rounded hover:bg-muted"
            >
              Bu ay
            </button>
            <button
              type="button"
              onClick={() => setPreset('last30')}
              className="text-xs text-left px-2 py-1 rounded hover:bg-muted"
            >
              Son 30 gün
            </button>
          </div>

          {/* Calendar view */}
          <div className="w-72">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">
                {AZ_MONTHS[currentMonth]} {currentYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center text-xs font-medium text-muted-foreground">
              {AZ_WEEKDAYS.map((wd) => (
                <div key={wd}>{wd}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {Array.from({ length: startingDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const thisDate = new Date(currentYear, currentMonth, day);

                const isStart =
                  range.startDate &&
                  range.startDate.toDateString() === thisDate.toDateString();
                const isEnd =
                  range.endDate &&
                  range.endDate.toDateString() === thisDate.toDateString();
                const inRange =
                  range.startDate &&
                  range.endDate &&
                  thisDate > range.startDate &&
                  thisDate < range.endDate;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={cn(
                      'h-8 w-8 text-sm transition-colors flex items-center justify-center font-normal rounded-sm',
                      (isStart || isEnd) &&
                        'bg-bh-accent text-bh-accent-foreground font-semibold',
                      inRange && 'bg-muted text-foreground',
                      !isStart && !isEnd && !inRange && 'hover:bg-muted text-foreground'
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 mt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1 bg-bh-accent text-bh-accent-foreground text-xs rounded hover:bg-bh-accent-hover font-medium"
              >
                Tətbiq et
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

