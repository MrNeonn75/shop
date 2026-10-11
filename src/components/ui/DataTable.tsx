import { useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Eye,
  Check,
} from 'lucide-react';
import { Button } from './Button';
import { Pagination } from './Pagination';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { Checkbox } from './Checkbox';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '../../shared/utils/cn';
import { useExportCsv, CsvColumn } from '../../shared/hooks/useExportCsv';

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  // Server-side pagination controls
  pageCount?: number;
  currentPage?: number;
  pageSize?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  // Selection
  enableRowSelection?: boolean;
  onRowSelectionChange?: (selectedRows: TData[]) => void;
  // Export
  exportFilename?: string;
  csvColumns?: CsvColumn<TData>[];
  enableExport?: boolean;
  // Filter / view state storage key
  savedViewKey?: string;
  stickyHeader?: boolean;
  className?: string;
}

export function DataTable<TData extends object, TValue = unknown>({
  columns,
  data,
  isLoading = false,
  emptyTitle = 'Məlumat tapılmadı',
  emptyDescription = 'Cədvəldə göstəriləcək heç bir qeyd mövcud deyil.',
  pageCount,
  currentPage,
  pageSize = 10,
  totalItems,
  onPageChange,
  onPageSizeChange,
  enableRowSelection = false,
  onRowSelectionChange,
  exportFilename = 'cedvel_ixrac.csv',
  csvColumns,
  enableExport = true,
  savedViewKey,
  stickyHeader = true,
  className,
}: DataTableProps<TData, TValue>) {
  const isServerSidePagination = pageCount !== undefined && onPageChange !== undefined;

  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Column visibility with localStorage persistence if savedViewKey provided
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (savedViewKey && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`bh_table_col_${savedViewKey}`);
        if (saved) return JSON.parse(saved);
      } catch (err) {
        console.warn('Failed to parse saved column visibility:', err);
      }
    }
    return {};
  });

  const handleColumnVisibilityChange = (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (savedViewKey && typeof window !== 'undefined') {
        localStorage.setItem(`bh_table_col_${savedViewKey}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const { exportToCsv } = useExportCsv<TData>();

  // Optional selection column prepended if enableRowSelection is true
  const tableColumns: ColumnDef<TData, unknown>[] = enableRowSelection
    ? [
        {
          id: 'select',
          header: ({ table }) => (
            <div className="flex items-center justify-center">
              <Checkbox
                checked={
                  table.getIsAllPageRowsSelected()
                    ? true
                    : table.getIsSomePageRowsSelected()
                    ? 'indeterminate'
                    : false
                }
                onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
                aria-label="Hamısını seç"
              />
            </div>
          ),
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(val) => row.toggleSelected(!!val)}
                aria-label="Sətri seç"
              />
            </div>
          ),
          enableSorting: false,
          enableHiding: false,
          size: 40,
        },
        ...(columns as ColumnDef<TData, unknown>[]),
      ]
    : (columns as ColumnDef<TData, unknown>[]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
    manualPagination: isServerSidePagination,
    pageCount: isServerSidePagination ? pageCount : undefined,
    onSortingChange: setSorting,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: (updater) => {
      setRowSelection((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (onRowSelectionChange) {
          const selectedIndexes = Object.keys(next).map(Number);
          const selectedRows = selectedIndexes.map((idx) => data[idx]).filter(Boolean);
          onRowSelectionChange(selectedRows);
        }
        return next;
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: isServerSidePagination ? undefined : getPaginationRowModel(),
  });

  const handleExport = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
    const exportData = selectedRows.length > 0 ? selectedRows : data;
    exportToCsv(exportData, {
      filename: exportFilename,
      columns: csvColumns,
    });
  };

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className={cn('flex flex-col gap-3 w-full', className)}>
      {/* Table Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {enableRowSelection && selectedCount > 0 && (
            <span className="font-medium text-foreground bg-bh-accent/10 text-bh-accent px-2 py-0.5 rounded">
              {selectedCount} sətir seçildi
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Column Visibility Popover */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="outline" size="sm" leftIcon={<Eye className="h-3.5 w-3.5" />}>
                Sütunlar
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={4}
                className="z-50 w-48 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md animate-in fade-in-80"
              >
                <div className="text-xs font-semibold text-muted-foreground px-2 py-1 border-b border-border mb-1">
                  Görünən sütunlar
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {table
                    .getAllColumns()
                    .filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide())
                    .map((column) => {
                      const isVisible = column.getIsVisible();
                      return (
                        <div
                          key={column.id}
                          onClick={() => column.toggleVisibility(!isVisible)}
                          className="flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted cursor-pointer"
                        >
                          <span className="capitalize">{column.id}</span>
                          {isVisible && <Check className="h-3.5 w-3.5 text-foreground" />}
                        </div>
                      );
                    })}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* Export CSV button */}
          {enableExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              leftIcon={<Download className="h-3.5 w-3.5" />}
            >
              CSV İxrac
            </Button>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm border-collapse">
          <thead
            className={cn(
              'border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none',
              stickyHeader && 'sticky top-0 z-10 backdrop-blur-xs'
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            'flex items-center gap-1.5',
                            canSort && 'cursor-pointer hover:text-foreground'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-muted-foreground">
                              {isSorted === 'asc' ? (
                                <ArrowUp className="h-3.5 w-3.5 text-foreground" />
                              ) : isSorted === 'desc' ? (
                                <ArrowDown className="h-3.5 w-3.5 text-foreground" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-40" />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: pageSize || 5 }).map((_, i) => (
                <tr key={`skel-row-${i}`} className="animate-pulse">
                  {tableColumns.map((_col, j) => (
                    <td key={`skel-col-${j}`} className="px-4 py-3.5">
                      <Skeleton variant="text" className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length} className="p-8">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'transition-colors hover:bg-muted/40',
                    row.getIsSelected() && 'bg-muted/70 font-medium'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 whitespace-nowrap text-foreground">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <Pagination
        currentPage={isServerSidePagination ? currentPage || 1 : table.getState().pagination.pageIndex + 1}
        totalPages={isServerSidePagination ? pageCount || 1 : table.getPageCount() || 1}
        totalItems={totalItems !== undefined ? totalItems : data.length}
        pageSize={pageSize}
        onPageChange={(p) => {
          if (isServerSidePagination) {
            onPageChange?.(p);
          } else {
            table.setPageIndex(p - 1);
          }
        }}
        onPageSizeChange={onPageSizeChange || ((size) => table.setPageSize(size))}
      />
    </div>
  );
}

