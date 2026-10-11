import React, { useState, useEffect, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '../../shared/utils/cn';
import { useDebounce } from '../../shared/hooks/useDebounce';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  value?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  options?: ComboboxOption[];
  onSearchAsync?: (query: string) => Promise<ComboboxOption[]>;
  onSelect?: (value: string, option?: ComboboxOption) => void;
  disabled?: boolean;
  hasError?: boolean;
  clearable?: boolean;
  className?: string;
}

export const Combobox: React.FC<ComboboxProps> = ({
  value,
  placeholder = 'Seçin...',
  searchPlaceholder = 'Axtarış...',
  options: staticOptions = [],
  onSearchAsync,
  onSelect,
  disabled,
  hasError,
  clearable = true,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [asyncOptions, setAsyncOptions] = useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!onSearchAsync || !open) return;

    let active = true;
    setIsLoading(true);
    onSearchAsync(debouncedQuery)
      .then((results) => {
        if (active) {
          setAsyncOptions(results);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Combobox async search error:', err);
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, onSearchAsync, open]);

  const activeOptions = onSearchAsync
    ? asyncOptions
    : staticOptions.filter((opt) =>
        opt.label.toLowerCase().includes(query.toLowerCase())
      );

  const selectedOption =
    staticOptions.find((o) => o.value === value) ||
    asyncOptions.find((o) => o.value === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn('relative flex items-center w-full', className)}>
        <Popover.Trigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-invalid={hasError ? 'true' : undefined}
            disabled={disabled}
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              hasError && 'border-danger focus:ring-danger'
            )}
          >
            <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {clearable && selectedOption && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onSelect?.('');
                    }
                  }}
                  className="rounded p-0.5 hover:bg-muted text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </div>
          </button>
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[200px] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in-80"
        >
          <div className="flex items-center border-b border-border px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex h-7 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />}
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {activeOptions.length === 0 && !isLoading && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Nəticə tapılmadı.
              </div>
            )}
            {activeOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    if (opt.disabled) return;
                    onSelect?.(opt.value, opt);
                    setOpen(false);
                  }}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center justify-between rounded-sm px-2.5 py-1.5 text-sm outline-none hover:bg-muted transition-colors',
                    isSelected && 'bg-muted/80 font-medium',
                    opt.disabled && 'pointer-events-none opacity-50'
                  )}
                >
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
                    )}
                  </div>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-foreground" />}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

