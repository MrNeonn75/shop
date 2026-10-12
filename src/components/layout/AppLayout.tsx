import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { InactivityTracker } from './InactivityTracker';
import { SessionExpiredModal } from './SessionExpiredModal';
import { PageSkeleton } from '../ui/PageSkeleton';
import { useOnlineStatus } from '../../shared/hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const isOnline = useOnlineStatus();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* WCAG 2.1 AA Skip-to-content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring font-medium text-xs"
      >
        Əsas məzmuna keç
      </a>

      {/* Session Inactivity Watcher & Preservation Modal */}
      <InactivityTracker />
      <SessionExpiredModal />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        {/* Global Offline Network Alert */}
        {!isOnline && (
          <div
            role="alert"
            className="bg-amber-500 text-black px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 tracking-wide"
          >
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>İnternet bağlantısı kəsilib. Sistem oflayn rejimdədir.</span>
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 focus:outline-none">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};
