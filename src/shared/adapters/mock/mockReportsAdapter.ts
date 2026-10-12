import { ReportsRepository } from '../types';
import {
  ReportDefinition,
  ReportFilterState,
  ReportQueryResult,
  CustomReportConfig,
  ScheduledReportDelivery,
  ReportKpiResult,
} from '../../../features/reports/types';
import { STANDARD_REPORTS } from '../../../features/reports/constants/reportRegistry';
import { buildCustomReportResult } from '../../../features/reports/utils/reportBuilderEngine';

interface AsyncJob {
  jobId: string;
  reportId: string;
  createdAt: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progressPercent: number;
}

export class MockReportsAdapter implements ReportsRepository {
  private asyncJobs: Map<string, AsyncJob> = new Map();
  private scheduledReports: ScheduledReportDelivery[] = [
    {
      id: 'sched-1',
      reportId: 'sales-daily',
      reportTitle: 'Gündəlik Satış və Kassa Xülasəsi',
      frequency: 'daily',
      channel: 'email',
      recipients: ['direktor@brandhouse.az', 'maliyye@brandhouse.az'],
      format: 'pdf',
      providerStatus: 'Konfiqurasiya olunmayıb',
      lastSentAt: '2026-10-11 21:00 (Asia/Baku)',
      isActive: true,
    },
    {
      id: 'sched-2',
      reportId: 'inventory-dead-stock',
      reportTitle: 'Həftəlik Kritik Qalıq və Ölü Stok Hesabatı',
      frequency: 'weekly',
      channel: 'telegram',
      recipients: ['anbar.mudiri@brandhouse.az'],
      format: 'xlsx',
      providerStatus: 'Konfiqurasiya olunmayıb',
      lastSentAt: '2026-10-05 09:00 (Asia/Baku)',
      isActive: true,
    },
    {
      id: 'sched-3',
      reportId: 'finance-branch-pnl-comparison',
      reportTitle: 'Aylıq Filiallar Üzrə P&L Müqayisəsi',
      frequency: 'monthly',
      channel: 'email',
      recipients: ['rehbarlik@brandhouse.az'],
      format: 'pdf',
      providerStatus: 'Konfiqurasiya olunmayıb',
      lastSentAt: '2026-10-01 10:00 (Asia/Baku)',
      isActive: false,
    },
  ];

  private findReport(reportId: string): ReportDefinition | undefined {
    const normalized = reportId.replace(/_/g, '-');
    return STANDARD_REPORTS.find(
      (r: ReportDefinition) =>
        r.id === reportId ||
        r.id === normalized ||
        r.id.replace(/-/g, '_') === reportId.replace(/-/g, '_')
    );
  }

  async getReportsCatalog(): Promise<ReportDefinition[]> {
    return [...STANDARD_REPORTS];
  }

  async getReportById(reportId: string): Promise<ReportDefinition | null> {
    const report = this.findReport(reportId);
    return report ? { ...report } : null;
  }

  async executeReport(reportId: string, filters: ReportFilterState): Promise<ReportQueryResult> {
    const report = this.findReport(reportId);
    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    return this.generateMockReportData(report, filters);
  }

  async executeCustomReport(
    config: CustomReportConfig,
    filters: ReportFilterState
  ): Promise<ReportQueryResult> {
    return buildCustomReportResult(config, filters);
  }

  async startAsyncReportGeneration(
    reportId: string,
    _filters: ReportFilterState
  ): Promise<{ jobId: string; estimatedSeconds: number }> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.asyncJobs.set(jobId, {
      jobId,
      reportId,
      createdAt: Date.now(),
      status: 'processing',
      progressPercent: 25,
    });
    return { jobId, estimatedSeconds: 3 };
  }

  async checkAsyncReportStatus(jobId: string): Promise<{
    jobId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progressPercent: number;
    downloadUrl?: string;
    error?: string;
  }> {
    const job = this.asyncJobs.get(jobId);
    if (!job) {
      return {
        jobId,
        status: 'failed',
        progressPercent: 0,
        error: 'Hesabat generasiya tapşırığı tapılmadı.',
      };
    }

    const elapsed = Date.now() - job.createdAt;
    if (elapsed > 2000) {
      job.status = 'completed';
      job.progressPercent = 100;
      return {
        jobId,
        status: 'completed',
        progressPercent: 100,
        downloadUrl: `data:text/csv;charset=utf-8,ID,Tarix,Meblag\n1,2026-10-11,1540.50`,
      };
    } else if (elapsed > 1000) {
      job.progressPercent = 70;
      return {
        jobId,
        status: 'processing',
        progressPercent: 70,
      };
    }

    return {
      jobId,
      status: 'processing',
      progressPercent: 35,
    };
  }

  async exportReport(
    reportId: string,
    filters: ReportFilterState,
    format: 'csv' | 'xlsx' | 'pdf'
  ): Promise<{ dataUri: string; filename: string }> {
    const result = await this.executeReport(reportId, filters);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${reportId}_${dateStr}.${format}`;

    const reportDef = STANDARD_REPORTS.find((r: ReportDefinition) => r.id === reportId);
    const columns = reportDef?.columns || [];

    if (format === 'csv') {
      const headers = columns.map((c) => `"${c.label}"`).join(',');
      const rows = result.tableRows
        .map((row: Record<string, unknown>) =>
          columns
            .map((c) => {
              const val = row[c.key];
              return val !== undefined && val !== null ? `"${String(val).replace(/"/g, '""')}"` : '""';
            })
            .join(',')
        )
        .join('\n');
      const csvContent = `${headers}\n${rows}`;
      const dataUri = `data:text/csv;charset=utf-8;base64,${btoa(unescape(encodeURIComponent(csvContent)))}`;
      return { dataUri, filename };
    }

    const dummyContent = `[DEMO EXPORT - ${result.reportTitle} - Format: ${format.toUpperCase()}]\n${result.totalCount} sətir ixrac edildi.`;
    const mime = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    const dataUri = `data:${mime};base64,${btoa(unescape(encodeURIComponent(dummyContent)))}`;
    return { dataUri, filename };
  }

  async getScheduledReports(): Promise<ScheduledReportDelivery[]> {
    return [...this.scheduledReports];
  }

  async createScheduledReport(
    payload: Partial<ScheduledReportDelivery>
  ): Promise<ScheduledReportDelivery> {
    const newItem: ScheduledReportDelivery = {
      id: `sched-${Date.now()}`,
      reportId: payload.reportId || 'sales_daily',
      reportTitle: payload.reportTitle || 'Gündəlik Satış Hesabatı',
      frequency: payload.frequency || 'weekly',
      channel: payload.channel || 'email',
      recipients: payload.recipients || [],
      format: payload.format || 'pdf',
      providerStatus: 'Konfiqurasiya olunmayıb',
      isActive: payload.isActive !== undefined ? payload.isActive : true,
    };
    this.scheduledReports.push(newItem);
    return { ...newItem };
  }

  async updateScheduledReport(
    id: string,
    payload: Partial<ScheduledReportDelivery>
  ): Promise<ScheduledReportDelivery> {
    const idx = this.scheduledReports.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error(`Scheduled report ${id} not found`);
    }
    this.scheduledReports[idx] = {
      ...this.scheduledReports[idx],
      ...payload,
    };
    return { ...this.scheduledReports[idx] };
  }

  async deleteScheduledReport(id: string): Promise<boolean> {
    const prevLen = this.scheduledReports.length;
    this.scheduledReports = this.scheduledReports.filter((s) => s.id !== id);
    return this.scheduledReports.length < prevLen;
  }

  private generateMockReportData(
    report: ReportDefinition,
    filters: ReportFilterState
  ): ReportQueryResult {
    const generatedAt = '2026-10-12 01:25:00 (Asia/Baku)';
    const activeCogsMethod = 'Çəkili Orta Maya (Weighted Average)';

    const branchNames: Record<string, string> = {
      b1: 'Baş Filial (Nizami)',
      b2: 'Gənclik Mall Filialı',
      b3: '28 Mall Filialı',
      b4: 'Sumqayıt Filialı',
    };

    const targetBranch = filters.branchIds && filters.branchIds.length === 1
      ? branchNames[filters.branchIds[0]] || 'Seçilmiş Filial'
      : 'Bütün Filiallar';

    switch (report.id) {
      case 'sales_daily':
      case 'sales_weekly':
      case 'sales_monthly': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-1', label: 'Xalis Satış Həcmi', formattedValue: '38,450.00 ₼', rawValue: 38450, unit: 'azn', changePercent: 6.8, isComputable: true, kpiDefId: 'kpi_net_sales' },
          { id: 'kpi-2', label: 'Faktiki Kassa Mədaxili', formattedValue: '38,100.00 ₼', rawValue: 38100, unit: 'azn', isComputable: true, kpiDefId: 'kpi_cash_received' },
          { id: 'kpi-3', label: 'Satılan Malın Maya Dəyəri', formattedValue: '21,150.00 ₼', rawValue: 21150, unit: 'azn', isComputable: true, kpiDefId: 'kpi_cogs' },
          { id: 'kpi-4', label: 'Ümumi Mənfəət', formattedValue: '17,300.00 ₼ (45.0%)', rawValue: 17300, unit: 'azn', changePercent: 8.4, isComputable: true, kpiDefId: 'kpi_gross_profit' },
          { id: 'kpi-5', label: 'Orta Qəbz Məbləği (ATV)', formattedValue: '64.50 ₼', rawValue: 64.5, unit: 'azn', isComputable: true, kpiDefId: 'kpi_atv' },
          { id: 'kpi-6', label: 'Qəbzdə Ədəd Sayı (UPT)', formattedValue: '2.4 ədəd', rawValue: 2.4, unit: 'qty', isComputable: true, kpiDefId: 'kpi_upt' },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          activeCogsMethod,
          kpis,
          chartData: [
            { label: '01 Okt', net_sales: 4200, gross_profit: 1900 },
            { label: '03 Okt', net_sales: 5100, gross_profit: 2300 },
            { label: '05 Okt', net_sales: 6800, gross_profit: 3100 },
            { label: '07 Okt', net_sales: 4900, gross_profit: 2150 },
            { label: '09 Okt', net_sales: 8200, gross_profit: 3750 },
            { label: '11 Okt', net_sales: 9250, gross_profit: 4100 },
          ],
          tableRows: [
            { date: '2026-10-11', branchName: 'Baş Filial (Nizami)', receiptCount: 142, unitsSold: 340, grossSales: '15,200.00 ₼', discountAmount: '950.00 ₼', returnAmount: '350.00 ₼', netSales: '13,900.00 ₼', cogs: '7,645.00 ₼', grossProfit: '6,255.00 ₼', marginPercent: '45.0%', atv: '97.89 ₼' },
            { date: '2026-10-11', branchName: 'Gənclik Mall Filialı', receiptCount: 195, unitsSold: 468, grossSales: '18,400.00 ₼', discountAmount: '1,200.00 ₼', returnAmount: '450.00 ₼', netSales: '16,750.00 ₼', cogs: '9,212.50 ₼', grossProfit: '7,537.50 ₼', marginPercent: '45.0%', atv: '85.90 ₼' },
            { date: '2026-10-11', branchName: '28 Mall Filialı', receiptCount: 110, unitsSold: 253, grossSales: '8,600.00 ₼', discountAmount: '500.00 ₼', returnAmount: '300.00 ₼', netSales: '7,800.00 ₼', cogs: '4,290.00 ₼', grossProfit: '3,510.00 ₼', marginPercent: '45.0%', atv: '70.91 ₼' },
          ],
          totalCount: 3,
        };
      }

      case 'sales_hourly_heatmap': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-h1', label: 'Pik Saat Satışı (18:00-19:00)', formattedValue: '12,450.00 ₼', rawValue: 12450, unit: 'azn', isComputable: true, kpiDefId: 'kpi_net_sales' },
          { id: 'kpi-h2', label: 'Pik ATV Saatı (14:00-15:00)', formattedValue: '88.20 ₼', rawValue: 88.2, unit: 'azn', isComputable: true, kpiDefId: 'kpi_atv' },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          kpis,
          chartData: [
            { hour: '10:00', BazarErtəsi: 450, ÇərşənbəAxşamı: 520, Çərşənbə: 480, CüməAxşamı: 610, Cümə: 780, Şənbə: 1200, Bazar: 1400 },
            { hour: '12:00', BazarErtəsi: 850, ÇərşənbəAxşamı: 920, Çərşənbə: 890, CüməAxşamı: 1100, Cümə: 1450, Şənbə: 2100, Bazar: 2350 },
            { hour: '15:00', BazarErtəsi: 1100, ÇərşənbəAxşamı: 1250, Çərşənbə: 1300, CüməAxşamı: 1450, Cümə: 1890, Şənbə: 2800, Bazar: 3100 },
            { hour: '18:00', BazarErtəsi: 1950, ÇərşənbəAxşamı: 2100, Çərşənbə: 2050, CüməAxşamı: 2400, Cümə: 3400, Şənbə: 4500, Bazar: 4800 },
            { hour: '20:00', BazarErtəsi: 1400, ÇərşənbəAxşamı: 1550, Çərşənbə: 1490, CüməAxşamı: 1750, Cümə: 2600, Şənbə: 3800, Bazar: 3950 },
          ],
          tableRows: [
            { dayOfWeek: 'Bazar ertəsi', hourOfDay: '10:00 - 11:00', receiptCount: 18, netSales: '450.00 ₼', avgBasket: '25.00 ₼' },
            { dayOfWeek: 'Bazar ertəsi', hourOfDay: '18:00 - 19:00', receiptCount: 42, netSales: '1,950.00 ₼', avgBasket: '46.43 ₼' },
            { dayOfWeek: 'Şənbə', hourOfDay: '18:00 - 19:00', receiptCount: 88, netSales: '4,500.00 ₼', avgBasket: '51.14 ₼' },
            { dayOfWeek: 'Bazar', hourOfDay: '18:00 - 19:00', receiptCount: 94, netSales: '4,800.00 ₼', avgBasket: '51.06 ₼' },
          ],
          totalCount: 4,
        };
      }

      case 'inv_current':
      case 'inv_valuation': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-v1', label: 'Cəmi Maya Dəyəri', formattedValue: '184,250.00 ₼', rawValue: 184250, unit: 'azn', isComputable: true, kpiDefId: 'kpi_stock_cost_value' },
          { id: 'kpi-v2', label: 'Cəmi Pərakəndə Dəyəri', formattedValue: '315,800.00 ₼', rawValue: 315800, unit: 'azn', isComputable: true, kpiDefId: 'kpi_stock_retail_value' },
          { id: 'kpi-v3', label: 'Gözlənilən Marja', formattedValue: '131,550.00 ₼ (41.7%)', rawValue: 131550, unit: 'azn', isComputable: true, kpiDefId: 'kpi_potential_margin' },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          activeCogsMethod,
          kpis,
          chartData: [
            { category: 'Kişi Geyimi', costValue: 68000, retailValue: 115000 },
            { category: 'Qadın Geyimi', costValue: 84000, retailValue: 148000 },
            { category: 'Aksesuarlar', costValue: 21000, retailValue: 36000 },
            { category: 'Ayaqqabı', costValue: 11250, retailValue: 16800 },
          ],
          tableRows: [
            { sku: 'TSH-WHT-M', barcode: '8680001001', productName: 'Premium Pambıq Köynək (Ağ / M)', categoryName: 'Kişi Geyimi', brandName: 'BrandHouse Basics', branchName: targetBranch, onHandQty: 45, reservedQty: 3, availableQty: 42, unitCost: '22.50 ₼', unitRetailPrice: '45.00 ₼', totalCost: '1,012.50 ₼', totalRetail: '2,025.00 ₼', marginPercent: '50.0%' },
            { sku: 'JNS-SLM-32', barcode: '8680001002', productName: 'Slim Fit Cins Şalvar (Göy / 32)', categoryName: 'Kişi Geyimi', brandName: 'Denim Studio', branchName: targetBranch, onHandQty: 28, reservedQty: 0, availableQty: 28, unitCost: '38.00 ₼', unitRetailPrice: '79.90 ₼', totalCost: '1,064.00 ₼', totalRetail: '2,237.20 ₼', marginPercent: '52.4%' },
            { sku: 'DRS-FLR-S', barcode: '8680002001', productName: 'Güllü Yay Paltarı (Qırmızı / S)', categoryName: 'Qadın Geyimi', brandName: 'Silk Elegance', branchName: targetBranch, onHandQty: 14, reservedQty: 1, availableQty: 13, unitCost: '48.00 ₼', unitRetailPrice: '99.00 ₼', totalCost: '672.00 ₼', totalRetail: '1,386.00 ₼', marginPercent: '51.5%' },
            { sku: 'BLZ-SLK-M', barcode: '8680002002', productName: 'Klassik İpək Kofta (Bej / M)', categoryName: 'Qadın Geyimi', brandName: 'Silk Elegance', branchName: targetBranch, onHandQty: 22, reservedQty: 2, availableQty: 20, unitCost: '35.00 ₼', unitRetailPrice: '69.00 ₼', totalCost: '770.00 ₼', totalRetail: '1,518.00 ₼', marginPercent: '49.3%' },
            { sku: 'BELT-LTH-BRN', barcode: '8680003001', productName: 'Klassik Dəri Kəmər (Qəhvəyi)', categoryName: 'Aksesuarlar', brandName: 'LeatherCraft', branchName: targetBranch, onHandQty: 35, reservedQty: 0, availableQty: 35, unitCost: '14.00 ₼', unitRetailPrice: '32.00 ₼', totalCost: '490.00 ₼', totalRetail: '1,120.00 ₼', marginPercent: '56.3%' },
          ],
          totalCount: 5,
        };
      }

      case 'inv_dead_stock':
      case 'inv_slow_moving': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-d1', label: 'Ölü Stok Maya Həcmi (>90 gün)', formattedValue: '14,320.00 ₼', rawValue: 14320, unit: 'azn', isComputable: true, kpiDefId: 'kpi_dead_stock_value' },
          { id: 'kpi-d2', label: 'Orta Dövr Müddəti (DIO)', formattedValue: '118 gün', rawValue: 118, unit: 'qty', isComputable: true, kpiDefId: 'kpi_dio' },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          activeCogsMethod,
          kpis,
          chartData: [
            { range: '90-120 gün', count: 12, cost: 4200 },
            { range: '121-180 gün', count: 8, cost: 5800 },
            { range: '>180 gün', count: 5, cost: 4320 },
          ],
          tableRows: [
            { sku: 'WNT-COAT-XL', barcode: '868000901', productName: 'Qışlıq Yun Palto (Qara / XL)', categoryName: 'Kişi Geyimi', branchName: '28 Mall Filialı', currentStock: 8, daysWithoutSale: 135, lastSaleDate: '2026-05-28', unitCost: '110.00 ₼', lockedCapitalCost: '880.00 ₼', suggestedAction: 'Endirim kompaniyasına sal və ya çıxarış' },
            { sku: 'SUM-HAT-WHT', barcode: '868000902', productName: 'Yaylıq Panama Papaq (Ağ)', categoryName: 'Aksesuarlar', branchName: 'Gənclik Mall Filialı', currentStock: 24, daysWithoutSale: 102, lastSaleDate: '2026-07-01', unitCost: '8.50 ₼', lockedCapitalCost: '204.00 ₼', suggestedAction: 'Endirim səbətinə köçür' },
          ],
          totalCount: 2,
        };
      }

      case 'purch_po_outstanding':
      case 'purch_discrepancies': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-p1', label: 'Qiymət Sapması (PPV)', formattedValue: '-350.00 ₼ (Əlverişli)', rawValue: -350, unit: 'azn', isComputable: true, kpiDefId: 'kpi_price_variance' },
          { id: 'kpi-p2', label: 'Təsdiq Gözləyən Fakturalar', formattedValue: '2 ədəd (3,400.00 ₼)', rawValue: 2, unit: 'qty', isComputable: true },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          kpis,
          chartData: [
            { supplier: 'Baku Textile LLC', ordered: 15000, received: 14800 },
            { supplier: 'EuroFash GmbH', ordered: 22000, received: 22000 },
            { supplier: 'Global Shoes Co', ordered: 9500, received: 9100 },
          ],
          tableRows: [
            { poNumber: 'PO-2026-0041', supplierName: 'Baku Textile LLC', orderDate: '2026-10-02', expectedDate: '2026-10-08', status: 'qismən_təhvil', orderedTotal: '15,000.00 ₼', receivedTotal: '11,200.00 ₼', remainingTotal: '3,800.00 ₼', daysOverdue: 3 },
            { poNumber: 'PO-2026-0044', supplierName: 'Global Shoes Co', orderDate: '2026-10-05', expectedDate: '2026-10-15', status: 'gözləmədə', orderedTotal: '9,500.00 ₼', receivedTotal: '0.00 ₼', remainingTotal: '9,500.00 ₼', daysOverdue: 0 },
          ],
          totalCount: 2,
        };
      }

      case 'fin_pnl_branch': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-f1', label: 'Cəmi Satış Gəliri', formattedValue: '112,400.00 ₼', rawValue: 112400, unit: 'azn', isComputable: true, kpiDefId: 'kpi_net_sales' },
          { id: 'kpi-f2', label: 'Cəmi Satılan Mal Maya', formattedValue: '59,200.00 ₼', rawValue: 59200, unit: 'azn', isComputable: true, kpiDefId: 'kpi_cogs' },
          { id: 'kpi-f3', label: 'Ümumi Mənfəət', formattedValue: '53,200.00 ₼ (47.3%)', rawValue: 53200, unit: 'azn', isComputable: true, kpiDefId: 'kpi_gross_profit' },
          { id: 'kpi-f4', label: 'Əməliyyat Xərcləri (OPEX)', formattedValue: '31,500.00 ₼', rawValue: 31500, unit: 'azn', isComputable: true, kpiDefId: 'kpi_operating_expenses' },
          { id: 'kpi-f5', label: 'Xalis Əməliyyat Mənfəəti', formattedValue: '21,700.00 ₼ (19.3%)', rawValue: 21700, unit: 'azn', isComputable: true, kpiDefId: 'kpi_net_profit' },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          activeCogsMethod,
          kpis,
          chartData: [
            { branch: 'Baş Filial (Nizami)', netSales: 52000, grossProfit: 25400, opex: 12000, netProfit: 13400 },
            { branch: 'Gənclik Mall Filialı', netSales: 38400, grossProfit: 18100, opex: 11500, netProfit: 6600 },
            { branch: '28 Mall Filialı', netSales: 22000, grossProfit: 9700, opex: 8000, netProfit: 1700 },
          ],
          tableRows: [
            { lineItem: '1. Xalis Satış Gəliri (Net Revenue)', nizamiBranch: '52,000.00 ₼', genclikBranch: '38,400.00 ₼', mall28Branch: '22,000.00 ₼', totalCompany: '112,400.00 ₼' },
            { lineItem: '2. Satılan Malın Maya Dəyəri (COGS)', nizamiBranch: '-26,600.00 ₼', genclikBranch: '-20,300.00 ₼', mall28Branch: '-12,300.00 ₼', totalCompany: '-59,200.00 ₼' },
            { lineItem: '3. Ümumi Mənfəət (Gross Profit)', nizamiBranch: '25,400.00 ₼', genclikBranch: '18,100.00 ₼', mall28Branch: '9,700.00 ₼', totalCompany: '53,200.00 ₼' },
            { lineItem: '4. İcarə Xərcləri', nizamiBranch: '-5,000.00 ₼', genclikBranch: '-6,000.00 ₼', mall28Branch: '-4,200.00 ₼', totalCompany: '-15,200.00 ₼' },
            { lineItem: '5. Maaş və Əmək Xərcləri', nizamiBranch: '-5,200.00 ₼', genclikBranch: '-4,100.00 ₼', mall28Branch: '-2,800.00 ₼', totalCompany: '-12,100.00 ₼' },
            { lineItem: '6. Kommunal və Digər OPEX', nizamiBranch: '-1,800.00 ₼', genclikBranch: '-1,400.00 ₼', mall28Branch: '-1,000.00 ₼', totalCompany: '-4,200.00 ₼' },
            { lineItem: '7. Xalis Əməliyyat Mənfəəti (EBIT)', nizamiBranch: '13,400.00 ₼', genclikBranch: '6,600.00 ₼', mall28Branch: '1,700.00 ₼', totalCompany: '21,700.00 ₼' },
          ],
          totalCount: 7,
        };
      }

      case 'hr_payroll_summary': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-h1', label: 'Cəmi Hesablanmış Əməkhaqqı', formattedValue: '24,650.00 ₼', rawValue: 24650, unit: 'azn', isComputable: true, kpiDefId: 'kpi_payroll_expense' },
          { id: 'kpi-h2', label: 'Cəmi Əlavə İş Saatları', formattedValue: '142 saat', rawValue: 142, unit: 'qty', isComputable: true },
          { id: 'kpi-h3', label: 'Ödəniləcək Xalis Məbləğ', formattedValue: '20,850.00 ₼', rawValue: 20850, unit: 'azn', isComputable: true },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          kpis,
          chartData: [
            { department: 'Satış (Kassir/Məsləhətçi)', gross: 14200, net: 12100 },
            { department: 'Anbar və Logistika', gross: 5600, net: 4750 },
            { department: 'Menecment və Ofis', gross: 4850, net: 4000 },
          ],
          tableRows: [
            { employeeCode: 'EMP-001', fullName: 'Əli Həsənov', department: 'Satış', branchName: 'Baş Filial (Nizami)', baseSalary: '850.00 ₼', overtimePay: '65.00 ₼', bonuses: '120.00 ₼', deductions: '0.00 ₼', grossSalary: '1,035.00 ₼', taxWithheld: '145.00 ₼', netPayable: '890.00 ₼' },
            { employeeCode: 'EMP-002', fullName: 'Aysel Quliyeva', department: 'Satış', branchName: 'Gənclik Mall Filialı', baseSalary: '900.00 ₼', overtimePay: '40.00 ₼', bonuses: '150.00 ₼', deductions: '0.00 ₼', grossSalary: '1,090.00 ₼', taxWithheld: '152.00 ₼', netPayable: '938.00 ₼' },
            { employeeCode: 'EMP-003', fullName: 'Rəşad Məmmədov', department: 'Anbar', branchName: 'Mərkəzi Anbar', baseSalary: '950.00 ₼', overtimePay: '110.00 ₼', bonuses: '80.00 ₼', deductions: '0.00 ₼', grossSalary: '1,140.00 ₼', taxWithheld: '160.00 ₼', netPayable: '980.00 ₼' },
          ],
          totalCount: 3,
        };
      }

      case 'mkt_campaign_roi': {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-m1', label: 'Cəmi Kampaniya Xərci', formattedValue: '4,500.00 ₼', rawValue: 4500, unit: 'azn', isComputable: true },
          { id: 'kpi-m2', label: 'Əlaqələndirilmiş Satış', formattedValue: '28,400.00 ₼', rawValue: 28400, unit: 'azn', isComputable: true },
          { id: 'kpi-m3', label: 'ROI Göstəricisi', formattedValue: '185.2%', rawValue: 185.2, unit: 'percent', changePercent: 12.0, isComputable: true },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          activeCogsMethod,
          kpis,
          chartData: [
            { campaign: 'Payız Endirimi 2026', spend: 2000, revenue: 14500, margin: 6800 },
            { campaign: 'VIP Müştəri Bonusu', spend: 1500, revenue: 9800, margin: 4900 },
            { campaign: 'Açılış Xüsusi Təklif', spend: 1000, revenue: 4100, margin: 1950 },
          ],
          tableRows: [
            { campaignName: 'Payız Endirimi 2026', objective: 'Mövsümi satış artımı', dateRange: '2026-09-15 - 2026-10-15', actualSpend: '2,000.00 ₼', attributedSales: '14,500.00 ₼', discountCost: '1,450.00 ₼', attributedCogs: '7,700.00 ₼', grossMargin: '5,350.00 ₼', roiPercent: '167.5%' },
            { campaignName: 'VIP Müştəri Bonusu', objective: 'Loyallıq stimullaşdırılması', dateRange: '2026-10-01 - 2026-10-31', actualSpend: '1,500.00 ₼', attributedSales: '9,800.00 ₼', discountCost: '780.00 ₼', attributedCogs: '4,900.00 ₼', grossMargin: '4,120.00 ₼', roiPercent: '174.7%' },
          ],
          totalCount: 2,
        };
      }

      default: {
        const kpis: ReportKpiResult[] = [
          { id: 'kpi-gen1', label: 'Ümumi Göstərici', formattedValue: '18,500.00 ₼', rawValue: 18500, unit: 'azn', isComputable: true, kpiDefId: 'kpi_net_sales' },
          { id: 'kpi-gen2', label: 'Orta Həcm', formattedValue: '72.50 ₼', rawValue: 72.5, unit: 'azn', isComputable: true, kpiDefId: 'kpi_atv' },
        ];
        return {
          reportId: report.id,
          reportTitle: report.azTitle,
          generatedAt,
          isDemo: true,
          activeCogsMethod: report.category === 'inventory' || report.category === 'finance' ? activeCogsMethod : undefined,
          kpis,
          chartData: [
            { label: 'Baş Filial', value: 12500 },
            { label: 'Gənclik Mall', value: 9800 },
            { label: '28 Mall', value: 6200 },
          ],
          tableRows: [
            { id: '1', branchName: 'Baş Filial (Nizami)', categoryName: 'Kişi Geyimi', value: '12,500.00 ₼', count: 184, date: '2026-10-11' },
            { id: '2', branchName: 'Gənclik Mall Filialı', categoryName: 'Qadın Geyimi', value: '9,800.00 ₼', count: 142, date: '2026-10-11' },
            { id: '3', branchName: '28 Mall Filialı', categoryName: 'Aksesuarlar', value: '6,200.00 ₼', count: 96, date: '2026-10-11' },
          ],
          totalCount: 3,
        };
      }
    }
  }
}
