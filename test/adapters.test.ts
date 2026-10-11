import { describe, it, expect } from 'vitest';
import { MockProductAdapter } from '../src/shared/adapters/mock/mockProductAdapter';
import { MockBranchAdapter } from '../src/shared/adapters/mock/mockBranchAdapter';
import {
  BrendHouseLegacyProductAdapter,
  UnconfiguredLegacyAdapterError,
} from '../src/shared/adapters/BrendHouseLegacyAdapter';

describe('Data Adapters Pattern', () => {
  describe('MockProductAdapter', () => {
    const adapter = new MockProductAdapter();

    it('returns seeded mock products with pagination metadata', async () => {
      const result = await adapter.getProducts({ page: 1, pageSize: 5 });
      expect(result.items.length).toBeLessThanOrEqual(5);
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(5);
      expect(result.items[0].isDemo).toBe(true);
    });

    it('filters products by search keyword', async () => {
      const result = await adapter.getProducts({ search: 'Tommy Hilfiger' });
      expect(result.items.length).toBeGreaterThan(0);
      result.items.forEach((p) => {
        const matches =
          p.name.toLowerCase().includes('tommy') ||
          p.brand.toLowerCase().includes('tommy') ||
          p.sku.toLowerCase().includes('tommy');
        expect(matches).toBe(true);
      });
    });

    it('filters products by branch ID', async () => {
      const result = await adapter.getProducts({ branchId: 'branch-1' });
      result.items.forEach((p) => {
        expect(p.branchId).toBe('branch-1');
      });
    });
  });

  describe('MockBranchAdapter', () => {
    const adapter = new MockBranchAdapter();

    it('returns list of branches with demo label', async () => {
      const branches = await adapter.getBranches();
      expect(branches.length).toBeGreaterThanOrEqual(4);
      expect(branches[0].isDemo).toBe(true);
      expect(branches.some((b) => b.name.includes('Nizami'))).toBe(true);
    });
  });

  describe('BrendHouseLegacyAdapter', () => {
    const legacyAdapter = new BrendHouseLegacyProductAdapter();

    it('throws explicit UnconfiguredLegacyAdapterError when invoked without configuration', async () => {
      await expect(legacyAdapter.getProducts()).rejects.toThrow(
        UnconfiguredLegacyAdapterError
      );
      await expect(legacyAdapter.getProducts()).rejects.toThrow(
        /Integration not configured/
      );
    });
  });
});

