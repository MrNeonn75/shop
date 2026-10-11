import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { usePermission } from '../../../shared/hooks/usePermission';
import { DashboardFilterParams, DatePreset, ComparisonMode } from '../types';
import { getDateRangeForPreset } from '../utils/datePresets';

export function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, activeBranchId } = useSessionStore();
  const { canAccessAllBranches } = usePermission();

  const userCanAccessAll = Boolean(canAccessAllBranches || user?.canAccessAllBranches);

  // Branch parameter logic
  const branchParam = searchParams.get('branch');
  const effectiveBranchId = useMemo(() => {
    if (!userCanAccessAll) {
      // Restricted user must stay in their allowed branch
      return user?.branchId || activeBranchId || 'branch_28may';
    }
    if (branchParam) {
      return branchParam;
    }
    return activeBranchId || 'all';
  }, [userCanAccessAll, branchParam, user?.branchId, activeBranchId]);

  // Date preset parameter logic
  const presetParam = (searchParams.get('preset') as DatePreset) || 'this_month';
  const comparisonParam = (searchParams.get('compare') as ComparisonMode) || 'previous_period';

  const dateRange = useMemo(() => {
    if (presetParam === 'custom') {
      const start = searchParams.get('startDate');
      const end = searchParams.get('endDate');
      if (start && end) {
        return { startDate: start, endDate: end };
      }
    }
    return getDateRangeForPreset(presetParam);
  }, [presetParam, searchParams]);

  const filterParams: DashboardFilterParams = useMemo(
    () => ({
      branchId: effectiveBranchId,
      datePreset: presetParam,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      comparisonMode: comparisonParam,
    }),
    [effectiveBranchId, presetParam, dateRange.startDate, dateRange.endDate, comparisonParam]
  );

  const updateParams = useCallback(
    (newParams: Partial<DashboardFilterParams>) => {
      const current = new URLSearchParams(searchParams);

      if (newParams.branchId !== undefined) {
        if (newParams.branchId === 'all') {
          current.delete('branch');
        } else {
          current.set('branch', newParams.branchId);
        }
      }

      if (newParams.datePreset !== undefined) {
        current.set('preset', newParams.datePreset);
        if (newParams.datePreset !== 'custom') {
          current.delete('startDate');
          current.delete('endDate');
        }
      }

      if (newParams.startDate !== undefined) {
        current.set('startDate', newParams.startDate);
      }
      if (newParams.endDate !== undefined) {
        current.set('endDate', newParams.endDate);
      }

      if (newParams.comparisonMode !== undefined) {
        current.set('compare', newParams.comparisonMode);
      }

      setSearchParams(current, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setBranchId = useCallback(
    (branchId: string) => {
      updateParams({ branchId });
    },
    [updateParams]
  );

  const setDatePreset = useCallback(
    (preset: DatePreset) => {
      if (preset !== 'custom') {
        const { startDate, endDate } = getDateRangeForPreset(preset);
        updateParams({ datePreset: preset, startDate, endDate });
      } else {
        updateParams({ datePreset: preset });
      }
    },
    [updateParams]
  );

  const setCustomDateRange = useCallback(
    (startDate: string, endDate: string) => {
      updateParams({ datePreset: 'custom', startDate, endDate });
    },
    [updateParams]
  );

  const setComparisonMode = useCallback(
    (mode: ComparisonMode) => {
      updateParams({ comparisonMode: mode });
    },
    [updateParams]
  );

  return {
    filterParams,
    userCanAccessAll,
    setBranchId,
    setDatePreset,
    setCustomDateRange,
    setComparisonMode,
  };
}
