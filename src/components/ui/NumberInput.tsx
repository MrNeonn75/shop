import React, { forwardRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  hasError?: boolean;
  showSteppers?: boolean;
  onChange?: (value: number) => void;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      value,
      defaultValue,
      min,
      max,
      step = 1,
      hasError = false,
      showSteppers = true,
      disabled,
      onChange,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<number>(
      value !== undefined ? value : defaultValue !== undefined ? defaultValue : 0
    );

    const currentValue = value !== undefined ? value : internalValue;

    const handleIncrement = () => {
      if (disabled) return;
      const next = currentValue + step;
      if (max !== undefined && next > max) return;
      if (value === undefined) setInternalValue(next);
      onChange?.(next);
    };

    const handleDecrement = () => {
      if (disabled) return;
      const next = currentValue - step;
      if (min !== undefined && next < min) return;
      if (value === undefined) setInternalValue(next);
      onChange?.(next);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (isNaN(val)) {
        if (value === undefined) setInternalValue(0);
        onChange?.(0);
        return;
      }
      if (min !== undefined && val < min) return;
      if (max !== undefined && val > max) return;
      if (value === undefined) setInternalValue(val);
      onChange?.(val);
    };

    return (
      <div className="relative flex items-center w-full">
        <input
          type="number"
          ref={ref}
          value={currentValue}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={handleChange}
          aria-invalid={hasError ? 'true' : undefined}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            showSteppers && 'pr-20',
            hasError && 'border-danger focus-visible:ring-danger',
            className
          )}
          {...props}
        />
        {showSteppers && (
          <div className="absolute right-1 flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled || (min !== undefined && currentValue <= min)}
              onClick={handleDecrement}
              className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Decrease"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled || (max !== undefined && currentValue >= max)}
              onClick={handleIncrement}
              className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Increase"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';

