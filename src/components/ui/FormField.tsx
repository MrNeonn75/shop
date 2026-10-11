import React from 'react';
import { cn } from '../../shared/utils/cn';

export interface FormFieldProps {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  hint,
  error,
  id,
  className,
  children,
}) => {
  const generatedId = React.useId();
  const fieldId = id || generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      {label && (
        <label
          htmlFor={fieldId}
          className="text-sm font-medium text-foreground leading-none flex items-center gap-1 select-none"
        >
          {label}
          {required && <span className="text-danger" aria-hidden="true">*</span>}
        </label>
      )}

      <div>{children}</div>

      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground leading-normal">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-danger leading-normal animate-in fade-in-50"
        >
          {error}
        </p>
      )}
    </div>
  );
};

