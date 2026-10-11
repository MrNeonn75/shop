import React from 'react';
import { cn } from '../../shared/utils/cn';

export type BadgeVariant =
  | 'default'
  | 'neutral'
  | 'outline'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  hasDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size = 'md',
  hasDot = false,
  children,
  ...props
}) => {
  const variants: Record<BadgeVariant, string> = {
    default:
      'bg-bh-accent text-bh-accent-foreground border-transparent',
    neutral:
      'bg-bh-gray-100 text-bh-gray-800 dark:bg-bh-gray-800 dark:text-bh-gray-200 border-transparent',
    outline:
      'border border-border bg-transparent text-foreground',
    success:
      'bg-success/15 text-success border-success/20 dark:bg-success/20',
    warning:
      'bg-warning/15 text-warning border-warning/20 dark:bg-warning/20',
    danger:
      'bg-danger/15 text-danger border-danger/20 dark:bg-danger/20',
    info:
      'bg-info/15 text-info border-info/20 dark:bg-info/20',
  };

  const dotColors: Record<BadgeVariant, string> = {
    default: 'bg-bh-accent-foreground',
    neutral: 'bg-bh-gray-500',
    outline: 'bg-foreground',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border select-none transition-colors leading-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {hasDot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

export const StatusPill = Badge;

