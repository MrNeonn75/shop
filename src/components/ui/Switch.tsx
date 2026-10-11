import React from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from '../../shared/utils/cn';

export interface SwitchProps {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  id,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  label,
  hint,
  className,
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  return (
    <div className={cn('flex items-center gap-3 select-none', className)}>
      <RadixSwitch.Root
        id={inputId}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-bh-accent data-[state=unchecked]:bg-bh-gray-300 dark:data-[state=unchecked]:bg-bh-gray-700'
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
          )}
        />
      </RadixSwitch.Root>
      {(label || hint) && (
        <div className="grid gap-0.5 leading-none">
          {label && (
            <label
              htmlFor={inputId}
              className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
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

