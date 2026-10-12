import { ReportBuilderField, ReportDatasetId, CustomReportConfig, ReportFilterState } from '../types';
import { PermissionString } from '../../../shared/utils/permissions';

/**
 * BRAND HOUSE ERP — Report Builder Whitelist & Query Engine
 *
 * Provides a strictly governed whitelist of dimensions and measures per dataset.
 * Enforces field-level access controls so unauthorized roles (e.g. Kassir)
 * cannot select cost, margin, or salary measures.
 *
 * NO raw SQL is ever allowed from client input.
 */

export const DATASET_METADATA: Record<
  ReportDatasetId,
  {
    id: ReportDatasetId;
    titleAz: string;
    descriptionAz: string;
    fields: ReportBuilderField[];
  }
> = {
  sales_lines: {
    id: 'sales_lines',
    titleAz: 'Satış Sətirləri (POS & E-ticarət)',
    descriptionAz: 'Hər bir çekdə satılmış ayrı-ayrı SKU-lar, endirimlər və ödənişlər.',
    fields: [
      // Dimensions
      { id: 'branchName', label: 'Filial', type: 'dimension', dataType: 'string' },
      { id: 'date', label: 'Tarix (Gün)', type: 'dimension', dataType: 'date' },
      { id: 'categoryName', label: 'Kateqoriya', type: 'dimension', dataType: 'string' },
      { id: 'brandName', label: 'Brend', type: 'dimension', dataType: 'string' },
      { id: 'productName', label: 'Məhsul Adı', type: 'dimension', dataType: 'string' },
      { id: 'paymentMethod', label: 'Ödəniş Üsulu', type: 'dimension', dataType: 'string' },
      { id: 'cashierName', label: 'Kassir', type: 'dimension', dataType: 'string' },
      { id: 'customerTier', label: 'Müştəri Dərəcəsi', type: 'dimension', dataType: 'string' },

      // Measures
      { id: 'quantitySold', label: 'Satılmış Ədəd Sayı', type: 'measure', dataType: 'number' },
      { id: 'grossRevenueAzn', label: 'Brutto Gəlir (AZN)', type: 'measure', dataType: 'money' },
      { id: 'discountAzn', label: 'Tətbiq Edilən Endirim (AZN)', type: 'measure', dataType: 'money' },
      { id: 'netRevenueAzn', label: 'Xalis Gəlir (AZN)', type: 'measure', dataType: 'money' },
      {
        id: 'cogsAzn',
        label: 'Satış Mayası (COGS - Həssas)',
        type: 'measure',
        dataType: 'money',
        requiredPermission: 'products.cost_price.view',
        isSensitive: true,
      },
      {
        id: 'grossProfitAzn',
        label: 'Ümumi Mənfəət (Marja - Həssas)',
        type: 'measure',
        dataType: 'money',
        requiredPermission: 'products.cost_price.view',
        isSensitive: true,
      },
    ],
  },

  stock_movements: {
    id: 'stock_movements',
    titleAz: 'Anbar Hərəkətləri və Qalıqlar',
    descriptionAz: 'Mədaxil, yerdəyişmə, sayım düzəlişləri və dövriyyə qalıqları.',
    fields: [
      { id: 'branchName', label: 'Filial / Anbar', type: 'dimension', dataType: 'string' },
      { id: 'operationType', label: 'Hərəkət Növü', type: 'dimension', dataType: 'string' },
      { id: 'productName', label: 'Məhsul', type: 'dimension', dataType: 'string' },
      { id: 'categoryName', label: 'Kateqoriya', type: 'dimension', dataType: 'string' },
      { id: 'date', label: 'Tarix', type: 'dimension', dataType: 'date' },
      { id: 'quantity', label: 'Hərəkət Sayı (Ədəd)', type: 'measure', dataType: 'number' },
      {
        id: 'totalCostAzn',
        label: 'Hərəkətin Maya Dəyəri (Həssas)',
        type: 'measure',
        dataType: 'money',
        requiredPermission: 'products.cost_price.view',
        isSensitive: true,
      },
    ],
  },

  purchase_lines: {
    id: 'purchase_lines',
    titleAz: 'Satınalma Qaimələri və İdxal',
    descriptionAz: 'Təchizatçılardan qəbul olunmuş mallar və fakturalar.',
    fields: [
      { id: 'supplierName', label: 'Təchizatçı', type: 'dimension', dataType: 'string' },
      { id: 'branchName', label: 'Təhvil Filialı', type: 'dimension', dataType: 'string' },
      { id: 'date', label: 'Mədaxil Tarixi', type: 'dimension', dataType: 'date' },
      { id: 'productName', label: 'Məhsul', type: 'dimension', dataType: 'string' },
      { id: 'orderedUnits', label: 'Sifariş Sayı', type: 'measure', dataType: 'number' },
      { id: 'receivedUnits', label: 'Qəbul Sayı', type: 'measure', dataType: 'number' },
      {
        id: 'invoiceAmountAzn',
        label: 'Faktura Məbləği (Həssas)',
        type: 'measure',
        dataType: 'money',
        requiredPermission: 'procurement.supplier_price.view',
        isSensitive: true,
      },
    ],
  },

  expense_lines: {
    id: 'expense_lines',
    titleAz: 'Əməliyyat Xərcləri (OPEX)',
    descriptionAz: 'İcarə, kommunal, əməkhaqqı, marketinq və digər təsdiqlənmiş xərclər.',
    fields: [
      { id: 'categoryName', label: 'Xərc Maddəsi', type: 'dimension', dataType: 'string' },
      { id: 'branchName', label: 'Filial', type: 'dimension', dataType: 'string' },
      { id: 'paymentAccount', label: 'Hesab / Kassa', type: 'dimension', dataType: 'string' },
      { id: 'date', label: 'Ödəniş Tarixi', type: 'dimension', dataType: 'date' },
      { id: 'amountAzn', label: 'Xərc Məbləği (AZN)', type: 'measure', dataType: 'money' },
      {
        id: 'salaryShareAzn',
        label: 'Əməkhaqqı Payı (Həssas)',
        type: 'measure',
        dataType: 'money',
        requiredPermission: 'hr.salary.view',
        isSensitive: true,
      },
    ],
  },
};

/**
 * Filter fields whitelist by user permissions
 */
export function getPermittedFieldsForDataset(
  datasetId: ReportDatasetId,
  userPermissions: PermissionString[]
): ReportBuilderField[] {
  const metadata = DATASET_METADATA[datasetId];
  if (!metadata) return [];

  const isSuperadmin = userPermissions.includes('*') || userPermissions.includes('superadmin');

  return metadata.fields.filter((field) => {
    if (!field.requiredPermission) return true;
    if (isSuperadmin) return true;
    return userPermissions.includes(field.requiredPermission);
  });
}

/**
 * Deterministic aggregation mock generator for custom report execution
 */
export function executeCustomReportQuery(
  config: CustomReportConfig,
  permittedFields: ReportBuilderField[]
): {
  columns: Array<{ key: string; label: string; dataType: string }>;
  rows: Array<Record<string, string | number>>;
} {
  const validFieldIds = new Set(permittedFields.map((f) => f.id));

  // Build selected column headers
  const columns = [
    ...config.selectedDimensions.filter((id) => validFieldIds.has(id)).map((id) => {
      const f = permittedFields.find((pf) => pf.id === id)!;
      return { key: f.id, label: f.label, dataType: f.dataType };
    }),
    ...config.selectedMeasures.filter((id) => validFieldIds.has(id)).map((id) => {
      const f = permittedFields.find((pf) => pf.id === id)!;
      return { key: f.id, label: f.label, dataType: f.dataType };
    }),
  ];

  // Seed realistic deterministic aggregation rows
  const branchPool = ['Nizami (Baş Filial)', 'Mall 28 Filialı', 'Gənclik Mall Filialı', 'Dəniz Mall Filialı'];
  const categoryPool = ['Kişi Geyimi', 'Qadın Geyimi', 'Ayaqqabı', 'Aksessuarlar'];
  const brandPool = ['Massimo Dutti', 'Zara Man', 'Baku Collection', 'Emporium'];

  const rows: Array<Record<string, string | number>> = [];
  const rowCount = 6;

  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, string | number> = {};

    // Populate dimensions
    config.selectedDimensions.forEach((dimId) => {
      if (!validFieldIds.has(dimId)) return;
      if (dimId === 'branchName') row[dimId] = branchPool[i % branchPool.length];
      else if (dimId === 'categoryName') row[dimId] = categoryPool[i % categoryPool.length];
      else if (dimId === 'brandName') row[dimId] = brandPool[i % brandPool.length];
      else if (dimId === 'date') row[dimId] = `2026-03-${String(10 + i).padStart(2, '0')}`;
      else if (dimId === 'paymentMethod') row[dimId] = i % 2 === 0 ? 'Bank Kartı (POS)' : 'Nağd Kassa';
      else if (dimId === 'cashierName') row[dimId] = `Kassir #${(i % 3) + 1}`;
      else row[dimId] = `Göstərici ${i + 1}`;
    });

    // Populate measures
    config.selectedMeasures.forEach((measureId) => {
      if (!validFieldIds.has(measureId)) return;
      if (measureId === 'quantitySold' || measureId === 'quantity') row[measureId] = 25 + i * 14;
      else if (measureId === 'grossRevenueAzn' || measureId === 'netRevenueAzn') row[measureId] = 1250 + i * 480;
      else if (measureId === 'discountAzn') row[measureId] = 95 + i * 35;
      else if (measureId === 'cogsAzn' || measureId === 'totalCostAzn') row[measureId] = 620 + i * 240;
      else if (measureId === 'grossProfitAzn') row[measureId] = 535 + i * 205;
      else if (measureId === 'amountAzn') row[measureId] = 450 + i * 120;
      else row[measureId] = 100 + i * 50;
    });

    rows.push(row);
  }

  // Sort if requested
  if (config.sortBy && validFieldIds.has(config.sortBy.field)) {
    const { field, direction } = config.sortBy;
    rows.sort((a, b) => {
      if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
      if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  return { columns, rows };
}

/**
 * Serialize filters into standard URL search params
 */
export function serializeReportFiltersToUrl(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      return;
    }
    if (Array.isArray(value)) {
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

/**
 * Parse filters from URL search params
 */
export function parseReportFiltersFromUrl(searchString: string): Partial<ReportFilterState> {
  const params = new URLSearchParams(searchString);
  const result: Partial<ReportFilterState> = {};

  params.forEach((value, key) => {
    if (key === 'branchIds' || key === 'categoryIds' || key === 'brandIds' || key === 'supplierIds' || key === 'cashierIds') {
      (result as Record<string, unknown>)[key] = value.split(',').filter(Boolean);
    } else if (key === 'thresholdDays') {
      result.thresholdDays = parseInt(value, 10) || 90;
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  });

  return result;
}

/**
 * Builds a full ReportQueryResult for a custom report configuration
 */
export function buildCustomReportResult(
  config: CustomReportConfig,
  _filters: import('../types').ReportFilterState,
  userPermissions: PermissionString[] = [
    'reports.standard.view',
    'products.cost_price.view',
    'finance.report.view',
    'hr.salary.view',
  ]
): import('../types').ReportQueryResult {
  const permittedFields = getPermittedFieldsForDataset(config.dataset, userPermissions);
  const { rows } = executeCustomReportQuery(config, permittedFields);

  const kpis: import('../types').ReportKpiResult[] = [
    {
      id: 'kpi-custom-rows',
      label: 'Sətir Sayı',
      formattedValue: `${rows.length} sətir`,
      rawValue: rows.length,
      unit: 'qty',
      isComputable: true,
    },
  ];

  return {
    reportId: config.id,
    reportTitle: config.title,
    generatedAt: '2026-10-12 01:25:00 (Asia/Baku)',
    isDemo: true,
    kpis,
    tableRows: rows,
    chartData: rows.slice(0, 10).map((r, idx) => ({
      label: r[config.selectedDimensions[0]] || `Element ${idx + 1}`,
      value: r[config.selectedMeasures[0]] || 0,
    })),
    totalCount: rows.length,
  };
}
