import React, { useState, useCallback } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../shared/utils/cn';
import { ToastContext, ToastItem, ToastVariant } from './ToastContext';

export type { ToastItem, ToastVariant };

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = {
        ...item,
        id,
        variant: item.variant || item.type || 'default',
        description: item.description || item.message,
      };

      setToasts((prev) => [...prev, newToast]);

      const duration = item.duration ?? 4500;
      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }

      return id;
    },
    [dismiss]
  );

  const success = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: 'success' }),
    [toast]
  );

  const error = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: 'danger' }),
    [toast]
  );

  const warning = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: 'warning' }),
    [toast]
  );

  const info = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: 'info' }),
    [toast]
  );

  const icons: Record<ToastVariant, React.ReactNode> = {
    default: null,
    success: <CheckCircle2 className="h-5 w-5 text-success shrink-0" />,
    warning: <AlertTriangle className="h-5 w-5 text-warning shrink-0" />,
    danger: <AlertCircle className="h-5 w-5 text-danger shrink-0" />,
    error: <AlertCircle className="h-5 w-5 text-danger shrink-0" />,
    info: <Info className="h-5 w-5 text-info shrink-0" />,
  };

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info, dismiss }}>
      {children}
      {/* Toast viewport */}
      <div
        role="region"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => {
          const variant = t.variant || 'default';
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-background p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5',
                variant === 'success' && 'border-success/30',
                variant === 'warning' && 'border-warning/30',
                (variant === 'danger' || variant === 'error') && 'border-danger/30',
                variant === 'info' && 'border-info/30'
              )}
            >
              {icons[variant]}
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold leading-none text-foreground">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground leading-normal">{t.description}</p>
                )}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="text-xs font-semibold underline hover:no-underline pt-1 text-foreground"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Bağla"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
