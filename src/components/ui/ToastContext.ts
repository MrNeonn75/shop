import { createContext } from 'react';

export type ToastVariant = 'default' | 'success' | 'warning' | 'danger' | 'error' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  message?: string;
  variant?: ToastVariant;
  type?: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastContextType {
  toast: (item: Omit<ToastItem, 'id'>) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

