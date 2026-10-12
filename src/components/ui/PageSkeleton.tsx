import React from 'react';
import { Skeleton } from './Skeleton';

export const PageSkeleton: React.FC = () => {
  return (
    <div
      className="p-6 max-w-7xl mx-auto space-y-6"
      role="status"
      aria-label="Səhifə yüklənir..."
    >
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* KPI Cards / Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-border bg-card space-y-3">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-7 w-32 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* Content / Table block */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-36 rounded" />
          <Skeleton className="h-8 w-44 rounded-lg" />
        </div>
        <div className="space-y-2.5 pt-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
};
