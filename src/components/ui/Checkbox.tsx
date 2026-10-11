import React from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

export interface CheckboxProps {
  id?: string;
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  hasError?: boolean;
  className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  id,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  label,
  hint,
  hasError,
  className,
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  return (
    <div className={cn('flex items-start gap-2.5 select-none', className)}>
      <RadixCheckbox.Root
        id={inputId}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-invalid={hasError ? 'true' : undefined}
        className={cn(
          'peer h-4 w-4 shrink-0 mt-0.5 rounded border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors data-[state=checked]:bg-bh-accent data-[state=checked]:text-bh-accent-foreground data-[state=checked]:border-bh-accent data-[state=indeterminate]:bg-bh-accent data-[state=indeterminate]:text-bh-accent-foreground',
          hasError && 'border-danger focus-visible:ring-danger'
        )}
      >
        <RadixCheckbox.Indicator className="flex items-center justify-center text-current">
          {checked === 'indeterminate' ? (
            <Minus className="h-3 w-3 stroke-[3]" />
          ) : (
            <Check className="h-3 w-3 stroke-[3]" />
          )}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>

      {(label || hint) && (
        <div className="grid gap-1 leading-none">
          {label && (
            <label
              htmlFor={inputId}
              className={cn(
                'text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
                hasError && 'text-danger'
              )}
            >
              {label}
            </label>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}
    </div>
  );
};

