import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Calendar, Search } from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { checkPermissionMatch } from '../../../shared/utils/permissions';

interface FinanceFilterBarProps {
  branches?: Array<{ id: string; name: string }>;
  showSearch?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

export const FinanceFilterBar: React.FC<FinanceFilterBarProps> = ({
  branches = [
    { id: 'branch-1', name: '28 May Flaman Filialı' },
    { id: 'branch-2', name: 'Gənclik Mall Filialı' },
    { id: 'branch-3', name: 'Dəniz Mall Filialı' },
  ],
  showSearch = true,
  searchPlaceholder = 'Sənəd nömrəsi, təsvir, təchizatçı və ya müştəri...',
  className = '',
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useSessionStore((s) => s.user);

  const canAccessAllBranches =
    user?.canAccessAllBranches ||
    (user && checkPermissionMatch(user.permissions, 'admin.branches.all'));

  const currentBranch = searchParams.get('branchId') || (canAccessAllBranches ? 'all' : user?.branchId || 'all');
  const currentPreset = searchParams.get('datePreset') || 'this_month';
  const currentSearch = searchParams.get('search') || '';

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all' || (key === 'datePreset' && value === 'this_month')) {
      if (value === 'all') next.set(key, 'all');
      else next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div
      className={`sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Branch Selector */}
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="font-medium text-slate-600 dark:text-slate-400">Filial:</span>
          <select
            value={currentBranch}
            onChange={(e) => updateParam('branchId', e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden dark:text-slate-100"
          >
            {canAccessAllBranches && <option value="all">Bütün Filiallar (Konsolidasiya)</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Preset Selector */}
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
          <Calendar className="h-4 w-4 text-slate-500" />
          <span className="font-medium text-slate-600 dark:text-slate-400">Dövr:</span>
          <select
            value={currentPreset}
            onChange={(e) => updateParam('datePreset', e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden dark:text-slate-100"
          >
            <option value="today">Bu gün</option>
            <option value="yesterday">Dünən</option>
            <option value="last_7_days">Son 7 gün</option>
            <option value="this_month">Bu ay (Aprel)</option>
            <option value="last_month">Keçən ay (Mart)</option>
            <option value="this_quarter">Cari Rüblük (Q1)</option>
            <option value="this_year">Bu il (2026)</option>
            <option value="custom">Xüsusi Tarix...</option>
          </select>
        </div>
      </div>

      {/* Optional Search Input */}
      {showSearch && (
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={currentSearch}
            onChange={(e) => updateParam('search', e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-hidden focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      )}
    </div>
  );
};
