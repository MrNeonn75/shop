import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

export type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none';

    const variants: Record<ButtonVariant, string> = {
      default:
        'bg-bh-accent text-bh-accent-foreground hover:bg-bh-accent-hover shadow-sm active:scale-[0.99]',
      secondary:
        'bg-bh-gray-100 text-bh-gray-900 hover:bg-bh-gray-200 dark:bg-bh-gray-800 dark:text-bh-gray-100 dark:hover:bg-bh-gray-700',
      outline:
        'border border-border bg-transparent hover:bg-muted text-foreground',
      ghost:
        'bg-transparent hover:bg-muted text-foreground',
      destructive:
        'bg-danger text-danger-foreground hover:opacity-90 shadow-sm active:scale-[0.99]',
      link:
        'text-foreground underline-offset-4 hover:underline p-0 h-auto font-normal',
    };

    const sizes: Record<ButtonSize, string> = {
      sm: 'h-8 px-3 text-xs rounded-sm gap-1.5',
      md: 'h-10 px-4 text-sm rounded-md gap-2',
      lg: 'h-12 px-6 text-base rounded-md gap-2.5',
      icon: 'h-10 w-10 p-0 rounded-md',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-current shrink-0" aria-hidden="true" />
        )}
        {!isLoading && leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

