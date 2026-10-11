import { useCallback } from 'react';

export interface CsvColumn<T> {
  header: string;
  accessor: keyof T | ((row: T) => string | number | null | undefined);
}

export interface UseExportCsvOptions<T> {
  filename?: string;
  columns?: CsvColumn<T>[];
}

/**
 * Hook to export data tables to CSV with UTF-8 BOM encoding
 * for 100% accurate Azerbaijani character display in Microsoft Excel.
 */
export function useExportCsv<T extends object = Record<string, unknown>>() {
  const exportToCsv = useCallback(
    (data: T[], options?: UseExportCsvOptions<T>) => {
      if (!data || data.length === 0) {
        return;
      }

      const filename = options?.filename || `export_${new Date().toISOString().slice(0, 10)}.csv`;
      let headers: string[] = [];
      let extractRow: (row: T) => (string | number)[];

      if (options?.columns && options.columns.length > 0) {
        headers = options.columns.map((col) => col.header);
        extractRow = (row: T) =>
          options.columns!.map((col) => {
            if (typeof col.accessor === 'function') {
              const val = col.accessor(row);
              return val === null || val === undefined ? '' : val;
            }
            const val = (row as Record<string, unknown>)[col.accessor as string];
            return val === null || val === undefined ? '' : String(val);
          });
      } else {
        headers = Object.keys(data[0] as Record<string, unknown>);
        extractRow = (row: T) =>
          headers.map((key) => String((row as Record<string, unknown>)[key] ?? ''));
      }

      const escapeCell = (cell: string | number) => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvLines = [
        headers.map(escapeCell).join(','),
        ...data.map((row) => extractRow(row).map(escapeCell).join(',')),
      ];

      // UTF-8 BOM prefix for correct Excel rendering of Azerbaijani letters (ə, ı, ö, ü, ç, ş, ğ, İ)
      const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    []
  );

  return { exportToCsv };
}
