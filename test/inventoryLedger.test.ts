import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveStockBalances,
  validateNegativeStockOperation,
} from '../src/features/inventory/services/ledgerEngine';
import { MockInventoryAdapter } from '../src/shared/adapters/mock/mockInventoryAdapter';
import { StockMovement } from '../src/features/inventory/types';
import { Transfer } from '../src/features/transfers/types';
import { SEEDED_CATALOG_PRODUCTS } from '../src/features/catalog/data/taxonomyData';
import { MOCK_ADMIN_WAREHOUSES } from '../src/shared/adapters/mock/adminMockData';
import { toQapik, multiplyMoney } from '../src/shared/utils/money';

describe('Inventory Stock Ledger & Derivation Engine', () => {
  let adapter: MockInventoryAdapter;

  beforeEach(() => {
    adapter = new MockInventoryAdapter();
  });

  describe('Ledger Balances Derivation (Source of Truth)', () => {
    it('accurately derives onHand stock as sum of inward minus outward movements', () => {
      const p = SEEDED_CATALOG_PRODUCTS[0];
      const v = p.variants[0];

      const movements: StockMovement[] = [
        {
          id: 'mv-1',
          timestamp: '2026-10-01T10:00:00Z',
          type: 'receipt',
          productId: p.id,
          productName: p.name,
          productSku: p.sku,
          productBarcode: p.barcode,
          variantId: v.id,
          variantSku: v.sku,
          variantBarcode: v.barcode,
          size: v.size,
          color: v.color,
          toWarehouseId: 'wh-1',
          quantity: 20,
          unitCostQapik: p.costPriceQapik,
          totalCostQapik: multiplyMoney(p.costPriceQapik, 20),
          referenceDocType: 'receipt',
          referenceDocId: 'doc-1',
          referenceDocNumber: 'DOC-01',
          userId: 'u-1',
          userName: 'Admin',
        },
        {
          id: 'mv-2',
          timestamp: '2026-10-02T12:00:00Z',
          type: 'issue',
          productId: p.id,
          productName: p.name,
          productSku: p.sku,
          productBarcode: p.barcode,
          variantId: v.id,
          variantSku: v.sku,
          variantBarcode: v.barcode,
          size: v.size,
          color: v.color,
          fromWarehouseId: 'wh-1',
          quantity: 6,
          unitCostQapik: p.costPriceQapik,
          totalCostQapik: multiplyMoney(p.costPriceQapik, 6),
          referenceDocType: 'issue',
          referenceDocId: 'doc-2',
          referenceDocNumber: 'DOC-02',
          userId: 'u-1',
          userName: 'Admin',
        },
      ];

      const balances = deriveStockBalances(
        movements,
        [],
        [p],
        MOCK_ADMIN_WAREHOUSES
      );

      const targetBal = balances.find(
        (b) => b.variantId === v.id && b.warehouseId === 'wh-1'
      );
      expect(targetBal).toBeDefined();
      expect(targetBal?.onHand).toBe(14); // 20 - 6
      expect(targetBal?.available).toBe(14);
      expect(targetBal?.reserved).toBe(0);
      expect(targetBal?.stockState).toBe('normal');
    });

    it('reserves stock for transfers in approved or picking status', () => {
      const p = SEEDED_CATALOG_PRODUCTS[0];
      const v = p.variants[0];

      const movements: StockMovement[] = [
        {
          id: 'mv-1',
          timestamp: '2026-10-01T10:00:00Z',
          type: 'receipt',
          productId: p.id,
          productName: p.name,
          productSku: p.sku,
          productBarcode: p.barcode,
          variantId: v.id,
          variantSku: v.sku,
          variantBarcode: v.barcode,
          size: v.size,
          color: v.color,
          toWarehouseId: 'wh-1',
          quantity: 15,
          unitCostQapik: p.costPriceQapik,
          totalCostQapik: multiplyMoney(p.costPriceQapik, 15),
          referenceDocType: 'receipt',
          referenceDocId: 'doc-1',
          referenceDocNumber: 'DOC-01',
          userId: 'u-1',
          userName: 'Admin',
        },
      ];

      const activeTransfer: Transfer = {
        id: 'tr-test',
        transferNumber: 'TR-TEST',
        sourceWarehouseId: 'wh-1',
        sourceWarehouseName: 'Central',
        sourceBranchId: 'branch-1',
        sourceBranchName: 'Central',
        destinationWarehouseId: 'wh-2',
        destinationWarehouseName: '28 May',
        destinationBranchId: 'branch-1',
        destinationBranchName: '28 May',
        status: 'approved',
        requestedDate: '2026-10-10',
        createdAt: '2026-10-10T09:00:00Z',
        createdById: 'u-1',
        createdByName: 'Admin',
        items: [
          {
            id: 'ti-1',
            productId: p.id,
            productName: p.name,
            variantId: v.id,
            variantSku: v.sku,
            variantBarcode: v.barcode,
            size: v.size,
            color: v.color,
            availableAtSource: 15,
            requestedQty: 5,
            pickedQty: 0,
            dispatchedQty: 0,
            receivedQty: 0,
            damagedQty: 0,
            missingQty: 0,
            remainingInTransit: 0,
            unitCostQapik: p.costPriceQapik,
          },
        ],
        timeline: [],
      };

      const balances = deriveStockBalances(
        movements,
        [activeTransfer],
        [p],
        MOCK_ADMIN_WAREHOUSES
      );

      const bal = balances.find((b) => b.variantId === v.id && b.warehouseId === 'wh-1');
      expect(bal?.onHand).toBe(15);
      expect(bal?.reserved).toBe(5);
      expect(bal?.available).toBe(10); // 15 - 5
    });

    it('calculates in-transit stock for destination warehouse during dispatched transfers', () => {
      const p = SEEDED_CATALOG_PRODUCTS[0];
      const v = p.variants[0];

      const dispatchedTransfer: Transfer = {
        id: 'tr-transit',
        transferNumber: 'TR-TRANSIT',
        sourceWarehouseId: 'wh-1',
        sourceWarehouseName: 'Central',
        sourceBranchId: 'branch-1',
        sourceBranchName: 'Central',
        destinationWarehouseId: 'wh-2',
        destinationWarehouseName: '28 May',
        destinationBranchId: 'branch-1',
        destinationBranchName: '28 May',
        status: 'dispatched',
        requestedDate: '2026-10-10',
        createdAt: '2026-10-10T09:00:00Z',
        createdById: 'u-1',
        createdByName: 'Admin',
        items: [
          {
            id: 'ti-1',
            productId: p.id,
            productName: p.name,
            variantId: v.id,
            variantSku: v.sku,
            variantBarcode: v.barcode,
            size: v.size,
            color: v.color,
            availableAtSource: 10,
            requestedQty: 4,
            pickedQty: 4,
            dispatchedQty: 4,
            receivedQty: 0,
            damagedQty: 0,
            missingQty: 0,
            remainingInTransit: 4,
            unitCostQapik: p.costPriceQapik,
          },
        ],
        timeline: [],
      };

      const balances = deriveStockBalances(
        [],
        [dispatchedTransfer],
        [p],
        MOCK_ADMIN_WAREHOUSES
      );

      const destBal = balances.find((b) => b.variantId === v.id && b.warehouseId === 'wh-2');
      expect(destBal?.inTransit).toBe(4);
    });
  });

  describe('Negative Stock Enforcement & Privileged Override', () => {
    it('blocks outgoing stock transaction when quantity exceeds onHand without override', () => {
      const check = validateNegativeStockOperation(5, 8, false);
      expect(check.isValid).toBe(false);
      expect(check.error).toMatch(/Yetərsiz qalıq/);
      expect(check.error).toMatch(/Mənfi qalıq bloklanıb/);
    });

    it('requires a mandatory reason when negative stock override is active', () => {
      const checkWithoutReason = validateNegativeStockOperation(3, 7, true, '');
      expect(checkWithoutReason.isValid).toBe(false);
      expect(checkWithoutReason.error).toMatch(/səbəb qeyd olunmalıdır/);

      const checkWithReason = validateNegativeStockOperation(
        3,
        7,
        true,
        'Təcili müştəri sifarişi, faktiki mal vitrindədir'
      );
      expect(checkWithReason.isValid).toBe(true);
    });

    it('adapter throws ValidationError when confirming document with insufficient stock', async () => {
      await expect(
        adapter.createStockDocument({
          type: 'issue',
          status: 'confirmed',
          warehouseId: 'wh-2',
          lines: [
            {
              id: 'l-test',
              productId: SEEDED_CATALOG_PRODUCTS[0].id,
              productName: SEEDED_CATALOG_PRODUCTS[0].name,
              variantId: SEEDED_CATALOG_PRODUCTS[0].variants[0].id,
              variantSku: SEEDED_CATALOG_PRODUCTS[0].variants[0].sku,
              variantBarcode: SEEDED_CATALOG_PRODUCTS[0].variants[0].barcode,
              size: 'S',
              color: 'Ağ',
              quantity: 99999, // Impossible quantity
              currentOnHand: 6,
              unitCostQapik: toQapik(5000),
              totalCostQapik: toQapik(500000),
            },
          ],
          allowNegativeStockOverride: false,
        })
      ).rejects.toThrow(/Yetərsiz qalıq/);
    });
  });

  describe('Variant Matrix Generation (Size × Color Grid)', () => {
    it('builds a 2D matrix mapping size rows and color columns with cell metrics', async () => {
      const p = SEEDED_CATALOG_PRODUCTS[0];
      const matrixData = await adapter.getVariantMatrix(p.id, 'wh-1');

      expect(matrixData.productId).toBe(p.id);
      expect(matrixData.warehouseId).toBe('wh-1');
      expect(matrixData.sizes.length).toBeGreaterThan(0);
      expect(matrixData.colors.length).toBeGreaterThan(0);

      // Verify at least one cell has computed onHand
      const sampleSize = matrixData.sizes[0];
      const sampleColor = matrixData.colors[0];
      const cell = matrixData.matrix[sampleSize]?.[sampleColor];
      if (cell) {
        expect(cell.sku).toBeDefined();
        expect(typeof cell.onHand).toBe('number');
        expect(typeof cell.available).toBe('number');
      }
    });
  });

  describe('Physical Inventory Count & Automatic Adjustment', () => {
    it('approving count session generates an adjustment document that aligns ledger balances', async () => {
      const sessions = await adapter.getCountSessions();
      const reviewSession = sessions.find((s) => s.status === 'review');
      expect(reviewSession).toBeDefined();

      const { session, adjustmentDocument } = await adapter.approveCountSession(
        reviewSession!.id
      );

      expect(session.status).toBe('approved');
      expect(adjustmentDocument.type).toBe('adjustment');
      expect(adjustmentDocument.status).toBe('confirmed');
      expect(adjustmentDocument.lines.length).toBeGreaterThan(0);
    });
  });

  describe('Opening Balance Import Protection', () => {
    it('blocks running opening balance twice for the same location without privileged override', async () => {
      // wh-1 already has a seeded opening balance
      await expect(
        adapter.importOpeningBalance(
          'wh-1',
          [
            {
              barcode: '4760012391010',
              sku: 'TH-M-SH-101-WHT-S',
              name: 'Köynək',
              size: 'S',
              color: 'Ağ',
              quantity: 10,
              unitCostAzn: 50,
            },
          ],
          false // override = false
        )
      ).rejects.toThrow(/artıq.*ilkin qalıq daxil edilmişdir/);
    });

    it('allows opening balance import if override is checked with a valid reason', async () => {
      const doc = await adapter.importOpeningBalance(
        'wh-1',
        [
          {
            barcode: '4760012391010',
            sku: 'TH-M-SH-101-WHT-S',
            name: 'Köynək',
            size: 'S',
            color: 'Ağ',
            quantity: 5,
            unitCostAzn: 50,
          },
        ],
        true, // override = true
        'Rəhbərlik sərəncamı ilə yenidən açılış aktı tərtib edilir'
      );

      expect(doc.type).toBe('opening');
      expect(doc.status).toBe('confirmed');
    });
  });
});
