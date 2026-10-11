import { ProductRepository, BranchRepository, DashboardRepository, CatalogRepository } from '../types';

export class UnconfiguredLegacyAdapterError extends Error {
  constructor(moduleName: string) {
    super(
      `BrendHouseLegacyAdapter [${moduleName}]: İnteqrasiya konfiqurasiya edilməyib (Integration not configured). brendhouse.az API açarları və son nöqtələri təyin edilməyib.`
    );
    this.name = 'UnconfiguredLegacyAdapterError';
  }
}

export class BrendHouseLegacyProductAdapter implements ProductRepository {
  async getProducts(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Products');
  }
  async getProductById(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Products');
  }
  async createProduct(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Products');
  }
  async updateProduct(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Products');
  }
  async deleteProduct(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Products');
  }
}

export class BrendHouseLegacyBranchAdapter implements BranchRepository {
  async getBranches(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Branches');
  }
  async getBranchById(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Branches');
  }
}

export class BrendHouseLegacyDashboardAdapter implements DashboardRepository {
  async getSummary(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getSalesTrend(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getSalesByBranch(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getSectionTypeSales(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getTopSellingProducts(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getPaymentBreakdown(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getInventoryAlerts(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getSlowMovingStock(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getExpenseTrend(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getOperationsStatus(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
  async getActivities(_params?: unknown): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Dashboard');
  }
}

export class BrendHouseLegacyCatalogAdapter implements CatalogRepository {
  async getProducts(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async getProductById(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async createProduct(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async updateProduct(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async deleteProduct(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async bulkUpdateStatus(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async bulkUpdateCategory(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async checkIdentifierUniqueness(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async getCategories(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async saveCategory(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async deleteCategory(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async getBrands(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async saveBrand(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async deleteBrand(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
  async importProducts(): Promise<never> {
    throw new UnconfiguredLegacyAdapterError('Catalog');
  }
}
