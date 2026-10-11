import React from 'react';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  options?: RadioOption[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  children?: React.ReactNode;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  defaultValue,
  onValueChange,
  disabled,
  name,
  options,
  orientation = 'vertical',
  className,
  children,
}) => {
  return (
    <RadixRadioGroup.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
      orientation={orientation}
      className={cn(
        'grid gap-2.5',
        orientation === 'horizontal' && 'flex flex-wrap items-center gap-4',
        className
      )}
    >
      {options
        ? options.map((opt) => (
            <div key={opt.value} className="flex items-start gap-2.5 select-none">
              <RadixRadioGroup.Item
                id={`radio-${opt.value}`}
                value={opt.value}
                disabled={opt.disabled}
                className="peer h-4 w-4 rounded-full border border-input text-bh-accent ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-bh-accent mt-0.5"
              >
                <RadixRadioGroup.Indicator className="flex items-center justify-center">
                  <Circle className="h-2 w-2 fill-current text-current" />
                </RadixRadioGroup.Indicator>
              </RadixRadioGroup.Item>
              <div className="grid gap-0.5 leading-none">
                <label
                  htmlFor={`radio-${opt.value}`}
                  className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {opt.label}
                </label>
                {opt.hint && <p className="text-xs text-muted-foreground">{opt.hint}</p>}
              </div>
            </div>
          ))
        : children}
    </RadixRadioGroup.Root>
  );
};

export const RadioGroupItem: React.FC<{
  value: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}> = ({ value, id, disabled, className }) => {
  return (
    <RadixRadioGroup.Item
      id={id}
      value={value}
      disabled={disabled}
      className={cn(
        'peer h-4 w-4 rounded-full border border-input text-bh-accent ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-bh-accent',
        className
      )}
    >
      <RadixRadioGroup.Indicator className="flex items-center justify-center">
        <Circle className="h-2 w-2 fill-current text-current" />
      </RadixRadioGroup.Indicator>
    </RadixRadioGroup.Item>
  );
};

