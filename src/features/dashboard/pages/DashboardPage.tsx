import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Tooltip } from '../../../components/ui/Tooltip';
import { useToast } from '../../../components/ui/useToast';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { DashboardFilterBar } from '../components/DashboardFilterBar';
import { DashboardKpiCard } from '../components/DashboardKpiCard';
import { dashboardRepository } from '../../../shared/adapters';
import { KpiMetricId } from '../kpiDefinitions';
import { useExportCsv } from '../../../shared/hooks/useExportCsv';

// 11 Modular Widgets
import { SalesTrendWidget } from '../components/widgets/SalesTrendWidget';
import { SalesByBranchWidget } from '../components/widgets/SalesByBranchWidget';
import { SalesBySectionTypeWidget } from '../components/widgets/SalesBySectionTypeWidget';
import { TopSellingProductsWidget } from '../components/widgets/TopSellingProductsWidget';
import { PaymentMethodsWidget } from '../components/widgets/PaymentMethodsWidget';
import { LowStockAlertsWidget } from '../components/widgets/LowStockAlertsWidget';
import { SlowMovingStockWidget } from '../components/widgets/SlowMovingStockWidget';
import { ExpenseTrendWidget } from '../components/widgets/ExpenseTrendWidget';
import { OpenOrdersTransfersWidget } from '../components/widgets/OpenOrdersTransfersWidget';
import { CashRegistersTodayWidget } from '../components/widgets/CashRegistersTodayWidget';
import { RecentActivityFeedWidget } from '../components/widgets/RecentActivityFeedWidget';

import {
  Download,
  UserCheck,
  Sparkles,
} from 'lucide-react';

const AUTO_REFRESH_INTERVAL_MS = 60000; // 60 seconds

export const DashboardPage: React.FC = () => {
  const { user } = useSessionStore();
  const { toast } = useToast();

  const {
    filterParams,
    userCanAccessAll,
    setBranchId,
    setDatePreset,
    setCustomDateRange,
    setComparisonMode,
  } = useDashboardFilters();

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const { exportToCsv } = useExportCsv();

  // Query for KPI Summary Metrics
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isRefetching: isSummaryRefetching,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['dashboard', 'summary', filterParams],
    queryFn: () => dashboardRepository.getSummary(filterParams),
    refetchInterval: autoRefreshEnabled ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  const handleManualRefresh = () => {
    refetchSummary();
    toast({
      type: 'info',
      title: 'Məlumatlar yenilənir',
      message: 'İdarəetmə paneli üçün ən son məlumatlar sorğulandı.',
    });
  };

  const handleToggleAutoRefresh = () => {
    setAutoRefreshEnabled((prev) => !prev);
    toast({
      type: 'info',
      title: !autoRefreshEnabled ? 'Avtomatik yenilənmə aktivdir' : 'Avtomatik yenilənmə dayandırıldı',
      message: !autoRefreshEnabled
        ? 'Məlumatlar hər 60 saniyədən bir yenilənəcəkdir.'
        : 'Yalnız əllə "Yenilə" düyməsi ilə sorğu göndəriləcək.',
    });
  };

  // Global Export of Dashboard Summary KPIs to CSV
  const handleExportDashboardSummary = () => {
    if (!summaryData) return;

    const rows = Object.values(summaryData.metrics).map((m) => ({
      metricId: m.id,
      value: m.value,
      isCalculated: m.isCalculated ? 'Bəli' : 'Xeyr',
      changePercentage: m.changePercentage !== undefined ? `${m.changePercentage}%` : '—',
    }));

    exportToCsv(rows, {
      filename: `brand_house_dashboard_kpi_${filterParams.startDate}_${filterParams.endDate}.csv`,
      columns: [
        { header: 'Göstərici ID', accessor: 'metricId' },
        { header: 'Faktiki Dəyər', accessor: 'value' },
        { header: 'Hesablanıb', accessor: 'isCalculated' },
        { header: 'Dəyişim (%)', accessor: 'changePercentage' },
      ],
    });

    toast({
      type: 'success',
      title: 'İcmal İxrac Edildi',
      message: 'KPI göstəriciləri CSV formatında uğurla endirildi.',
    });
  };

  // Determine User Role Context for tailored dashboard layout
  const userRole = user?.role || 'superadmin';
  const isSuperOrGeneral = userRole === 'superadmin' || userRole === 'general_manager';
  const isBranchManager = userRole === 'branch_manager';
  const isCashier = userRole === 'cashier';
  const isWarehouse = userRole === 'warehouse_keeper';
  const isAccountant = userRole === 'accountant';

  // Determine visible KPI metric IDs based on role & permissions
  const visibleKpiIds: KpiMetricId[] = (() => {
    if (isCashier) {
      return ['totalSales', 'averageOrderValue', 'unitsSold', 'returnRate'];
    }
    if (isWarehouse) {
      return ['inventoryValue', 'inventoryTurnover', 'unitsSold'];
    }
    if (isAccountant) {
      return [
        'totalSales',
        'grossProfit',
        'netProfit',
        'inventoryValue',
        'supplierLiabilities',
        'discountCost',
      ];
    }
    if (isBranchManager) {
      return [
        'totalSales',
        'salesGrowth',
        'averageOrderValue',
        'unitsSold',
        'returnRate',
        'inventoryValue',
        'discountCost',
      ];
    }
    // Superadmin & General Manager: All 11 KPIs
    return [
      'totalSales',
      'grossProfit',
      'netProfit',
      'salesGrowth',
      'averageOrderValue',
      'unitsSold',
      'returnRate',
      'inventoryValue',
      'inventoryTurnover',
      'supplierLiabilities',
      'discountCost',
    ];
  })();

  const refreshIntervalProp = autoRefreshEnabled ? AUTO_REFRESH_INTERVAL_MS : false;

  return (
    <div className="space-y-6 pb-12" data-testid="dashboard-page">
      {/* Page Header */}
      <PageHeader
        title="İdarəetmə Paneli (Dashboard)"
        description={
          isCashier
            ? 'Kassa növbəsi, cari satışlar və kassa qalıqlarının operativ icmalı.'
            : isWarehouse
              ? 'Anbar ehtiyatları, dövriyyə sürəti, yolda olan transferlər və kritik stoklar.'
              : isAccountant
                ? 'Maliyyə balansı, gəlirlər, maya dəyəri (COGS), xərclər və təchizatçı öhdəlikləri.'
                : isBranchManager
                  ? 'Filial üzrə satış dinamikası, kassalar, azalan məhsullar və heyət fəaliyyəti.'
                  : 'BRAND HOUSE pərakəndə şəbəkəsinin konsolidasiya olunmuş icraçı göstəriciləri.'
        }
        breadcrumbs={[{ label: 'İdarəetmə Paneli' }]}
        badge={
          <div className="flex items-center gap-1.5">
            <Badge variant="neutral" size="sm">
              <Sparkles className="h-3 w-3 text-warning mr-1" />
              DEMO Rejimi
            </Badge>
            <Badge variant="outline" size="sm">
              <UserCheck className="h-3 w-3 mr-1" />
              {user?.roleName || 'Sistem Admini'}
            </Badge>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Tooltip content="Bütün KPI göstəricilərini CSV olaraq endir">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={handleExportDashboardSummary}
              >
                İcmalı İxrac Et
              </Button>
            </Tooltip>
          </div>
        }
      />

      {/* Sticky Filter Bar */}
      <DashboardFilterBar
        filterParams={filterParams}
        userCanAccessAll={userCanAccessAll}
        onBranchChange={setBranchId}
        onPresetChange={setDatePreset}
        onCustomDateChange={setCustomDateRange}
        onComparisonChange={setComparisonMode}
        onRefresh={handleManualRefresh}
        isRefreshing={isSummaryRefetching}
        lastUpdatedAt={summaryData?.lastUpdatedAt}
        autoRefreshEnabled={autoRefreshEnabled}
        onToggleAutoRefresh={handleToggleAutoRefresh}
      />

      {/* Dynamic Role-Based KPI Cards Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Əsas Göstəricilər (KPI)</span>
          <span>Dövr: {summaryData?.periodLabel || 'Yüklənir...'}</span>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5"
          data-testid="dashboard-kpi-grid"
        >
          {visibleKpiIds.map((kpiId) => (
            <DashboardKpiCard
              key={kpiId}
              metricId={kpiId}
              metric={summaryData?.metrics[kpiId]}
              comparisonLabel={summaryData?.comparisonLabel}
              isLoading={isSummaryLoading}
            />
          ))}
        </div>
      </div>

      {/* Dynamic Role-Based Widgets Grid */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Analitik Qrafiklər və Vidjetlər</span>
        </div>

        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          data-testid="dashboard-widgets-grid"
        >
          {/* 1. Cashier Role Widgets */}
          {isCashier && (
            <>
              <SalesTrendWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <CashRegistersTodayWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <PaymentMethodsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <TopSellingProductsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <RecentActivityFeedWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
            </>
          )}

          {/* 2. Warehouse Keeper Role Widgets */}
          {isWarehouse && (
            <>
              <LowStockAlertsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <SlowMovingStockWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <OpenOrdersTransfersWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <SalesBySectionTypeWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <RecentActivityFeedWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
            </>
          )}

          {/* 3. Accountant Role Widgets */}
          {isAccountant && (
            <>
              <ExpenseTrendWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <SalesTrendWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <PaymentMethodsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <CashRegistersTodayWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <OpenOrdersTransfersWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <RecentActivityFeedWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
            </>
          )}

          {/* 4. Branch Manager Role Widgets */}
          {isBranchManager && (
            <>
              <SalesTrendWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <SalesBySectionTypeWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <TopSellingProductsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <PaymentMethodsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <LowStockAlertsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <CashRegistersTodayWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <RecentActivityFeedWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
            </>
          )}

          {/* 5. Superadmin & General Manager (All 11 Widgets) */}
          {isSuperOrGeneral && (
            <>
              <SalesTrendWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <SalesByBranchWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <SalesBySectionTypeWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <TopSellingProductsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <PaymentMethodsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <LowStockAlertsWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <SlowMovingStockWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <ExpenseTrendWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <OpenOrdersTransfersWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <CashRegistersTodayWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
              <RecentActivityFeedWidget filterParams={filterParams} autoRefreshInterval={refreshIntervalProp} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
