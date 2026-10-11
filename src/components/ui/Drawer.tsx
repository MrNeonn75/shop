import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

export interface DrawerProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  size = 'md',
  className,
}) => {
  const isDrawerOpen = isOpen !== undefined ? isOpen : (open ?? false);
  const handleOpenChange = (nextOpen: boolean) => {
    if (onOpenChange) onOpenChange(nextOpen);
    if (!nextOpen && onClose) onClose();
  };

  const maxWidths = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-xl',
    xl: 'sm:max-w-2xl',
  };

  const sideStyles = {
    right: cn('inset-y-0 right-0 h-full w-full border-l animate-in slide-in-from-right', maxWidths[size]),
    left: cn('inset-y-0 left-0 h-full w-full border-r animate-in slide-in-from-left', maxWidths[size]),
    bottom: 'inset-x-0 bottom-0 max-h-[85vh] border-t rounded-t-xl animate-in slide-in-from-bottom',
  };

  return (
    <Dialog.Root open={isDrawerOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col border-border bg-background p-6 shadow-2xl duration-300 ease-in-out',
            sideStyles[side],
            className
          )}
        >
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="space-y-1">
              {title && (
                <Dialog.Title className="text-base font-semibold text-foreground">
                  {title}
                </Dialog.Title>
              )}
              {description && (
                <Dialog.Description className="text-xs text-muted-foreground">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Bağla"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto py-4">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
