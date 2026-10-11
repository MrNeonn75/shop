import React, { useState } from 'react';
import { cn } from '../../shared/utils/cn';

export interface BrandLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showWordmark = true,
  className,
  wordmarkClassName,
  ...props
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const iconSizes = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const textSizes = {
    sm: 'text-sm font-semibold tracking-wider',
    md: 'text-base font-bold tracking-widest',
    lg: 'text-lg font-extrabold tracking-widest',
  };

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)} {...props}>
      {!imgFailed ? (
        <img
          src="/brand/logo-icon.svg"
          alt="Brand House Logo"
          className={cn(iconSizes[size], 'object-contain text-bh-accent')}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className={cn(
            iconSizes[size],
            'flex items-center justify-center bg-bh-accent text-bh-accent-foreground font-bold rounded text-xs'
          )}
        >
          BH
        </div>
      )}

      {showWordmark && (
        <span
          className={cn(
            textSizes[size],
            'uppercase text-foreground transition-colors',
            wordmarkClassName
          )}
        >
          BRAND HOUSE
        </span>
      )}
    </div>
  );
};

