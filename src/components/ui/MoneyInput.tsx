import React, { forwardRef, useEffect, useState } from 'react';
import { aznToQapik, Qapik, qapikToAzn, qapikToAznString } from '../../shared/utils/money';
import { cn } from '../../shared/utils/cn';

export interface MoneyValueChange {
  qapik: Qapik;
  azn: number;
  formatted: string;
}

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: Qapik | number; // Integer Qəpik or decimal
  isQapik?: boolean; // Defaults to true
  hasError?: boolean;
  onMoneyChange?: (val: MoneyValueChange) => void;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      className,
      value,
      isQapik = true,
      hasError = false,
      disabled,
      onMoneyChange,
      ...props
    },
    ref
  ) => {
    const getInitialString = (): string => {
      if (value === undefined || value === null) return '';
      if (isQapik) {
        return qapikToAznString(value as Qapik);
      }
      return Number(value).toFixed(2);
    };

    const [displayVal, setDisplayVal] = useState<string>(getInitialString());

    useEffect(() => {
      if (value !== undefined && value !== null) {
        setDisplayVal(isQapik ? qapikToAznString(value as Qapik) : Number(value).toFixed(2));
      }
    }, [value, isQapik]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value.replace(/,/g, '.');
      // Allow only numbers and a single period
      if (!/^\d*\.?\d{0,2}$/.test(raw)) {
        return;
      }

      setDisplayVal(raw);

      const qapik = aznToQapik(raw);
      const azn = qapikToAzn(qapik);
      onMoneyChange?.({
        qapik,
        azn,
        formatted: `${raw || '0.00'} ₼`,
      });
    };

    const handleBlur = () => {
      if (!displayVal) return;
      const qapik = aznToQapik(displayVal);
      const formatted = qapikToAznString(qapik);
      setDisplayVal(formatted);
    };

    return (
      <div className="relative flex items-center w-full">
        <input
          type="text"
          inputMode="decimal"
          ref={ref}
          value={displayVal}
          disabled={disabled}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder="0.00"
          aria-invalid={hasError ? 'true' : undefined}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm ring-offset-background font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            hasError && 'border-danger focus-visible:ring-danger',
            className
          )}
          {...props}
        />
        <span className="absolute right-3 text-sm font-semibold text-muted-foreground pointer-events-none select-none">
          ₼
        </span>
      </div>
    );
  }
);

MoneyInput.displayName = 'MoneyInput';

