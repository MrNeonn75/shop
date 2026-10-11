import React, { useState, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '../../../components/ui/PageHeader';
import { DataTable } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { Card, CardContent } from '../../../components/ui/Card';
import { SensitiveField } from '../../../components/ui/SensitiveField';
import { catalogRepository } from '../../../shared/adapters';
import { CatalogProduct, ProductStatus, StockState } from '../types/catalog';
import { formatMoney, formatQty, formatDate } from '../../../shared/utils/formatters';
import {
  Plus,
  Search,
  Barcode,
  LayoutGrid,
  List,
  Printer,
  Edit,
  Trash2,
  Tag,
  Download,
  CheckSquare,
} from 'lucide-react';
import { useToast } from '../../../components/ui';

export const ProductListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // View toggle: table vs grid
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Search input and ref for barcode scanner wedge
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters state from URL
  const selectedSection = searchParams.get('section') || 'all';
  const selectedType = searchParams.get('type') || 'all';
  const selectedCategory = searchParams.get('category') || 'all';
  const selectedBrand = searchParams.get('brand') || 'all';
  const selectedStatus = searchParams.get('status') || 'all';
  const selectedStockState = (searchParams.get('stock') as StockState) || 'all';
  const hasPromotionParam = searchParams.get('promo');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

  // Row selection state for bulk actions
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Bulk action modals
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<ProductStatus>('active');

  const [isBulkCategoryModalOpen, setIsBulkCategoryModalOpen] = useState(false);
  const [bulkTargetCategoryId, setBulkTargetCategoryId] = useState('');

  // Fetch filter dropdown options (categories & brands)
  const { data: categories = [] } = useQuery({
    queryKey: ['catalog-categories-list'],
    queryFn: () => catalogRepository.getCategories(),
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['catalog-brands-list'],
    queryFn: () => catalogRepository.getBrands(),
  });

  // Query products with active filters
  const { data, isLoading } = useQuery({
    queryKey: [
      'catalog-products',
      searchInput,
      selectedSection,
      selectedType,
      selectedCategory,
      selectedBrand,
      selectedStatus,
      selectedStockState,
      hasPromotionParam,
      page,
      pageSize,
    ],
    queryFn: () =>
      catalogRepository.getProducts({
        search: searchInput || undefined,
        section: selectedSection as CatalogProduct['section'] | 'all',
        type: selectedType as CatalogProduct['type'] | 'all',
        categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
        brandId: selectedBrand !== 'all' ? selectedBrand : undefined,
        status: selectedStatus as ProductStatus | 'all',
        stockState: selectedStockState,
        hasPromotion: hasPromotionParam ? hasPromotionParam === 'true' : undefined,
        page,
        pageSize,
      }),
  });

  // Bulk Mutations
  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ProductStatus }) =>
      catalogRepository.bulkUpdateStatus(ids, status),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setIsBulkStatusModalOpen(false);
      setSelectedProductIds([]);
      success(`${count} məhsulun statusu uğurla yeniləndi.`);
    },
    onError: (err: Error) => {
      toastError(err.message || 'Status yenilənməsində xəta baş verdi.');
    },
  });

  const bulkCategoryMutation = useMutation({
    mutationFn: ({
      ids,
      categoryId,
      categoryName,
    }: {
      ids: string[];
      categoryId: string;
      categoryName: string;
    }) => catalogRepository.bulkUpdateCategory(ids, categoryId, categoryName),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setIsBulkCategoryModalOpen(false);
      setSelectedProductIds([]);
      success(`${count} məhsulun kateqoriyası uğurla dəyişdirildi.`);
    },
    onError: (err: Error) => {
      toastError(err.message || 'Kateqoriya dəyişdirilməsində xəta baş verdi.');
    },
  });

  // Delete product mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogRepository.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      success('Məhsul silindi.');
    },
    onError: (err: Error) => {
      toastError(err.message || 'Xəta baş verdi.');
    },
  });

  // Helper to update URL params
  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === '' || v === 'all') {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    });
    setSearchParams(next);
  };

  // Keyboard wedge barcode scanner handler (terminates with Enter key)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const code = searchInput.trim();
      // If code looks like a scanned barcode (8-14 digits)
      if (/^\d{8,14}$/.test(code)) {
        const matched = data?.items.find(
          (p) => p.barcode === code || p.variants?.some((v) => v.barcode === code)
        );
        if (matched) {
          success(`Barkod skan edildi: ${matched.name}. Məhsul kartoçkasına keçid edilir.`);
          navigate(`/catalog/${matched.id}`);
          return;
        }
      }
      updateParams({ q: searchInput || null, page: '1' });
    }
  };

  // Bulk Print Action
  const handleBulkPrintLabels = () => {
    navigate('/catalog/labels', { state: { selectedProductIds } });
  };

  // Bulk Export Action
  const handleExportSelected = () => {
    const selected = (data?.items || []).filter((p) => selectedProductIds.includes(p.id));
    const itemsToExport = selected.length > 0 ? selected : data?.items || [];

    let csv = 'Ad,SKU,Barkod,Bölmə,Tip,Kateqoriya,Brend,Satış Qiyməti (AZN),Stok,Status\n';
    itemsToExport.forEach((p) => {
      csv += `"${p.name}","${p.sku}","${p.barcode}","${p.section}","${p.type}","${p.categoryName}","${p.brandName}",${(p.priceQapik / 100).toFixed(2)},${p.stockQty},"${p.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `brend_house_kataloq_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success(`${itemsToExport.length} məhsul CSV formatında ixrac edildi.`);
  };

  // Table Column Definitions
  const columns: ColumnDef<CatalogProduct, unknown>[] = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="rounded border-gray-300 text-primary focus:ring-primary"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate') === 'indeterminate'
            }
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="rounded border-gray-300 text-primary focus:ring-primary"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        accessorKey: 'image',
        header: 'Şəkil',
        cell: ({ row }) => {
          const img = row.original.images?.[0]?.url;
          return (
            <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center overflow-hidden border border-border">
              {img ? (
                <img src={img} alt={row.original.name} className="w-full h-full object-cover" />
              ) : (
                <Tag className="h-4 w-4 text-muted-foreground/50" />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'name',
        header: 'Məhsulun Adı və SKU',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => navigate(`/catalog/${row.original.id}`)}
              className="font-medium text-foreground hover:underline text-left"
            >
              {row.original.name}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span className="font-mono bg-muted/60 px-1 py-0.2 rounded">{row.original.sku}</span>
              {row.original.hasPromotion && (
                <Badge variant="warning" size="sm" className="text-[10px] py-0">
                  Aksiya
                </Badge>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'barcode',
        header: 'Barkod',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 font-mono text-xs">
            <Barcode className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{row.original.barcode}</span>
          </div>
        ),
      },
      {
        accessorKey: 'section',
        header: 'Bölmə & Tip',
        cell: ({ row }) => (
          <div className="text-xs">
            <div className="font-medium capitalize">{row.original.section}</div>
            <div className="text-muted-foreground capitalize">{row.original.type}</div>
          </div>
        ),
      },
      {
        accessorKey: 'categoryName',
        header: 'Kateqoriya',
        cell: ({ row }) => (
          <Badge variant="neutral" size="sm">
            {row.original.categoryName}
          </Badge>
        ),
      },
      {
        accessorKey: 'brandName',
        header: 'Brend',
        cell: ({ row }) => <span className="font-medium text-xs">{row.original.brandName}</span>,
      },
      {
        accessorKey: 'priceQapik',
        header: 'Satış Qiyməti',
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">
            {formatMoney(row.original.priceQapik)}
          </span>
        ),
      },
      {
        accessorKey: 'costPriceQapik',
        header: 'Maya Dəyəri',
        cell: ({ row }) => (
          <SensitiveField
            value={formatMoney(row.original.costPriceQapik)}
            permission="products.cost_price.view"
            className="text-xs text-muted-foreground"
          />
        ),
      },
      {
        accessorKey: 'stockQty',
        header: 'Ümumi Stok',
        cell: ({ row }) => {
          const qty = row.original.stockQty;
          const min = row.original.minStockLevel || 5;
          const variant = qty === 0 ? 'danger' : qty <= min ? 'warning' : 'success';
          return (
            <Badge variant={variant} hasDot size="sm">
              {formatQty(qty)} {row.original.unit || 'ədəd'}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'active' ? 'neutral' : 'warning'} size="sm">
            {row.original.status === 'active' ? 'Aktiv' : 'Dayandırılıb'}
          </Badge>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: 'Yenilənmə',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDate(row.original.updatedAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Etiket Çapı"
              onClick={() =>
                navigate('/catalog/labels', { state: { selectedProductIds: [row.original.id] } })
              }
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Redaktə Et"
              onClick={() => navigate(`/catalog/${row.original.id}`)}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-danger"
              title="Sil"
              onClick={() => {
                if (confirm(`"${row.original.name}" məhsulunu silmək istəyirsiniz?`)) {
                  deleteMutation.mutate(row.original.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [navigate, deleteMutation]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mərkəzi Məhsul Kataloqu"
        description="Geyim, ayaqqabı və aksesuarların vahid təsnifatı, qiymət idarəetməsi və ölçü/rəng matrisi."
        breadcrumbs={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Kataloq' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => navigate('/catalog/import')}
            >
              Kütləvi İdxal
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={() => navigate('/catalog/labels')}
            >
              Barkod Çapı
            </Button>
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => navigate('/catalog/new')}
            >
              Yeni Məhsul
            </Button>
          </div>
        }
      />

      {/* Top Filter & Search Controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input with wedge scanner hint */}
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Məhsul adı, SKU və ya barkod skaneri ilə daxil edin..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-9 pr-24"
              />
              <div className="absolute right-2 top-2 flex items-center gap-1">
                <Badge variant="neutral" size="sm" className="text-[10px] font-mono py-0">
                  Enter ↵
                </Badge>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="icon"
                className="h-9 w-9"
                onClick={() => setViewMode('table')}
                title="Cədvəl görünüşü"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                className="h-9 w-9"
                onClick={() => setViewMode('grid')}
                title="Kart şəbəkəsi görünüşü"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Hierarchical and Multi-attribute Filters Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-2 border-t border-border">
            {/* Section */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Bölmə</label>
              <Select
                value={selectedSection}
                onValueChange={(val: string) => updateParams({ section: val, page: '1' })}
                options={[
                  { value: 'all', label: 'Bütün Bölmələr' },
                  { value: 'kisi', label: 'Kişi' },
                  { value: 'qadin', label: 'Qadın' },
                  { value: 'usaq', label: 'Uşaq' },
                  { value: 'diger', label: 'Digər' },
                ]}
                className="mt-0.5 text-xs"
              />
            </div>

            {/* Type */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Tip</label>
              <Select
                value={selectedType}
                onValueChange={(val: string) => updateParams({ type: val, page: '1' })}
                options={[
                  { value: 'all', label: 'Bütün Tiplər' },
                  { value: 'geyim', label: 'Geyim' },
                  { value: 'ayaqqabi', label: 'Ayaqqabı' },
                  { value: 'aksesuar', label: 'Aksesuar' },
                ]}
                className="mt-0.5 text-xs"
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Kateqoriya</label>
              <Select
                value={selectedCategory}
                onValueChange={(val: string) => updateParams({ category: val, page: '1' })}
                options={[
                  { value: 'all', label: 'Bütün Kateqoriyalar' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
                className="mt-0.5 text-xs"
              />
            </div>

            {/* Brand */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Brend</label>
              <Select
                value={selectedBrand}
                onValueChange={(val: string) => updateParams({ brand: val, page: '1' })}
                options={[
                  { value: 'all', label: 'Bütün Brendlər' },
                  ...brands.map((b) => ({ value: b.id, label: b.name })),
                ]}
                className="mt-0.5 text-xs"
              />
            </div>

            {/* Stock State */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Stok Vəziyyəti</label>
              <Select
                value={selectedStockState}
                onValueChange={(val: string) => updateParams({ stock: val, page: '1' })}
                options={[
                  { value: 'all', label: 'Bütün Qalıqlar' },
                  { value: 'in_stock', label: 'Mövcud (Var)' },
                  { value: 'low_stock', label: 'Az Qalıb (Kritik)' },
                  { value: 'out_of_stock', label: 'Qurtarıb (Bitib)' },
                ]}
                className="mt-0.5 text-xs"
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Status</label>
              <Select
                value={selectedStatus}
                onValueChange={(val: string) => updateParams({ status: val, page: '1' })}
                options={[
                  { value: 'all', label: 'Hamısı' },
                  { value: 'active', label: 'Aktiv' },
                  { value: 'archived', label: 'Dayandırılıb' },
                ]}
                className="mt-0.5 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Floating Bar */}
      {selectedProductIds.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary text-primary-foreground shadow-md transition-all">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckSquare className="h-4 w-4" />
            <span>
              <strong>{selectedProductIds.length}</strong> məhsul seçilib
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              onClick={() => setIsBulkStatusModalOpen(true)}
            >
              Status Dəyiş
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              onClick={() => setIsBulkCategoryModalOpen(true)}
            >
              Kateqoriya Dəyiş
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              onClick={handleBulkPrintLabels}
            >
              Etiket Çapı
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              onClick={handleExportSelected}
            >
              İxrac Et (.csv)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-white/20"
              onClick={() => setSelectedProductIds([])}
            >
              Təmizlə
            </Button>
          </div>
        </div>
      )}

      {/* Main Content: Table or Grid */}
      {viewMode === 'table' ? (
        <DataTable
          columns={columns}
          data={data?.items || []}
          isLoading={isLoading}
          pageCount={data?.totalPages}
          currentPage={page}
          pageSize={pageSize}
          totalItems={data?.total}
          onPageChange={(p) => updateParams({ page: String(p) })}
          onPageSizeChange={(sz) => updateParams({ pageSize: String(sz), page: '1' })}
          enableRowSelection={true}
          onRowSelectionChange={(rows) => setSelectedProductIds(rows.map((r) => r.id))}
          exportFilename="brend_house_kataloq.csv"
        />
      ) : (
        /* Grid View */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {isLoading ? (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                Məhsullar yüklənir...
              </div>
            ) : data?.items.length === 0 ? (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                Seçilmiş meyarlar üzrə məhsul tapılmadı.
              </div>
            ) : (
              data?.items.map((prod) => (
                <Card
                  key={prod.id}
                  className="overflow-hidden group hover:border-primary/50 transition-colors flex flex-col justify-between"
                >
                  <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden border-b border-border">
                    {prod.images?.[0]?.url ? (
                      <img
                        src={prod.images[0].url}
                        alt={prod.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <Tag className="h-10 w-10 text-muted-foreground/30" />
                    )}
                    <div className="absolute top-2 left-2 flex gap-1">
                      <Badge variant="neutral" size="sm" className="bg-black/70 text-white border-0">
                        {prod.brandName}
                      </Badge>
                      {prod.hasPromotion && (
                        <Badge variant="warning" size="sm">
                          Aksiya
                        </Badge>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {prod.section} • {prod.categoryName}
                      </div>
                      <h4
                        className="font-semibold text-sm text-foreground line-clamp-1 hover:underline cursor-pointer mt-0.5"
                        onClick={() => navigate(`/catalog/${prod.id}`)}
                      >
                        {prod.name}
                      </h4>
                      <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                        {prod.sku}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <div className="font-bold text-sm text-foreground">
                        {formatMoney(prod.priceQapik)}
                      </div>
                      <Badge
                        variant={
                          prod.stockQty === 0
                            ? 'danger'
                            : prod.stockQty <= (prod.minStockLevel || 5)
                            ? 'warning'
                            : 'success'
                        }
                        size="sm"
                        hasDot
                      >
                        {formatQty(prod.stockQty)} {prod.unit}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bulk Status Modal */}
      {isBulkStatusModalOpen && (
        <Modal
          isOpen={isBulkStatusModalOpen}
          onClose={() => setIsBulkStatusModalOpen(false)}
          title="Seçilmiş Məhsulların Statusunu Dəyiş"
          description={`Seçilmiş ${selectedProductIds.length} məhsul üçün yeni status təyin edin.`}
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsBulkStatusModalOpen(false)}>
                İmtina
              </Button>
              <Button
                size="sm"
                isLoading={bulkStatusMutation.isPending}
                onClick={() =>
                  bulkStatusMutation.mutate({
                    ids: selectedProductIds,
                    status: bulkTargetStatus,
                  })
                }
              >
                Təsdiq Et
              </Button>
            </div>
          }
        >
          <div className="py-3">
            <label className="text-xs font-semibold text-muted-foreground">Yeni Status:</label>
            <Select
              value={bulkTargetStatus}
              onValueChange={(v: string) => setBulkTargetStatus(v as ProductStatus)}
              options={[
                { value: 'active', label: 'Aktiv (Satışa açıq)' },
                { value: 'archived', label: 'Dayandırılıb (Satışdan çıxarılıb)' },
              ]}
              className="mt-1"
            />
          </div>
        </Modal>
      )}

      {/* Bulk Category Modal */}
      {isBulkCategoryModalOpen && (
        <Modal
          isOpen={isBulkCategoryModalOpen}
          onClose={() => setIsBulkCategoryModalOpen(false)}
          title="Seçilmiş Məhsulların Kateqoriyasını Dəyiş"
          description={`Seçilmiş ${selectedProductIds.length} məhsul üçün yeni kateqoriya təyin edin.`}
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsBulkCategoryModalOpen(false)}>
                İmtina
              </Button>
              <Button
                size="sm"
                isLoading={bulkCategoryMutation.isPending}
                onClick={() => {
                  const targetCat = categories.find((c) => c.id === bulkTargetCategoryId);
                  if (!targetCat) {
                    toastError('Kateqoriya seçilməlidir.');
                    return;
                  }
                  bulkCategoryMutation.mutate({
                    ids: selectedProductIds,
                    categoryId: targetCat.id,
                    categoryName: targetCat.name,
                  });
                }}
              >
                Təsdiq Et
              </Button>
            </div>
          }
        >
          <div className="py-3">
            <label className="text-xs font-semibold text-muted-foreground">Yeni Kateqoriya:</label>
            <Select
              value={bulkTargetCategoryId}
              onValueChange={(v: string) => setBulkTargetCategoryId(v)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              className="mt-1"
            />
          </div>
        </Modal>
      )}
    </div>
  );
};
