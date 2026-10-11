import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney, formatQty } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/Tabs';

export interface SalesBySectionTypeWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const SalesBySectionTypeWidget: React.FC<SalesBySectionTypeWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const [activeTab, setActiveTab] = useState<'section' | 'type'>('section');
  const { exportToCsv } = useExportCsv<{
    labelAz: string;
    salesQapik: number;
    unitsSold: number;
    sharePercentage: number;
  }>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'sectionTypeSales', filterParams],
    queryFn: () => dashboardRepository.getSectionTypeSales(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    const items = activeTab === 'section' ? data.sections : data.types;
    exportToCsv(items, {
      filename: `brand_house_bolme_nov_satis_${filterParams.startDate}_${filterParams.endDate}.csv`,
      columns: [
        { header: 'Kateqoriya / Ad', accessor: 'labelAz' },
        { header: 'Satış (AZN)', accessor: (row) => (row.salesQapik / 100).toFixed(2) },
        { header: 'Satılan Ədəd', accessor: (row) => row.unitsSold },
        { header: 'Pay (%)', accessor: (row) => `${row.sharePercentage}%` },
      ],
    });
  };

  const sections = data?.sections || [];
  const types = data?.types || [];

  return (
    <WidgetContainer
      title="Bölmələr və Məhsul Növləri üzrə Bölgü"
      subtitle="Kişi, Qadın, Uşaq bölmələri və Geyim/Ayaqqabı/Aksesuar satışı"
      infoTooltip="Məhsul seqmentləri üzrə xalis satış payı və fiziki ədəd satış dinamikası."
      drillDownUrl="/products"
      drillDownLabel="Kataloqa Keçid"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-sales-by-section-type"
      headerActions={
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'section' | 'type')}>
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="section" className="text-xs px-2.5 py-1">
              Bölmələr
            </TabsTrigger>
            <TabsTrigger value="type" className="text-xs px-2.5 py-1">
              Növlər
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
      className="col-span-1"
    >
      <div className="space-y-3.5 py-1">
        {activeTab === 'section' ? (
          sections.map((sec) => (
            <div key={sec.section} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{sec.labelAz}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-[11px]">{formatQty(sec.unitsSold)} əd.</span>
                  <span className="font-semibold text-foreground">{formatMoney(sec.salesQapik, true)}</span>
                  <span className="text-xs font-bold text-foreground w-10 text-right">{sec.sharePercentage}%</span>
                </div>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full transition-all duration-500"
                  style={{ width: `${sec.sharePercentage}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          types.map((tp) => (
            <div key={tp.type} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{tp.labelAz}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-[11px]">{formatQty(tp.unitsSold)} əd.</span>
                  <span className="font-semibold text-foreground">{formatMoney(tp.salesQapik, true)}</span>
                  <span className="text-xs font-bold text-foreground w-10 text-right">{tp.sharePercentage}%</span>
                </div>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full transition-all duration-500"
                  style={{ width: `${tp.sharePercentage}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  );
};
