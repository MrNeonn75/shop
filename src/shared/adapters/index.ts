import { env } from '../config/env';
import {
  ProductRepository,
  BranchRepository,
  DashboardRepository,
  CatalogRepository,
} from './types';
import { MockProductAdapter } from './mock/mockProductAdapter';
import { MockBranchAdapter } from './mock/mockBranchAdapter';
import { MockDashboardAdapter } from './mock/mockDashboardAdapter';
import { MockCatalogAdapter } from './mock/mockCatalogAdapter';
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
} {
  const dataSource = env.VITE_DATA_SOURCE;

  if (dataSource === 'http') {
    return {
      productRepository: new HttpProductAdapter(),
      branchRepository: new HttpBranchAdapter(),
      dashboardRepository: new HttpDashboardAdapter(),
      catalogRepository: new HttpCatalogAdapter(),
    };
  }

  if (dataSource === 'legacy') {
    return {
      productRepository: new BrendHouseLegacyProductAdapter(),
      branchRepository: new BrendHouseLegacyBranchAdapter(),
      dashboardRepository: new BrendHouseLegacyDashboardAdapter(),
      catalogRepository: new BrendHouseLegacyCatalogAdapter(),
    };
  }

  // Default to mock
  return {
    productRepository: new MockProductAdapter(),
    branchRepository: new MockBranchAdapter(),
    dashboardRepository: new MockDashboardAdapter(),
    catalogRepository: new MockCatalogAdapter(),
  };
}

const adapters = createAdapters();

export const productRepository = adapters.productRepository;
export const branchRepository = adapters.branchRepository;
export const dashboardRepository = adapters.dashboardRepository;
export const catalogRepository = adapters.catalogRepository;
