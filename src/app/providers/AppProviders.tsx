import React from 'react';
import { QueryProvider } from './QueryProvider';
import { ToastProvider } from '../../components/ui/Toast';
import { ErrorBoundary } from '../../components/feedback/ErrorBoundary';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <ToastProvider>{children}</ToastProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
};

