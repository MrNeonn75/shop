import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '../../../components/ui/PageHeader';
import { DataTable } from '../../../components/ui/DataTable';
import { FilterBar, FilterBarValues } from '../../../components/ui/FilterBar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { productRepository } from '../../../shared/adapters';
import { Product } from '../../../shared/types/models';
import { formatMoney, formatQty } from '../../../shared/utils/formatters';
import { Plus } from 'lucide-react';
import { useToast } from '../../../components/ui';

export const ProductsPage: React.FC = () => {
  const { info } = useToast();
  const [filterValues, setFilterValues] = useState<FilterBarValues>({
    search: '',
    branchId: 'all',
    dateRange: { startDate: null, endDate: null },
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ['products', filterValues, page, pageSize],
    queryFn: () =>
      productRepository.getProducts({
        search: filterValues.search,
        branchId: filterValues.branchId,
        page,
        pageSize,
      }),
  });

  const columns: ColumnDef<Product, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Məhsulun Adı',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.sku}</span>
        </div>
      ),
    },
    {
      accessorKey: 'barcode',
      header: 'Barkod',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
    },
    {
      accessorKey: 'brand',
      header: 'Brend',
      cell: ({ row }) => (
        <Badge variant="neutral" size="sm">
          {row.original.brand}
        </Badge>
      ),
    },
    {
      accessorKey: 'section',
      header: 'Bölmə',
      cell: ({ row }) => <span className="capitalize">{row.original.section}</span>,
    },
    {
      accessorKey: 'category',
      header: 'Kateqoriya',
      cell: ({ row }) => <span className="capitalize">{row.original.category}</span>,
    },
    {
      accessorKey: 'priceQapik',
      header: 'Satış Qiyməti',
      cell: ({ row }) => (
        <span className="font-semibold">{formatMoney(row.original.priceQapik)}</span>
      ),
    },
    {
      accessorKey: 'stockQty',
      header: 'Stok Qalığı',
      cell: ({ row }) => (
        <Badge
          variant={row.original.stockQty > 20 ? 'success' : row.original.stockQty > 10 ? 'warning' : 'danger'}
          hasDot
          size="sm"
        >
          {formatQty(row.original.stockQty)} ədəd
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Məhsullar Kataloqu"
        description="Geyim, ayaqqabı və aksesuarların vahid verilənlər bazası (Adapter Pattern nümunəsi)."
        breadcrumbs={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Məhsullar' },
        ]}
        badge={
          <Badge variant="neutral" size="sm">
            MOCK ADAPTER
          </Badge>
        }
        actions={
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => info('Yeni məhsul modulu növbəti mərhələdə aktivləşdiriləcək.')}
          >
            Yeni Məhsul
          </Button>
        }
      />

      <FilterBar
        values={filterValues}
        onChange={(v) => {
          setFilterValues(v);
          setPage(1);
        }}
        onReset={() => {
          setFilterValues({
            search: '',
            branchId: 'all',
            dateRange: { startDate: null, endDate: null },
          });
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={data?.items || []}
        isLoading={isLoading}
        pageCount={data?.totalPages}
        currentPage={page}
        pageSize={pageSize}
        totalItems={data?.total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        enableRowSelection={true}
        exportFilename="brend_house_kataloq.csv"
      />
    </div>
  );
};

