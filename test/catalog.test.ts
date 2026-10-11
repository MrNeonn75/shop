import { describe, it, expect } from 'vitest';
import {
  calculateEan13CheckDigit,
  isValidEan13,
  generateEan13,
  encodeEan13Modules,
} from '../src/features/catalog/utils/barcode';
import {
  generateVariantMatrix,
  validateMatrixDuplicates,
  slugify,
  getColorSlug,
} from '../src/features/catalog/utils/matrixGenerator';
import { getPriceAtTime } from '../src/features/catalog/utils/priceHistory';
import { MockCatalogAdapter } from '../src/shared/adapters/mock/mockCatalogAdapter';
import { PriceHistoryEntry, ProductVariant } from '../src/features/catalog/types/catalog';
import { toQapik } from '../src/shared/utils/money';

describe('Product Catalog Module (Milestone F4)', () => {
  describe('EAN-13 Barcode Algorithm & GS1 Compliance', () => {
    it('calculates the correct modulo-10 check digit for known EAN-13 bases', () => {
      // 476001239011 -> check digit should be 2 (from mock data: 4760012390112)
      expect(calculateEan13CheckDigit('476001239011')).toBe(2);

      // 476001239012 -> check digit should be 9 (from mock data: 4760012390129)
      expect(calculateEan13CheckDigit('476001239012')).toBe(9);

      // Standard test vectors
      expect(calculateEan13CheckDigit('400638133393')).toBe(1);
      expect(calculateEan13CheckDigit('735005385001')).toBe(9);
      expect(calculateEan13CheckDigit('735005385004')).toBe(0);
    });

    it('rejects invalid base lengths when calculating checksum', () => {
      expect(() => calculateEan13CheckDigit('12345')).toThrow(/12 numeric digits/);
      expect(() => calculateEan13CheckDigit('4760012390112')).toThrow(/12 numeric digits/);
      expect(() => calculateEan13CheckDigit('abc123456789')).toThrow(/12 numeric digits/);
    });

    it('accurately validates 13-digit EAN-13 barcodes', () => {
      expect(isValidEan13('4760012390112')).toBe(true);
      expect(isValidEan13('4760012390129')).toBe(true);

      // Corrupted check digits
      expect(isValidEan13('4760012390110')).toBe(false);
      expect(isValidEan13('4760012390125')).toBe(false);

      // Wrong lengths
      expect(isValidEan13('476001239011')).toBe(false);
      expect(isValidEan13('47600123901122')).toBe(false);
      expect(isValidEan13('invalid-barcode')).toBe(false);
    });

    it('generates mathematically valid EAN-13 barcodes with default 476 prefix', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateEan13('476');
        expect(code).toHaveLength(13);
        expect(code.startsWith('476')).toBe(true);
        expect(isValidEan13(code)).toBe(true);
      }
    });

    it('encodes valid EAN-13 into standard 95-module binary representation', () => {
      const modules = encodeEan13Modules('4760012390112');
      expect(modules).not.toBeNull();
      expect(modules?.length).toBe(95);

      // Verify GS1 guards
      expect(modules?.slice(0, 3)).toBe('101'); // Left guard
      expect(modules?.slice(45, 50)).toBe('01010'); // Center guard
      expect(modules?.slice(92, 95)).toBe('101'); // Right guard
    });

    it('returns null when attempting to encode invalid EAN-13 barcode', () => {
      expect(encodeEan13Modules('123456')).toBeNull();
      expect(encodeEan13Modules('4760012390119')).toBeNull();
    });
  });

  describe('Fashion Size × Color Matrix Generator', () => {
    it('generates matrix combinations with auto-suggested SKU pattern', () => {
      const matrix = generateVariantMatrix({
        baseSku: 'ZR-M-SH-100',
        sizes: ['S', 'M', 'L'],
        colors: ['Qara', 'Ağ'],
      });

      // 3 sizes * 2 colors = 6 variants
      expect(matrix).toHaveLength(6);

      // Check SKU pattern: {baseSku}-{colorSlug}-{sizeSlug}
      const sBlack = matrix.find((v) => v.size === 'S' && v.color === 'Qara');
      expect(sBlack).toBeDefined();
      expect(sBlack?.sku).toBe('ZR-M-SH-100-BLK-S');
      expect(isValidEan13(sBlack!.barcode)).toBe(true);

      const lWhite = matrix.find((v) => v.size === 'L' && v.color === 'Ağ');
      expect(lWhite).toBeDefined();
      expect(lWhite?.sku).toBe('ZR-M-SH-100-WHT-L');
      expect(isValidEan13(lWhite!.barcode)).toBe(true);
    });

    it('preserves existing variants when regenerating with new sizes', () => {
      const existing: ProductVariant[] = [
        {
          id: 'var-existing-1',
          productId: 'prod-1',
          sku: 'CUSTOM-SKU-BLACK-S',
          barcode: '4760012390112',
          size: 'S',
          color: 'Qara',
          priceOverrideQapik: toQapik(12990),
          stockQty: 10,
          status: 'active',
        },
      ];

      const matrix = generateVariantMatrix({
        productId: 'prod-1',
        baseSku: 'ZR-M-SH-100',
        sizes: ['S', 'M'],
        colors: ['Qara'],
        existingVariants: existing,
      });

      expect(matrix).toHaveLength(2);

      // S Qara should retain custom SKU and price
      const sVariant = matrix.find((v) => v.size === 'S' && v.color === 'Qara');
      expect(sVariant?.id).toBe('var-existing-1');
      expect(sVariant?.sku).toBe('CUSTOM-SKU-BLACK-S');
      expect(sVariant?.priceOverrideQapik).toBe(toQapik(12990));

      // M Qara should be newly generated
      const mVariant = matrix.find((v) => v.size === 'M' && v.color === 'Qara');
      expect(mVariant?.id).not.toBe('var-existing-1');
      expect(mVariant?.sku).toBe('ZR-M-SH-100-BLK-M');
    });

    it('slugifies Azerbaijani characters accurately into ASCII identifiers', () => {
      expect(slugify('Gödəkcə')).toBe('GODEKCE');
      expect(slugify('Şalvar')).toBe('SALVAR');
      expect(slugify('Çanta')).toBe('CANTA');
      expect(slugify('İpək')).toBe('IPEK');
      expect(getColorSlug('Zümrüd Yaşılı')).toBe('EMR');
    });
  });

  describe('Duplicate SKU & Barcode Detection', () => {
    it('detects duplicate SKUs within the matrix', () => {
      const variants: ProductVariant[] = [
        {
          id: 'v1',
          productId: 'p1',
          sku: 'DUPLICATE-SKU',
          barcode: '4760012390112',
          size: 'S',
          color: 'Qara',
          stockQty: 0,
          status: 'active',
        },
        {
          id: 'v2',
          productId: 'p1',
          sku: 'DUPLICATE-SKU',
          barcode: '4760012390129',
          size: 'M',
          color: 'Qara',
          stockQty: 0,
          status: 'active',
        },
      ];

      const validation = validateMatrixDuplicates(variants);
      expect(validation.isValid).toBe(false);
      expect(validation.duplicateSkusInMatrix).toContain('DUPLICATE-SKU');
      expect(validation.errorMessages.some((msg) => msg.includes('DUPLICATE-SKU'))).toBe(true);
    });

    it('detects duplicate barcodes within the matrix', () => {
      const variants: ProductVariant[] = [
        {
          id: 'v1',
          productId: 'p1',
          sku: 'SKU-001',
          barcode: '4760012390112',
          size: 'S',
          color: 'Qara',
          stockQty: 0,
          status: 'active',
        },
        {
          id: 'v2',
          productId: 'p1',
          sku: 'SKU-002',
          barcode: '4760012390112',
          size: 'M',
          color: 'Qara',
          stockQty: 0,
          status: 'active',
        },
      ];

      const validation = validateMatrixDuplicates(variants);
      expect(validation.isValid).toBe(false);
      expect(validation.duplicateBarcodesInMatrix).toContain('4760012390112');
    });

    it('detects conflicts against already registered database SKUs and barcodes', () => {
      const registeredSkus = new Set(['DB-EXISTING-SKU']);
      const registeredBarcodes = new Set(['4760012390999']);

      const variants: ProductVariant[] = [
        {
          id: 'v1',
          productId: 'p1',
          sku: 'DB-EXISTING-SKU',
          barcode: '4760012390999',
          size: 'S',
          color: 'Qara',
          stockQty: 0,
          status: 'active',
        },
      ];

      const validation = validateMatrixDuplicates(variants, registeredSkus, registeredBarcodes);
      expect(validation.isValid).toBe(false);
      expect(validation.conflictingDatabaseSkus).toContain('DB-EXISTING-SKU');
      expect(validation.conflictingDatabaseBarcodes).toContain('4760012390999');
    });
  });

  describe('Historical Price Guard (<PriceAtTime /> & getPriceAtTime)', () => {
    const history: PriceHistoryEntry[] = [
      {
        id: 'ph-1',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        priceQapik: toQapik(10000), // 100.00 AZN
        changedBy: 'Admin',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'ph-2',
        effectiveFrom: '2026-02-01T00:00:00.000Z',
        priceQapik: toQapik(12000), // 120.00 AZN
        oldPriceQapik: toQapik(10000),
        changedBy: 'Manager',
        createdAt: '2026-01-25T00:00:00.000Z',
      },
      {
        id: 'ph-3',
        effectiveFrom: '2026-03-01T00:00:00.000Z',
        priceQapik: toQapik(15000), // 150.00 AZN
        oldPriceQapik: toQapik(12000),
        changedBy: 'Director',
        createdAt: '2026-02-20T00:00:00.000Z',
      },
    ];

    it('returns the initial price for dates before the second change', () => {
      const result = getPriceAtTime(history, '2026-01-15T12:00:00.000Z');
      expect(result.priceQapik).toBe(toQapik(10000));
      expect(result.entry?.id).toBe('ph-1');
    });

    it('returns the February price for dates in February', () => {
      const result = getPriceAtTime(history, '2026-02-15T10:00:00.000Z');
      expect(result.priceQapik).toBe(toQapik(12000));
      expect(result.entry?.id).toBe('ph-2');
    });

    it('returns the current March price for modern queries', () => {
      const result = getPriceAtTime(history, '2026-03-10T14:30:00.000Z');
      expect(result.priceQapik).toBe(toQapik(15000));
      expect(result.entry?.id).toBe('ph-3');
    });

    it('preserves past document integrity: querying a January receipt returns 100 AZN even after subsequent price hikes', () => {
      const historicalReceiptDate = '2026-01-10T08:00:00.000Z';
      const atTime = getPriceAtTime(history, historicalReceiptDate);
      expect(atTime.priceQapik).toBe(toQapik(10000));
      expect(atTime.priceQapik).not.toBe(toQapik(15000));
    });
  });

  describe('MockCatalogAdapter Operations', () => {
    const adapter = new MockCatalogAdapter();

    it('returns seeded catalog products with variants and categories', async () => {
      const res = await adapter.getProducts({ page: 1, pageSize: 10 });
      expect(res.items.length).toBeGreaterThan(0);
      expect(res.total).toBeGreaterThan(0);
      expect(res.items[0].isDemo).toBe(true);

      // Verify at least one item has variants
      const withVariants = res.items.find((p) => p.variants && p.variants.length > 0);
      expect(withVariants).toBeDefined();
    });

    it('filters products by single search input across name, sku, and barcode', async () => {
      const bySku = await adapter.getProducts({ search: 'MD-M-TR-204' });
      expect(bySku.items.length).toBeGreaterThan(0);
      expect(bySku.items[0].sku).toBe('MD-M-TR-204');

      const byBarcode = await adapter.getProducts({ search: '4760012390112' });
      expect(byBarcode.items.length).toBeGreaterThan(0);
      expect(byBarcode.items[0].barcode).toBe('4760012390112');
    });

    it('verifies SKU and barcode uniqueness correctly', async () => {
      const existingCheck = await adapter.checkIdentifierUniqueness(
        'TH-M-SH-101',
        '4760012390112'
      );
      expect(existingCheck.skuAvailable).toBe(false);
      expect(existingCheck.barcodeAvailable).toBe(false);

      const freshCheck = await adapter.checkIdentifierUniqueness(
        'NEW-BRAND-UNIQUE-SKU',
        '4769999999999'
      );
      expect(freshCheck.skuAvailable).toBe(true);
      expect(freshCheck.barcodeAvailable).toBe(true);
    });

    it('supports bulk status and bulk category updates', async () => {
      const initial = await adapter.getProducts({ pageSize: 2 });
      const ids = initial.items.map((p) => p.id);

      const updatedCount = await adapter.bulkUpdateStatus(ids, 'archived');
      expect(updatedCount).toBe(ids.length);

      const verify = await adapter.getProductById(ids[0]);
      expect(verify?.status).toBe('archived');
    });

    it('processes batch import with duplicate validation', async () => {
      const rows = [
        {
          name: 'İdxal Test Köynək',
          sku: 'IMP-TEST-001',
          barcode: '4760099881122',
          priceQapik: toQapik(4990),
          section: 'kisi',
          type: 'geyim',
        },
        {
          // Invalid: missing name
          name: '',
          sku: 'IMP-TEST-002',
          priceQapik: toQapik(1000),
        },
      ];

      const result = await adapter.importProducts(rows as unknown as Parameters<typeof adapter.importProducts>[0]);
      expect(result.importedCount).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].row).toBe(2);
    });
  });
});

