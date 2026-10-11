import React from 'react';
import * as RadixAvatar from '@radix-ui/react-avatar';
import { cn } from '../../shared/utils/cn';

export interface AvatarProps {
  src?: string;
  alt?: string;
  fallbackText?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'busy' | 'offline';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = 'Avatar',
  fallbackText = 'BH',
  size = 'md',
  status,
  className,
}) => {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
  };

  const getInitials = (text: string) => {
    const parts = text.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return text.slice(0, 2).toUpperCase();
  };

  return (
    <div className="relative inline-flex shrink-0">
      <RadixAvatar.Root
        className={cn(
          'relative flex shrink-0 overflow-hidden rounded-full border border-border bg-muted font-medium select-none',
          sizes[size],
          className
        )}
      >
        <RadixAvatar.Image
          src={src}
          alt={alt}
          className="aspect-square h-full w-full object-cover"
        />
        <RadixAvatar.Fallback className="flex h-full w-full items-center justify-center bg-bh-gray-200 text-bh-gray-800 dark:bg-bh-gray-800 dark:text-bh-gray-200 font-semibold">
          {getInitials(fallbackText)}
        </RadixAvatar.Fallback>
      </RadixAvatar.Root>

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-background',
            status === 'online' && 'bg-success',
            status === 'busy' && 'bg-danger',
            status === 'offline' && 'bg-bh-gray-400'
          )}
          aria-label={status}
        />
      )}
    </div>
  );
};

