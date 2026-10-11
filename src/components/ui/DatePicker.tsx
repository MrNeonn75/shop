import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDate } from '../../shared/utils/formatters';
import { cn } from '../../shared/utils/cn';

export interface DatePickerProps {
  value?: Date | string | null;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  onChange?: (date: Date | null) => void;
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

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  placeholder = 'Tarix seçin (DD.MM.YYYY)',
  disabled,
  hasError,
  className,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? (typeof value === 'string' ? new Date(value) : value) : null;

  const [viewDate, setViewDate] = useState<Date>(selectedDate || new Date());

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Calendar calculations
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  // Adjust Monday-first (0 = Sunday in JS, we want 0 = Monday)
  const startingDay = (firstDayOfMonth + 6) % 7;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const handleSelectDay = (day: number) => {
    const newDate = new Date(currentYear, currentMonth, day);
    onChange?.(newDate);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
  };

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
            <span className={cn(!selectedDate && 'text-muted-foreground')}>
              {selectedDate ? formatDate(selectedDate) : placeholder}
            </span>
          </div>
          {selectedDate && !disabled && (
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
          className="z-50 w-72 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-80"
        >
          {/* Calendar Header */}
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

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center text-xs font-medium text-muted-foreground">
            {AZ_WEEKDAYS.map((wd) => (
              <div key={wd}>{wd}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {Array.from({ length: startingDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                selectedDate &&
                selectedDate.getDate() === day &&
                selectedDate.getMonth() === currentMonth &&
                selectedDate.getFullYear() === currentYear;

              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === currentMonth &&
                new Date().getFullYear() === currentYear;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    'h-8 w-8 rounded text-sm transition-colors flex items-center justify-center font-normal',
                    isSelected &&
                      'bg-bh-accent text-bh-accent-foreground font-semibold hover:bg-bh-accent-hover',
                    !isSelected && 'hover:bg-muted text-foreground',
                    isToday && !isSelected && 'border border-bh-accent font-medium'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick Footer */}
          <div className="pt-2 mt-2 border-t border-border flex justify-between">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                onChange?.(today);
                setViewDate(today);
                setOpen(false);
              }}
              className="text-xs text-bh-accent hover:underline font-medium"
            >
              Bu gün
            </button>
            <button
              type="button"
              onClick={() => {
                onChange?.(null);
                setOpen(false);
              }}
              className="text-xs text-muted-foreground hover:underline"
            >
              Təmizlə
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

