import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, TopProductItem, TopCategoryItem } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney, formatQty } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/Tabs';
import { Badge } from '../../../../components/ui/Badge';

export interface TopSellingProductsWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const TopSellingProductsWidget: React.FC<TopSellingProductsWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  const { exportToCsv: exportProductsCsv } = useExportCsv<TopProductItem>();
  const { exportToCsv: exportCategoriesCsv } = useExportCsv<TopCategoryItem>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'topSellingProducts', filterParams],
    queryFn: () => dashboardRepository.getTopSellingProducts(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    if (activeTab === 'products') {
      exportProductsCsv(data.products, {
        filename: `brand_house_top_mehsullar_${filterParams.startDate}_${filterParams.endDate}.csv`,
        columns: [
          { header: 'Məhsul Adı', accessor: 'name' },
          { header: 'SKU', accessor: 'sku' },
          { header: 'Brend', accessor: 'brand' },
          { header: 'Kateqoriya', accessor: 'categoryNameAz' },
          { header: 'Satılan Ədəd', accessor: 'unitsSold' },
          { header: 'Gəlir (AZN)', accessor: (row) => (row.revenueQapik / 100).toFixed(2) },
          { header: 'Pay (%)', accessor: (row) => `${row.sharePercentage}%` },
        ],
      });
    } else {
      exportCategoriesCsv(data.categories, {
        filename: `brand_house_top_kateqoriyalar_${filterParams.startDate}_${filterParams.endDate}.csv`,
        columns: [
          { header: 'Kateqoriya', accessor: 'categoryNameAz' },
          { header: 'Satılan Ədəd', accessor: 'unitsSold' },
          { header: 'Gəlir (AZN)', accessor: (row) => (row.revenueQapik / 100).toFixed(2) },
          { header: 'Pay (%)', accessor: (row) => `${row.sharePercentage}%` },
        ],
      });
    }
  };

  const products = data?.products || [];
  const categories = data?.categories || [];

  return (
    <WidgetContainer
      title="Ən Çox Satılan Məhsullar və Kateqoriyalar"
      subtitle="Top 10 gəlir gətirən modellər və kateqoriya liderləri"
      infoTooltip="Seçilmiş dövrdə dövriyyə və fiziki satış sayına görə ən yüksək nəticə göstərən məhsul və kateqoriyalar."
      drillDownUrl="/products"
      drillDownLabel="Bütün Məhsullara Bax"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data || (products.length === 0 && categories.length === 0)}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-top-products"
      headerActions={
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'products' | 'categories')}>
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="products" className="text-xs px-2.5 py-1">
              Top Məhsullar
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-xs px-2.5 py-1">
              Kateqoriyalar
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
      className="col-span-1 lg:col-span-2"
    >
      <div className="overflow-x-auto max-h-72">
        {activeTab === 'products' ? (
          <table className="w-full text-xs text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-2 w-8 text-center">#</th>
                <th className="p-2">Məhsul və Brend</th>
                <th className="p-2">SKU</th>
                <th className="p-2 text-right">Satılan Ədəd</th>
                <th className="p-2 text-right">Gəlir (AZN)</th>
                <th className="p-2 text-right">Pay %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((item, idx) => (
                <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                  <td className="p-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                  <td className="p-2">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="text-[10px] text-muted-foreground">{item.brand} • {item.categoryNameAz}</div>
                  </td>
                  <td className="p-2 font-mono text-[11px] text-muted-foreground">{item.sku}</td>
                  <td className="p-2 text-right font-medium">{formatQty(item.unitsSold)}</td>
                  <td className="p-2 text-right font-semibold">{formatMoney(item.revenueQapik, true)}</td>
                  <td className="p-2 text-right">
                    <Badge variant="neutral" size="sm">{item.sharePercentage}%</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-2 w-8 text-center">#</th>
                <th className="p-2">Kateqoriya</th>
                <th className="p-2 text-right">Satılan Ədəd</th>
                <th className="p-2 text-right">Gəlir (AZN)</th>
                <th className="p-2 text-right">Pay %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categories.map((cat, idx) => (
                <tr key={cat.category} className="hover:bg-muted/40 transition-colors">
                  <td className="p-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                  <td className="p-2 font-medium text-foreground">{cat.categoryNameAz}</td>
                  <td className="p-2 text-right font-medium">{formatQty(cat.unitsSold)}</td>
                  <td className="p-2 text-right font-semibold">{formatMoney(cat.revenueQapik, true)}</td>
                  <td className="p-2 text-right">
                    <Badge variant="neutral" size="sm">{cat.sharePercentage}%</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </WidgetContainer>
  );
};
