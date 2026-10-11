import React, { forwardRef } from 'react';
import { cn } from '../../shared/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefixText?: string;
  suffixText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      hasError = false,
      leftIcon,
      rightIcon,
      prefixText,
      suffixText,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3 flex items-center pointer-events-none text-muted-foreground">
            {leftIcon}
          </div>
        )}
        {prefixText && (
          <span className="absolute left-3 flex items-center pointer-events-none text-sm text-muted-foreground select-none">
            {prefixText}
          </span>
        )}
        <input
          type={type}
          ref={ref}
          disabled={disabled}
          aria-invalid={hasError ? 'true' : undefined}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            leftIcon && 'pl-9',
            prefixText && 'pl-8',
            rightIcon && 'pr-9',
            suffixText && 'pr-8',
            hasError && 'border-danger focus-visible:ring-danger',
            className
          )}
          {...props}
        />
        {suffixText && (
          <span className="absolute right-3 flex items-center pointer-events-none text-sm text-muted-foreground select-none">
            {suffixText}
          </span>
        )}
        {rightIcon && (
          <div className="absolute right-3 flex items-center pointer-events-none text-muted-foreground">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

