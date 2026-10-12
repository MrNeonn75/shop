import { env } from '../config/env';
import {
  ProductRepository,
  BranchRepository,
  DashboardRepository,
  CatalogRepository,
  InventoryRepository,
  TransferRepository,
  SupplierRepository,
  PurchasingRepository,
  FinanceRepository,
  HrRepository,
  MarketingRepository,
  CrmRepository,
  ReportsRepository,
  BiRepository,
  SystemRepository,
  SecurityAuditRepository,
  NotificationsRepository,
} from './types';
import { MockProductAdapter } from './mock/mockProductAdapter';
import { MockBranchAdapter } from './mock/mockBranchAdapter';
import { MockDashboardAdapter } from './mock/mockDashboardAdapter';
import { MockCatalogAdapter } from './mock/mockCatalogAdapter';
import { MockInventoryAdapter } from './mock/mockInventoryAdapter';
import { MockSupplierAdapter } from './mock/mockSupplierAdapter';
import { MockPurchasingAdapter } from './mock/mockPurchasingAdapter';
import { MockFinanceAdapter } from './mock/mockFinanceAdapter';
import { MockHrAdapter } from './mock/mockHrAdapter';
import { MockMarketingAdapter } from './mock/mockMarketingAdapter';
import { MockCrmAdapter } from './mock/mockCrmAdapter';
import { MockReportsAdapter } from './mock/mockReportsAdapter';
import { MockBiAdapter } from './mock/mockBiAdapter';
import { MockSystemAdapter } from './mock/mockSystemAdapter';
import { MockSecurityAuditAdapter } from './mock/mockSecurityAuditAdapter';
import { MockNotificationsAdapter } from './mock/mockNotificationsAdapter';
import { HttpProductAdapter } from './http/httpProductAdapter';
import { HttpBranchAdapter } from './http/httpBranchAdapter';
import { HttpDashboardAdapter } from './http/httpDashboardAdapter';
import { HttpCatalogAdapter } from './http/httpCatalogAdapter';
import {
  BrendHouseLegacyProductAdapter,
  BrendHouseLegacyBranchAdapter,
  BrendHouseLegacyDashboardAdapter,
  BrendHouseLegacyCatalogAdapter,
} from './BrendHouseLegacyAdapter';

export * from './types';

function createAdapters(): {
  productRepository: ProductRepository;
  branchRepository: BranchRepository;
  dashboardRepository: DashboardRepository;
  catalogRepository: CatalogRepository;
  inventoryRepository: InventoryRepository;
  transferRepository: TransferRepository;
  supplierRepository: SupplierRepository;
  purchasingRepository: PurchasingRepository;
  financeRepository: FinanceRepository;
  hrRepository: HrRepository;
  marketingRepository: MarketingRepository;
  crmRepository: CrmRepository;
  reportsRepository: ReportsRepository;
  biRepository: BiRepository;
  systemRepository: SystemRepository;
  securityAuditRepository: SecurityAuditRepository;
  notificationsRepository: NotificationsRepository;
} {
  const dataSource = env.VITE_DATA_SOURCE;
  const mockInventoryAdapter = new MockInventoryAdapter();
  const mockSupplierAdapter = new MockSupplierAdapter();
  const mockPurchasingAdapter = new MockPurchasingAdapter(mockInventoryAdapter);
  const mockFinanceAdapter = new MockFinanceAdapter();
  const mockHrAdapter = new MockHrAdapter();
  const mockMarketingAdapter = new MockMarketingAdapter();
  const mockCrmAdapter = new MockCrmAdapter();
  const mockReportsAdapter = new MockReportsAdapter();
  const mockBiAdapter = new MockBiAdapter();
  const mockSystemAdapter = new MockSystemAdapter();
  const mockSecurityAuditAdapter = new MockSecurityAuditAdapter();
  const mockNotificationsAdapter = new MockNotificationsAdapter();

  if (dataSource === 'http') {
    return {
      productRepository: new HttpProductAdapter(),
      branchRepository: new HttpBranchAdapter(),
      dashboardRepository: new HttpDashboardAdapter(),
      catalogRepository: new HttpCatalogAdapter(),
      inventoryRepository: mockInventoryAdapter,
      transferRepository: mockInventoryAdapter,
      supplierRepository: mockSupplierAdapter,
      purchasingRepository: mockPurchasingAdapter,
      financeRepository: mockFinanceAdapter,
      hrRepository: mockHrAdapter,
      marketingRepository: mockMarketingAdapter,
      crmRepository: mockCrmAdapter,
      reportsRepository: mockReportsAdapter,
      biRepository: mockBiAdapter,
      systemRepository: mockSystemAdapter,
      securityAuditRepository: mockSecurityAuditAdapter,
      notificationsRepository: mockNotificationsAdapter,
    };
  }

  if (dataSource === 'legacy') {
    return {
      productRepository: new BrendHouseLegacyProductAdapter(),
      branchRepository: new BrendHouseLegacyBranchAdapter(),
      dashboardRepository: new BrendHouseLegacyDashboardAdapter(),
      catalogRepository: new BrendHouseLegacyCatalogAdapter(),
      inventoryRepository: mockInventoryAdapter,
      transferRepository: mockInventoryAdapter,
      supplierRepository: mockSupplierAdapter,
      purchasingRepository: mockPurchasingAdapter,
      financeRepository: mockFinanceAdapter,
      hrRepository: mockHrAdapter,
      marketingRepository: mockMarketingAdapter,
      crmRepository: mockCrmAdapter,
      reportsRepository: mockReportsAdapter,
      biRepository: mockBiAdapter,
      systemRepository: mockSystemAdapter,
      securityAuditRepository: mockSecurityAuditAdapter,
      notificationsRepository: mockNotificationsAdapter,
    };
  }

  // Default to mock
  return {
    productRepository: new MockProductAdapter(),
    branchRepository: new MockBranchAdapter(),
    dashboardRepository: new MockDashboardAdapter(),
    catalogRepository: new MockCatalogAdapter(),
    inventoryRepository: mockInventoryAdapter,
    transferRepository: mockInventoryAdapter,
    supplierRepository: mockSupplierAdapter,
    purchasingRepository: mockPurchasingAdapter,
    financeRepository: mockFinanceAdapter,
    hrRepository: mockHrAdapter,
    marketingRepository: mockMarketingAdapter,
    crmRepository: mockCrmAdapter,
    reportsRepository: mockReportsAdapter,
    biRepository: mockBiAdapter,
    systemRepository: mockSystemAdapter,
    securityAuditRepository: mockSecurityAuditAdapter,
    notificationsRepository: mockNotificationsAdapter,
  };
}

const adapters = createAdapters();

export const productRepository = adapters.productRepository;
export const branchRepository = adapters.branchRepository;
export const dashboardRepository = adapters.dashboardRepository;
export const catalogRepository = adapters.catalogRepository;
export const inventoryRepository = adapters.inventoryRepository;
export const transferRepository = adapters.transferRepository;
export const supplierRepository = adapters.supplierRepository;
export const purchasingRepository = adapters.purchasingRepository;
export const financeRepository = adapters.financeRepository;
export const hrRepository = adapters.hrRepository;
export const marketingRepository = adapters.marketingRepository;
export const crmRepository = adapters.crmRepository;
export const reportsRepository = adapters.reportsRepository;
export const biRepository = adapters.biRepository;
export const systemRepository = adapters.systemRepository;
export const securityAuditRepository = adapters.securityAuditRepository;
export const notificationsRepository = adapters.notificationsRepository;




