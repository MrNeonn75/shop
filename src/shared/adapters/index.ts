import { env } from '../config/env';
import {
  ProductRepository,
  BranchRepository,
  DashboardRepository,
  CatalogRepository,
  InventoryRepository,
  TransferRepository,
} from './types';
import { MockProductAdapter } from './mock/mockProductAdapter';
import { MockBranchAdapter } from './mock/mockBranchAdapter';
import { MockDashboardAdapter } from './mock/mockDashboardAdapter';
import { MockCatalogAdapter } from './mock/mockCatalogAdapter';
import { MockInventoryAdapter } from './mock/mockInventoryAdapter';
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
} {
  const dataSource = env.VITE_DATA_SOURCE;
  const mockInventoryAdapter = new MockInventoryAdapter();

  if (dataSource === 'http') {
    return {
      productRepository: new HttpProductAdapter(),
      branchRepository: new HttpBranchAdapter(),
      dashboardRepository: new HttpDashboardAdapter(),
      catalogRepository: new HttpCatalogAdapter(),
      inventoryRepository: mockInventoryAdapter,
      transferRepository: mockInventoryAdapter,
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
  };
}

const adapters = createAdapters();

export const productRepository = adapters.productRepository;
export const branchRepository = adapters.branchRepository;
export const dashboardRepository = adapters.dashboardRepository;
export const catalogRepository = adapters.catalogRepository;
export const inventoryRepository = adapters.inventoryRepository;
export const transferRepository = adapters.transferRepository;
