import React from 'react';
import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { cn } from '../../shared/utils/cn';

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;

export const DropdownMenuContent: React.FC<
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Content>
> = ({ className, sideOffset = 4, ...props }) => {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80',
          className
        )}
        {...props}
      />
    </RadixDropdown.Portal>
  );
};

export const DropdownMenuItem: React.FC<
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Item> & {
    inset?: boolean;
    destructive?: boolean;
  }
> = ({ className, inset, destructive, ...props }) => {
  return (
    <RadixDropdown.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 gap-2',
        inset && 'pl-8',
        destructive && 'text-danger hover:bg-danger/10 focus:bg-danger/10',
        className
      )}
      {...props}
    />
  );
};

export const DropdownMenuLabel: React.FC<
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Label> & { inset?: boolean }
> = ({ className, inset, ...props }) => {
  return (
    <RadixDropdown.Label
      className={cn(
        'px-2 py-1.5 text-xs font-semibold text-muted-foreground',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  );
};

export const DropdownMenuSeparator: React.FC<
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Separator>
> = ({ className, ...props }) => {
  return (
    <RadixDropdown.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
};
