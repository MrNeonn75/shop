import {
  InventoryRepository,
  TransferRepository,
} from '../types';
import {
  StockMovement,
  StockBalance,
  StockDocument,
  InventoryCountSession,
  StockAlertRule,
  WarehouseBinZone,
  OpeningBalanceRecord,
  OpeningBalanceRow,
  StockFilterParams,
  MovementFilterParams,
  InventoryCountStatus,
} from '../../../features/inventory/types';
import {
  Transfer,
  TransferFilterParams,
  CreateTransferPayload,
  UpdatePickingPayload,
  ReceiveTransferPayload,
} from '../../../features/transfers/types';
import {
  deriveStockBalances,
  buildVariantMatrix,
  validateNegativeStockOperation,
  VariantMatrixData,
} from '../../../features/inventory/services/ledgerEngine';
import {
  SEEDED_CATALOG_PRODUCTS,
} from '../../../features/catalog/data/taxonomyData';
import { CatalogProduct } from '../../../features/catalog/types/catalog';
import {
  MOCK_ADMIN_WAREHOUSES,
  AdminWarehouse,
} from './adminMockData';
import { toQapik, addMoney, multiplyMoney, aznToQapik } from '../../utils/money';
import { PaginatedResult } from '../../types/models';
import { env } from '../../config/env';

export class ConcurrencyConflictError extends Error {
  status = 409;
  constructor(message = '409 Konflikt: Eynizamanlı dəyişiklik aşkarlandı. Zəhmət olmasa məlumatları yeniləyin və təkrar cəhd edin.') {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

export class ValidationError extends Error {
  status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Initial Seed movements simulating documented ledger entries
function generateInitialMovements(): StockMovement[] {
  const movements: StockMovement[] = [];
  let counter = 1000;

  const baseDate = new Date('2026-09-01T08:00:00Z');

  // 1. Initial Opening Receipts for Seeded Catalog Products into Central Warehouse (wh-1)
  for (const product of SEEDED_CATALOG_PRODUCTS.slice(0, 8)) {
    for (const variant of product.variants) {
      counter++;
      const qty = (variant.stockQty || 12) + 15;
      movements.push({
        id: `MV-${counter}`,
        timestamp: new Date(baseDate.getTime() + counter * 60000).toISOString(),
        type: 'receipt',
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productBarcode: product.barcode,
        variantId: variant.id,
        variantSku: variant.sku,
        variantBarcode: variant.barcode,
        size: variant.size,
        color: variant.color,
        toWarehouseId: 'wh-1',
        toWarehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
        quantity: qty,
        unitCostQapik: product.costPriceQapik,
        totalCostQapik: multiplyMoney(product.costPriceQapik, qty),
        referenceDocType: 'opening',
        referenceDocId: 'doc-init-01',
        referenceDocNumber: 'DOC-2026-00001',
        userId: 'usr-001',
        userName: 'Kamran Əliyev',
        notes: 'İlkin qalıqların baş kitaba salınması',
      });
    }
  }

  // 2. Dispatched and Received Stock to 28 May Branch Warehouse (wh-2)
  for (const product of SEEDED_CATALOG_PRODUCTS.slice(0, 5)) {
    for (const variant of product.variants.slice(0, 2)) {
      counter++;
      const qty = 8;
      // Transfer out from Central (wh-1) -> Transit (wh-4)
      movements.push({
        id: `MV-${counter}`,
        timestamp: '2026-09-15T10:00:00Z',
        type: 'transfer_out',
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productBarcode: product.barcode,
        variantId: variant.id,
        variantSku: variant.sku,
        variantBarcode: variant.barcode,
        size: variant.size,
        color: variant.color,
        fromWarehouseId: 'wh-1',
        fromWarehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
        toWarehouseId: 'wh-4',
        toWarehouseName: 'Filiallararası Tranzit Anbarı',
        quantity: qty,
        unitCostQapik: product.costPriceQapik,
        totalCostQapik: multiplyMoney(product.costPriceQapik, qty),
        referenceDocType: 'transfer',
        referenceDocId: 'tr-seeded-01',
        referenceDocNumber: 'TR-28M-2026-00001',
        userId: 'usr-005',
        userName: 'Vüqar İsmayılov',
        notes: 'Filiala paylama transferi',
      });

      counter++;
      // Transfer in from Transit (wh-4) -> 28 May (wh-2)
      movements.push({
        id: `MV-${counter}`,
        timestamp: '2026-09-15T15:30:00Z',
        type: 'transfer_in',
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productBarcode: product.barcode,
        variantId: variant.id,
        variantSku: variant.sku,
        variantBarcode: variant.barcode,
        size: variant.size,
        color: variant.color,
        fromWarehouseId: 'wh-4',
        fromWarehouseName: 'Filiallararası Tranzit Anbarı',
        toWarehouseId: 'wh-2',
        toWarehouseName: '28 May Filialının Alt Anbarı',
        quantity: qty,
        unitCostQapik: product.costPriceQapik,
        totalCostQapik: multiplyMoney(product.costPriceQapik, qty),
        referenceDocType: 'transfer',
        referenceDocId: 'tr-seeded-01',
        referenceDocNumber: 'TR-28M-2026-00001',
        userId: 'usr-003',
        userName: 'Rəşad Qasımov',
        notes: 'Filialda qəbul edildi',
      });
    }
  }

  // 3. Sales movements from 28 May Branch (wh-2)
  for (const product of SEEDED_CATALOG_PRODUCTS.slice(0, 3)) {
    const variant = product.variants[0];
    counter++;
    movements.push({
      id: `MV-${counter}`,
      timestamp: '2026-10-05T14:20:00Z',
      type: 'sale',
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productBarcode: product.barcode,
      variantId: variant.id,
      variantSku: variant.sku,
      variantBarcode: variant.barcode,
      size: variant.size,
      color: variant.color,
      fromWarehouseId: 'wh-2',
      fromWarehouseName: '28 May Filialının Alt Anbarı',
      quantity: 2,
      unitCostQapik: product.costPriceQapik,
      totalCostQapik: multiplyMoney(product.costPriceQapik, 2),
      referenceDocType: 'sale',
      referenceDocId: 'ck-pos-001',
      referenceDocNumber: 'CK-28M-2026-000142',
      userId: 'usr-004',
      userName: 'Aytən Həsənova',
      notes: 'Pərakəndə POS satışı',
    });
  }

  // 4. Sample Damaged Goods registration in wh-2
  const sampleVariant = SEEDED_CATALOG_PRODUCTS[0].variants[1];
  counter++;
  movements.push({
    id: `MV-${counter}`,
    timestamp: '2026-10-08T11:15:00Z',
    type: 'damaged',
    productId: SEEDED_CATALOG_PRODUCTS[0].id,
    productName: SEEDED_CATALOG_PRODUCTS[0].name,
    productSku: SEEDED_CATALOG_PRODUCTS[0].sku,
    productBarcode: SEEDED_CATALOG_PRODUCTS[0].barcode,
    variantId: sampleVariant.id,
    variantSku: sampleVariant.sku,
    variantBarcode: sampleVariant.barcode,
    size: sampleVariant.size,
    color: sampleVariant.color,
    fromWarehouseId: 'wh-2',
    fromWarehouseName: '28 May Filialının Alt Anbarı',
    quantity: 1,
    unitCostQapik: SEEDED_CATALOG_PRODUCTS[0].costPriceQapik,
    totalCostQapik: SEEDED_CATALOG_PRODUCTS[0].costPriceQapik,
    referenceDocType: 'damaged',
    referenceDocId: 'doc-dam-01',
    referenceDocNumber: 'DOC-2026-00008',
    userId: 'usr-003',
    userName: 'Rəşad Qasımov',
    reasonCode: 'zədəli_parça',
    classification: 'damaged',
    notes: 'Vitrin nümayişində fermuar qırılıb',
  });

  return movements;
}

// Initial Seed Transfers
function generateInitialTransfers(): Transfer[] {
  const p1 = SEEDED_CATALOG_PRODUCTS[0];
  const p2 = SEEDED_CATALOG_PRODUCTS[1];

  return [
    {
      id: 'tr-seeded-01',
      transferNumber: 'TR-28M-2026-00001',
      sourceWarehouseId: 'wh-1',
      sourceWarehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
      sourceBranchId: 'branch-1',
      sourceBranchName: 'Baş Ofis / Mərkəz',
      destinationWarehouseId: 'wh-2',
      destinationWarehouseName: '28 May Filialının Alt Anbarı',
      destinationBranchId: 'branch-1',
      destinationBranchName: '28 May Flaman Filialı',
      status: 'received',
      requestedDate: '2026-09-14',
      createdAt: '2026-09-14T09:00:00Z',
      submittedAt: '2026-09-14T10:00:00Z',
      approvedAt: '2026-09-14T11:00:00Z',
      pickingStartedAt: '2026-09-15T09:30:00Z',
      dispatchedAt: '2026-09-15T10:00:00Z',
      receivedAt: '2026-09-15T15:30:00Z',
      createdById: 'usr-003',
      createdByName: 'Rəşad Qasımov',
      approvedById: 'usr-002',
      approvedByName: 'Nərgiz Məmmədova',
      dispatchedById: 'usr-005',
      dispatchedByName: 'Vüqar İsmayılov',
      receivedById: 'usr-003',
      receivedByName: 'Rəşad Qasımov',
      notes: 'Mövsümi açılış üçün əsas köynəklərin köçürülməsi',
      items: [
        {
          id: 'ti-1',
          productId: p1.id,
          productName: p1.name,
          variantId: p1.variants[0].id,
          variantSku: p1.variants[0].sku,
          variantBarcode: p1.variants[0].barcode,
          size: p1.variants[0].size,
          color: p1.variants[0].color,
          availableAtSource: 25,
          requestedQty: 8,
          pickedQty: 8,
          dispatchedQty: 8,
          receivedQty: 8,
          damagedQty: 0,
          missingQty: 0,
          remainingInTransit: 0,
          unitCostQapik: p1.costPriceQapik,
        },
      ],
      timeline: [
        {
          id: 'tl-1',
          status: 'draft',
          timestamp: '2026-09-14T09:00:00Z',
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          userRole: 'Filial meneceri',
        },
        {
          id: 'tl-2',
          status: 'submitted',
          timestamp: '2026-09-14T10:00:00Z',
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          userRole: 'Filial meneceri',
        },
        {
          id: 'tl-3',
          status: 'approved',
          timestamp: '2026-09-14T11:00:00Z',
          userId: 'usr-002',
          userName: 'Nərgiz Məmmədova',
          userRole: 'Baş menecer',
        },
        {
          id: 'tl-4',
          status: 'dispatched',
          timestamp: '2026-09-15T10:00:00Z',
          userId: 'usr-005',
          userName: 'Vüqar İsmayılov',
          userRole: 'Anbardar',
          comment: 'Sürücü Eldəniz (90-BH-101)',
        },
        {
          id: 'tl-5',
          status: 'received',
          timestamp: '2026-09-15T15:30:00Z',
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          userRole: 'Filial meneceri',
          comment: 'Tam və salamat təhvil alındı',
        },
      ],
    },
    {
      id: 'tr-active-02',
      transferNumber: 'TR-GM-2026-00002',
      sourceWarehouseId: 'wh-1',
      sourceWarehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
      sourceBranchId: 'branch-1',
      sourceBranchName: 'Baş Ofis / Mərkəz',
      destinationWarehouseId: 'wh-3',
      destinationWarehouseName: 'Gənclik Mall Anbarı',
      destinationBranchId: 'branch-2',
      destinationBranchName: 'Gənclik Mall Filialı',
      status: 'dispatched', // Mal mənbə anbarı tərk etdi, tranzitdədir
      requestedDate: '2026-10-10',
      createdAt: '2026-10-10T08:30:00Z',
      submittedAt: '2026-10-10T09:00:00Z',
      approvedAt: '2026-10-10T10:15:00Z',
      pickingStartedAt: '2026-10-10T11:00:00Z',
      dispatchedAt: '2026-10-10T11:45:00Z',
      createdById: 'usr-003',
      createdByName: 'Rəşad Qasımov',
      approvedById: 'usr-002',
      approvedByName: 'Nərgiz Məmmədova',
      dispatchedById: 'usr-005',
      dispatchedByName: 'Vüqar İsmayılov',
      notes: 'Həftəsonu pik satış üçün təcili köçürmə',
      items: [
        {
          id: 'ti-201',
          productId: p1.id,
          productName: p1.name,
          variantId: p1.variants[0].id,
          variantSku: p1.variants[0].sku,
          variantBarcode: p1.variants[0].barcode,
          size: p1.variants[0].size,
          color: p1.variants[0].color,
          availableAtSource: 20,
          requestedQty: 10,
          pickedQty: 10,
          dispatchedQty: 10,
          receivedQty: 0,
          damagedQty: 0,
          missingQty: 0,
          remainingInTransit: 10,
          unitCostQapik: p1.costPriceQapik,
        },
        {
          id: 'ti-202',
          productId: p2.id,
          productName: p2.name,
          variantId: p2.variants[0].id,
          variantSku: p2.variants[0].sku,
          variantBarcode: p2.variants[0].barcode,
          size: p2.variants[0].size,
          color: p2.variants[0].color,
          availableAtSource: 18,
          requestedQty: 6,
          pickedQty: 6,
          dispatchedQty: 6,
          receivedQty: 0,
          damagedQty: 0,
          missingQty: 0,
          remainingInTransit: 6,
          unitCostQapik: p2.costPriceQapik,
        },
      ],
      timeline: [
        {
          id: 'tl-21',
          status: 'draft',
          timestamp: '2026-10-10T08:30:00Z',
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          userRole: 'Filial meneceri',
        },
        {
          id: 'tl-22',
          status: 'submitted',
          timestamp: '2026-10-10T09:00:00Z',
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          userRole: 'Filial meneceri',
        },
        {
          id: 'tl-23',
          status: 'approved',
          timestamp: '2026-10-10T10:15:00Z',
          userId: 'usr-002',
          userName: 'Nərgiz Məmmədova',
          userRole: 'Baş menecer',
        },
        {
          id: 'tl-24',
          status: 'picking',
          timestamp: '2026-10-10T11:00:00Z',
          userId: 'usr-005',
          userName: 'Vüqar İsmayılov',
          userRole: 'Anbardar',
        },
        {
          id: 'tl-25',
          status: 'dispatched',
          timestamp: '2026-10-10T11:45:00Z',
          userId: 'usr-005',
          userName: 'Vüqar İsmayılov',
          userRole: 'Anbardar',
          comment: 'Mal mənbə anbarı tərk etdi, tranzitdədir',
        },
      ],
    },
  ];
}

// Initial Seed Count Sessions
function generateInitialCountSessions(): InventoryCountSession[] {
  const p1 = SEEDED_CATALOG_PRODUCTS[0];
  const p2 = SEEDED_CATALOG_PRODUCTS[1];

  return [
    {
      id: 'cnt-01',
      sessionNumber: 'CNT-2026-00001',
      warehouseId: 'wh-2',
      warehouseName: '28 May Filialının Alt Anbarı',
      branchId: 'branch-1',
      branchName: '28 May Flaman Filialı',
      scope: 'full',
      isBlindCount: false,
      status: 'review', // Ready for manager variance review and approval
      createdAt: '2026-10-10T07:00:00Z',
      startedAt: '2026-10-10T07:15:00Z',
      snapshotFrozenAt: '2026-10-10T07:15:00Z',
      createdById: 'usr-003',
      createdByName: 'Rəşad Qasımov',
      notes: 'Rüblük inventarizasiya və vitrin uzlaşması',
      items: [
        {
          id: 'ci-1',
          productId: p1.id,
          productName: p1.name,
          variantId: p1.variants[0].id,
          variantSku: p1.variants[0].sku,
          variantBarcode: p1.variants[0].barcode,
          size: p1.variants[0].size,
          color: p1.variants[0].color,
          expectedQty: 6,
          countedQty: 7, // +1 Surplus
          varianceQty: 1,
          unitCostQapik: p1.costPriceQapik,
          varianceValueQapik: p1.costPriceQapik,
          recountFlag: false,
        },
        {
          id: 'ci-2',
          productId: p1.id,
          productName: p1.name,
          variantId: p1.variants[1].id,
          variantSku: p1.variants[1].sku,
          variantBarcode: p1.variants[1].barcode,
          size: p1.variants[1].size,
          color: p1.variants[1].color,
          expectedQty: 7,
          countedQty: 5, // -2 Deficit
          varianceQty: -2,
          unitCostQapik: p1.costPriceQapik,
          varianceValueQapik: multiplyMoney(p1.costPriceQapik, -2),
          recountFlag: true,
          notes: 'Vitrin arxası yenidən yoxlanılmalıdır',
        },
        {
          id: 'ci-3',
          productId: p2.id,
          productName: p2.name,
          variantId: p2.variants[0].id,
          variantSku: p2.variants[0].sku,
          variantBarcode: p2.variants[0].barcode,
          size: p2.variants[0].size,
          color: p2.variants[0].color,
          expectedQty: 8,
          countedQty: 8, // Exact match
          varianceQty: 0,
          unitCostQapik: p2.costPriceQapik,
          varianceValueQapik: toQapik(0),
          recountFlag: false,
        },
      ],
      scanLogs: [
        {
          id: 'log-1',
          timestamp: '2026-10-10T07:20:15Z',
          userId: 'usr-005',
          userName: 'Vüqar İsmayılov',
          variantSku: p1.variants[0].sku,
          barcode: p1.variants[0].barcode,
          deltaQty: 1,
          newCountedQty: 1,
          action: 'scan',
        },
      ],
    },
  ];
}

// Initial Seed Documents
function generateInitialDocuments(): StockDocument[] {
  const p1 = SEEDED_CATALOG_PRODUCTS[0];

  return [
    {
      id: 'doc-init-01',
      docNumber: 'DOC-2026-00001',
      type: 'opening',
      status: 'confirmed',
      warehouseId: 'wh-1',
      warehouseName: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
      branchId: 'branch-1',
      branchName: 'Baş Ofis / Mərkəz',
      createdAt: '2026-09-01T08:00:00Z',
      confirmedAt: '2026-09-01T08:05:00Z',
      createdById: 'usr-001',
      createdByName: 'Kamran Əliyev',
      notes: 'Sistemə ilkin qalıqların köçürülmə aktı',
      lines: [
        {
          id: 'dl-1',
          productId: p1.id,
          productName: p1.name,
          variantId: p1.variants[0].id,
          variantSku: p1.variants[0].sku,
          variantBarcode: p1.variants[0].barcode,
          size: p1.variants[0].size,
          color: p1.variants[0].color,
          quantity: 25,
          currentOnHand: 0,
          unitCostQapik: p1.costPriceQapik,
          totalCostQapik: multiplyMoney(p1.costPriceQapik, 25),
        },
      ],
      attachments: [
        {
          id: 'att-1',
          name: 'ilkin_qaliq_akt_01.pdf',
          sizeBytes: 124500,
          uploadedAt: '2026-09-01T08:02:00Z',
        },
      ],
      auditTrail: [
        {
          id: 'adt-1',
          timestamp: '2026-09-01T08:00:00Z',
          userId: 'usr-001',
          userName: 'Kamran Əliyev',
          action: 'created',
        },
        {
          id: 'adt-2',
          timestamp: '2026-09-01T08:05:00Z',
          userId: 'usr-001',
          userName: 'Kamran Əliyev',
          action: 'confirmed',
          details: 'Ledger hərəkətləri formalaşdırıldı',
        },
      ],
      totalValueQapik: multiplyMoney(p1.costPriceQapik, 25),
    },
    {
      id: 'doc-dam-01',
      docNumber: 'DOC-2026-00008',
      type: 'damaged',
      status: 'confirmed',
      warehouseId: 'wh-2',
      warehouseName: '28 May Filialının Alt Anbarı',
      branchId: 'branch-1',
      branchName: '28 May Flaman Filialı',
      createdAt: '2026-10-08T11:00:00Z',
      confirmedAt: '2026-10-08T11:15:00Z',
      createdById: 'usr-003',
      createdByName: 'Rəşad Qasımov',
      reasonCode: 'zədəli_parça',
      notes: 'Vitrin nümayişində fermuar qırılıb',
      lines: [
        {
          id: 'dl-8',
          productId: p1.id,
          productName: p1.name,
          variantId: p1.variants[1].id,
          variantSku: p1.variants[1].sku,
          variantBarcode: p1.variants[1].barcode,
          size: p1.variants[1].size,
          color: p1.variants[1].color,
          quantity: 1,
          currentOnHand: 7,
          unitCostQapik: p1.costPriceQapik,
          totalCostQapik: p1.costPriceQapik,
          classification: 'damaged',
          reasonCode: 'zədəli_parça',
        },
      ],
      attachments: [],
      auditTrail: [
        {
          id: 'adt-81',
          timestamp: '2026-10-08T11:00:00Z',
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          action: 'created',
        },
        {
          id: 'adt-82',
          timestamp: '2026-10-08T11:15:00Z',
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          action: 'confirmed',
        },
      ],
      totalValueQapik: p1.costPriceQapik,
    },
  ];
}

export class MockInventoryAdapter implements InventoryRepository, TransferRepository {
  private movements: StockMovement[] = generateInitialMovements();
  private transfers: Transfer[] = generateInitialTransfers();
  private documents: StockDocument[] = generateInitialDocuments();
  private countSessions: InventoryCountSession[] = generateInitialCountSessions();
  private warehouses: AdminWarehouse[] = JSON.parse(JSON.stringify(MOCK_ADMIN_WAREHOUSES));
  private alertRules: StockAlertRule[] = [
    {
      id: 'rule-global',
      scope: 'global',
      targetName: 'Bütün məhsullar üzrə susmaya görə',
      minQty: 5,
      autoReorderQty: 15,
      isActive: true,
    },
    {
      id: 'rule-cat-koynek',
      scope: 'category',
      targetId: 'cat-koynek',
      targetName: 'Köynək kateqoriyası',
      minQty: 8,
      autoReorderQty: 20,
      isActive: true,
    },
    {
      id: 'rule-wh-28m',
      scope: 'warehouse',
      targetId: 'wh-2',
      targetName: '28 May Filial Anbarı',
      minQty: 6,
      autoReorderQty: 10,
      isActive: true,
    },
  ];
  private warehouseBins: WarehouseBinZone[] = [
    { id: 'bin-1', warehouseId: 'wh-1', zone: 'Zolaq A', rack: 'Rəf 01', bin: 'Göz A-1', code: 'A-01-A1', description: 'Kişi Köynəkləri' },
    { id: 'bin-2', warehouseId: 'wh-1', zone: 'Zolaq A', rack: 'Rəf 02', bin: 'Göz A-2', code: 'A-02-A2', description: 'Kişi Şalvarları' },
    { id: 'bin-3', warehouseId: 'wh-1', zone: 'Zolaq B', rack: 'Rəf 01', bin: 'Göz B-1', code: 'B-01-B1', description: 'Qadın Kolleksiyası' },
    { id: 'bin-4', warehouseId: 'wh-2', zone: 'Zolaq 1', rack: 'Rəf 01', bin: 'Göz 01', code: '1-01-01', description: 'Vitrin Ehtiyatı' },
  ];
  private openingRecords: OpeningBalanceRecord[] = [
    {
      warehouseId: 'wh-1',
      importedAt: '2026-09-01T08:00:00Z',
      documentId: 'doc-init-01',
      documentNumber: 'DOC-2026-00001',
      totalSKUs: 32,
      totalUnits: 450,
      totalValueQapik: toQapik(3375000),
      importedBy: 'Kamran Əliyev',
    },
  ];

  // Idempotency cache map: Key -> Result
  private idempotencyCache = new Map<string, unknown>();

  private async delay(): Promise<void> {
    const ms = env.VITE_MOCK_LATENCY_MS || 250;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- LEDGER MOVEMENTS & BALANCES ---

  async getMovements(params?: MovementFilterParams): Promise<PaginatedResult<StockMovement>> {
    await this.delay();
    let list = [...this.movements];

    if (params?.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.productName.toLowerCase().includes(q) ||
          m.variantSku.toLowerCase().includes(q) ||
          m.variantBarcode.toLowerCase().includes(q) ||
          m.referenceDocNumber.toLowerCase().includes(q) ||
          m.userName.toLowerCase().includes(q)
      );
    }

    if (params?.type && params.type !== 'all') {
      list = list.filter((m) => m.type === params.type);
    }

    if (params?.warehouseId && params.warehouseId !== 'all') {
      list = list.filter(
        (m) => m.fromWarehouseId === params.warehouseId || m.toWarehouseId === params.warehouseId
      );
    }

    if (params?.productId) {
      list = list.filter((m) => m.productId === params.productId);
    }

    if (params?.variantId) {
      list = list.filter((m) => m.variantId === params.variantId);
    }

    if (params?.docNumber) {
      list = list.filter((m) => m.referenceDocNumber.toLowerCase().includes(params.docNumber!.toLowerCase()));
    }

    if (params?.userId) {
      list = list.filter((m) => m.userId === params.userId);
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      items: list,
      total: list.length,
      page: 1,
      pageSize: list.length,
      totalPages: 1,
    };
  }

  async getStockBalances(params?: StockFilterParams): Promise<StockBalance[]> {
    await this.delay();

    // Purely derive balances on the fly from movements, transfers, and catalog products!
    const allBalances = deriveStockBalances(
      this.movements,
      this.transfers,
      SEEDED_CATALOG_PRODUCTS,
      this.warehouses,
      this.alertRules
    );

    let filtered = allBalances;

    if (params?.search) {
      const q = params.search.toLowerCase().trim();
      filtered = filtered.filter(
        (b) =>
          b.productName.toLowerCase().includes(q) ||
          b.productSku.toLowerCase().includes(q) ||
          b.productBarcode.toLowerCase().includes(q) ||
          b.variantSku.toLowerCase().includes(q) ||
          b.variantBarcode.toLowerCase().includes(q) ||
          b.brandName.toLowerCase().includes(q) ||
          b.categoryName.toLowerCase().includes(q)
      );
    }

    if (params?.branchId && params.branchId !== 'all') {
      filtered = filtered.filter((b) => b.branchId === params.branchId);
    }

    if (params?.warehouseId && params.warehouseId !== 'all') {
      filtered = filtered.filter((b) => b.warehouseId === params.warehouseId);
    }

    if (params?.section && params.section !== 'all') {
      filtered = filtered.filter((b) => b.section === params.section);
    }

    if (params?.type && params.type !== 'all') {
      filtered = filtered.filter((b) => b.type === params.type);
    }

    if (params?.stockState && params.stockState !== 'all') {
      filtered = filtered.filter((b) => b.stockState === params.stockState);
    }

    // Tab-based view filters
    if (params?.tab === 'low') {
      filtered = filtered.filter((b) => b.stockState === 'low');
    } else if (params?.tab === 'out_of_stock') {
      filtered = filtered.filter((b) => b.stockState === 'out_of_stock');
    } else if (params?.tab === 'slow_moving') {
      const threshold = params.minDaysWithoutSale || 30;
      filtered = filtered.filter((b) => b.onHand > 0 && b.daysWithoutSale >= threshold && b.daysWithoutSale < 90);
    } else if (params?.tab === 'dead_stock') {
      const threshold = params.minDaysWithoutSale || 90;
      filtered = filtered.filter((b) => b.onHand > 0 && b.daysWithoutSale >= threshold);
    }

    return filtered;
  }

  async getVariantMatrix(productId: string, warehouseId: string): Promise<VariantMatrixData> {
    await this.delay();
    const product = SEEDED_CATALOG_PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }
    const warehouse = this.warehouses.find((w) => w.id === warehouseId);
    const balances = deriveStockBalances(
      this.movements,
      this.transfers,
      [product],
      this.warehouses,
      this.alertRules
    );

    return buildVariantMatrix(product, warehouseId, warehouse?.name || '', balances);
  }

  // --- STOCK DOCUMENTS ---

  async getStockDocuments(params?: { type?: string; status?: string; warehouseId?: string }): Promise<StockDocument[]> {
    await this.delay();
    let list = [...this.documents];

    if (params?.type && params.type !== 'all') {
      list = list.filter((d) => d.type === params.type);
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((d) => d.status === params.status);
    }
    if (params?.warehouseId && params.warehouseId !== 'all') {
      list = list.filter((d) => d.warehouseId === params.warehouseId);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  async getStockDocumentById(id: string): Promise<StockDocument | null> {
    await this.delay();
    const doc = this.documents.find((d) => d.id === id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  async createStockDocument(
    doc: Partial<StockDocument>,
    idempotencyKey?: string
  ): Promise<StockDocument> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as StockDocument;
    }

    const warehouse = this.warehouses.find((w) => w.id === doc.warehouseId) || this.warehouses[0];
    const newDocNumber = `DOC-2026-${(this.documents.length + 10).toString().padStart(5, '0')}`;

    let totalVal = toQapik(0);
    const processedLines = (doc.lines || []).map((l, idx) => {
      const lineCost = multiplyMoney(l.unitCostQapik || toQapik(0), l.quantity);
      totalVal = addMoney(totalVal, lineCost);
      return {
        ...l,
        id: `dl-${Date.now()}-${idx}`,
        totalCostQapik: lineCost,
      };
    });

    const newDoc: StockDocument = {
      id: `doc-${Date.now()}`,
      docNumber: newDocNumber,
      type: doc.type || 'receipt',
      status: doc.status || 'draft',
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      branchId: warehouse.branchId,
      branchName: warehouse.branchName,
      createdAt: new Date().toISOString(),
      createdById: doc.createdById || 'usr-001',
      createdByName: doc.createdByName || 'Kamran Əliyev',
      reasonCode: doc.reasonCode,
      notes: doc.notes,
      allowNegativeStockOverride: doc.allowNegativeStockOverride,
      negativeOverrideReason: doc.negativeOverrideReason,
      lines: processedLines,
      attachments: doc.attachments || [],
      auditTrail: [
        {
          id: `adt-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: doc.createdById || 'usr-001',
          userName: doc.createdByName || 'Kamran Əliyev',
          action: 'created',
          details: 'Sənəd yaradıldı (Qaralama)',
        },
      ],
      totalValueQapik: totalVal,
    };

    // If created directly in confirmed state, validate and write movements
    if (newDoc.status === 'confirmed') {
      this.executeDocumentLedgerConfirmation(newDoc);
    }

    this.documents.unshift(newDoc);

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, newDoc);
    }

    return newDoc;
  }

  async confirmStockDocument(id: string, idempotencyKey?: string): Promise<StockDocument> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as StockDocument;
    }

    const doc = this.documents.find((d) => d.id === id);
    if (!doc) {
      throw new Error(`Sənəd tapılmadı: ${id}`);
    }

    if (doc.status === 'confirmed') {
      throw new ConcurrencyConflictError('Bu sənəd artıq təsdiqlənib və yenidən icra oluna bilməz.');
    }

    // Execute negative stock check and generate immutable ledger movements
    this.executeDocumentLedgerConfirmation(doc);

    doc.status = 'confirmed';
    doc.confirmedAt = new Date().toISOString();
    doc.auditTrail.push({
      id: `adt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: 'usr-001',
      userName: 'Kamran Əliyev',
      action: 'confirmed',
      details: 'Sənəd təsdiqləndi və anbar hərəkətləri qeydə alındı',
    });

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, doc);
    }

    return doc;
  }

  private executeDocumentLedgerConfirmation(doc: StockDocument) {
    // Current balances snapshot
    const currentBalances = deriveStockBalances(
      this.movements,
      this.transfers,
      SEEDED_CATALOG_PRODUCTS,
      this.warehouses,
      this.alertRules
    );

    // Negative stock check for outgoing document types (issue, damaged, lost, or negative adjustments)
    const isOutgoing = doc.type === 'issue' || doc.type === 'damaged' || doc.type === 'lost';

    for (const line of doc.lines) {
      const bal = currentBalances.find(
        (b) => b.variantId === line.variantId && b.warehouseId === doc.warehouseId
      );
      const currentOnHand = bal?.onHand || 0;

      if (isOutgoing) {
        const validation = validateNegativeStockOperation(
          currentOnHand,
          line.quantity,
          doc.allowNegativeStockOverride,
          doc.negativeOverrideReason
        );
        if (!validation.isValid) {
          throw new ValidationError(validation.error!);
        }
      }

      // Generate StockMovement entry
      let movementType: StockMovement['type'] = 'receipt';
      let fromWh: string | undefined = undefined;
      let toWh: string | undefined = undefined;

      switch (doc.type) {
        case 'receipt':
        case 'opening':
          movementType = 'receipt';
          toWh = doc.warehouseId;
          break;
        case 'issue':
          movementType = 'issue';
          fromWh = doc.warehouseId;
          break;
        case 'adjustment':
          movementType = 'adjustment';
          if (line.quantity >= 0) {
            toWh = doc.warehouseId;
          } else {
            fromWh = doc.warehouseId;
          }
          break;
        case 'damaged':
          movementType = 'damaged';
          fromWh = doc.warehouseId;
          break;
        case 'lost':
          movementType = 'lost';
          fromWh = doc.warehouseId;
          break;
        case 'return_classification':
          movementType = 'return';
          toWh = doc.warehouseId;
          break;
      }

      const movementId = `MV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const movement: StockMovement = {
        id: movementId,
        timestamp: new Date().toISOString(),
        type: movementType,
        productId: line.productId,
        productName: line.productName,
        productSku: line.variantSku,
        productBarcode: line.variantBarcode,
        variantId: line.variantId,
        variantSku: line.variantSku,
        variantBarcode: line.variantBarcode,
        size: line.size,
        color: line.color,
        fromWarehouseId: fromWh,
        fromWarehouseName: fromWh ? doc.warehouseName : undefined,
        toWarehouseId: toWh,
        toWarehouseName: toWh ? doc.warehouseName : undefined,
        quantity: Math.abs(line.quantity),
        unitCostQapik: line.unitCostQapik,
        totalCostQapik: line.totalCostQapik,
        referenceDocType: doc.type as StockMovement['referenceDocType'],
        referenceDocId: doc.id,
        referenceDocNumber: doc.docNumber,
        userId: doc.createdById,
        userName: doc.createdByName,
        reasonCode: line.reasonCode || doc.reasonCode,
        notes: doc.notes,
        classification: line.classification,
      };

      this.movements.push(movement);
    }
  }

  // --- PHYSICAL INVENTORY COUNT ---

  async getCountSessions(params?: { status?: string; warehouseId?: string }): Promise<InventoryCountSession[]> {
    await this.delay();
    let list = [...this.countSessions];
    if (params?.status && params.status !== 'all') {
      list = list.filter((s) => s.status === params.status);
    }
    if (params?.warehouseId && params.warehouseId !== 'all') {
      list = list.filter((s) => s.warehouseId === params.warehouseId);
    }
    return list;
  }

  async getCountSessionById(id: string): Promise<InventoryCountSession | null> {
    await this.delay();
    const session = this.countSessions.find((s) => s.id === id);
    return session ? JSON.parse(JSON.stringify(session)) : null;
  }

  async createCountSession(
    payload: Partial<InventoryCountSession>,
    idempotencyKey?: string
  ): Promise<InventoryCountSession> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as InventoryCountSession;
    }

    const warehouse = this.warehouses.find((w) => w.id === payload.warehouseId) || this.warehouses[0];
    const sessionNumber = `CNT-2026-${(this.countSessions.length + 1).toString().padStart(5, '0')}`;

    // Capture frozen snapshot of current ledger balances for this warehouse
    const currentBalances = deriveStockBalances(
      this.movements,
      this.transfers,
      SEEDED_CATALOG_PRODUCTS,
      [warehouse],
      this.alertRules
    );

    // Build count items from snapshot
    let relevantBalances = currentBalances.filter((b) => b.warehouseId === warehouse.id);
    if (payload.scope === 'category' && payload.categoryFilter) {
      relevantBalances = relevantBalances.filter((b) => b.categoryName === payload.categoryFilter);
    } else if (payload.scope === 'random') {
      // Pick random 10 items
      relevantBalances = relevantBalances.slice(0, 10);
    }

    const items: InventoryCountSession['items'] = relevantBalances.map((b, idx) => ({
      id: `ci-${Date.now()}-${idx}`,
      productId: b.productId,
      productName: b.productName,
      variantId: b.variantId,
      variantSku: b.variantSku,
      variantBarcode: b.variantBarcode,
      size: b.size,
      color: b.color,
      expectedQty: b.onHand,
      countedQty: 0,
      varianceQty: 0 - b.onHand,
      unitCostQapik: b.unitCostQapik,
      varianceValueQapik: multiplyMoney(b.unitCostQapik, 0 - b.onHand),
      recountFlag: false,
    }));

    const session: InventoryCountSession = {
      id: `cnt-${Date.now()}`,
      sessionNumber,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      branchId: warehouse.branchId,
      branchName: warehouse.branchName,
      scope: payload.scope || 'full',
      categoryFilter: payload.categoryFilter,
      isBlindCount: Boolean(payload.isBlindCount),
      status: 'active',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      snapshotFrozenAt: new Date().toISOString(),
      createdById: payload.createdById || 'usr-001',
      createdByName: payload.createdByName || 'Kamran Əliyev',
      notes: payload.notes,
      items,
      scanLogs: [],
    };

    this.countSessions.unshift(session);

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, session);
    }

    return session;
  }

  async logCountScan(
    sessionId: string,
    payload: { barcodeOrSku: string; delta: number; isUndo?: boolean; manualQty?: number }
  ): Promise<InventoryCountSession> {
    await this.delay();
    const session = this.countSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Count session not found');

    const cleanInput = payload.barcodeOrSku.trim().toLowerCase();
    const item = session.items.find(
      (it) =>
        it.variantBarcode.toLowerCase() === cleanInput ||
        it.variantSku.toLowerCase() === cleanInput
    );

    if (!item) {
      throw new ValidationError(`Bu barkod/SKU sayım siyahısında tapılmadı: ${payload.barcodeOrSku}`);
    }

    if (payload.manualQty !== undefined) {
      item.countedQty = Math.max(0, payload.manualQty);
    } else {
      item.countedQty = Math.max(0, item.countedQty + payload.delta);
    }

    item.varianceQty = item.countedQty - item.expectedQty;
    item.varianceValueQapik = multiplyMoney(item.unitCostQapik, item.varianceQty);

    session.scanLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: 'usr-005',
      userName: 'Vüqar İsmayılov',
      variantSku: item.variantSku,
      barcode: item.variantBarcode,
      deltaQty: payload.manualQty !== undefined ? payload.manualQty : payload.delta,
      newCountedQty: item.countedQty,
      action: payload.isUndo ? 'undo' : payload.manualQty !== undefined ? 'manual_input' : 'scan',
    });

    return session;
  }

  async toggleRecountItem(sessionId: string, itemId: string): Promise<InventoryCountSession> {
    await this.delay();
    const session = this.countSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Count session not found');

    const item = session.items.find((i) => i.id === itemId);
    if (item) {
      item.recountFlag = !item.recountFlag;
    }
    return session;
  }

  async updateCountSessionStatus(sessionId: string, status: InventoryCountStatus): Promise<InventoryCountSession> {
    await this.delay();
    const session = this.countSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Count session not found');

    session.status = status;
    return session;
  }

  async approveCountSession(
    sessionId: string,
    idempotencyKey?: string
  ): Promise<{ session: InventoryCountSession; adjustmentDocument: StockDocument }> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as {
        session: InventoryCountSession;
        adjustmentDocument: StockDocument;
      };
    }

    const session = this.countSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Count session not found');

    if (session.status === 'approved') {
      throw new ConcurrencyConflictError('Bu sayım sessiyası artıq təsdiqlənib və yenidən korreksiya oluna bilməz.');
    }

    // Filter items with variances (varianceQty !== 0)
    const varianceItems = session.items.filter((i) => i.varianceQty !== 0);

    // Create and auto-confirm Stock Adjustment Document
    const adjLines: StockDocument['lines'] = varianceItems.map((v, idx) => ({
      id: `adj-l-${idx}`,
      productId: v.productId,
      productName: v.productName,
      variantId: v.variantId,
      variantSku: v.variantSku,
      variantBarcode: v.variantBarcode,
      size: v.size,
      color: v.color,
      quantity: v.varianceQty, // Can be positive (surplus) or negative (deficit)
      currentOnHand: v.expectedQty,
      unitCostQapik: v.unitCostQapik,
      totalCostQapik: multiplyMoney(v.unitCostQapik, Math.abs(v.varianceQty)),
      reasonCode: 'inventarizasiya_fərqi',
      notes: `Sayım Sessiyası #${session.sessionNumber} fərqinin qeydiyyatı`,
    }));

    const adjDoc = await this.createStockDocument({
      type: 'adjustment',
      status: 'confirmed',
      warehouseId: session.warehouseId,
      warehouseName: session.warehouseName,
      branchId: session.branchId,
      branchName: session.branchName,
      reasonCode: 'inventarizasiya_fərqi',
      notes: `İnventarizasiya #${session.sessionNumber} nəticəsi üzrə korreksiya sənədi. Cəmi fərqli bəndlər: ${varianceItems.length}`,
      lines: adjLines,
      allowNegativeStockOverride: true,
      negativeOverrideReason: `İnventarizasiya təsdiqi #${session.sessionNumber}`,
    });

    session.status = 'approved';
    session.approvedAt = new Date().toISOString();
    session.approvedById = 'usr-002';
    session.approvedByName = 'Nərgiz Məmmədova';
    session.adjustmentDocId = adjDoc.id;
    session.adjustmentDocNumber = adjDoc.docNumber;

    const result = { session, adjustmentDocument: adjDoc };

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, result);
    }

    return result;
  }

  // --- OPENING BALANCE IMPORT ---

  async importOpeningBalance(
    warehouseId: string,
    rows: OpeningBalanceRow[],
    override = false,
    overrideReason?: string,
    idempotencyKey?: string
  ): Promise<StockDocument> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as StockDocument;
    }

    // Check if location already has an opening balance record
    const existing = this.openingRecords.find((r) => r.warehouseId === warehouseId);
    if (existing && !override) {
      throw new ValidationError(
        `Bu anbar (${warehouseId}) üçün artıq ${existing.importedAt.slice(0, 10)} tarixində ilkin qalıq daxil edilmişdir (Sənəd: ${existing.documentNumber}). Təkrar daxil etmək üçün xüsusi icazə və əsaslandırılmış səbəb tələb olunur.`
      );
    }

    if (existing && override && (!overrideReason || overrideReason.trim().length < 5)) {
      throw new ValidationError('Təkrar ilkin qalıq idxalı üçün mütləq əsaslandırma qeyd edilməlidir.');
    }

    const warehouse = this.warehouses.find((w) => w.id === warehouseId) || this.warehouses[0];

    // Build lines from rows
    const lines: StockDocument['lines'] = rows.map((r, idx) => {
      const qapikPrice = aznToQapik(r.unitCostAzn);
      return {
        id: `op-l-${idx}`,
        productId: `prod-op-${idx}`,
        productName: r.name,
        variantId: `var-op-${idx}`,
        variantSku: r.sku,
        variantBarcode: r.barcode,
        size: r.size,
        color: r.color,
        quantity: Math.max(1, r.quantity),
        currentOnHand: 0,
        unitCostQapik: qapikPrice,
        totalCostQapik: multiplyMoney(qapikPrice, r.quantity),
        reasonCode: 'ilkin_qaliq',
      };
    });

    const doc = await this.createStockDocument({
      type: 'opening',
      status: 'confirmed',
      warehouseId,
      warehouseName: warehouse.name,
      branchId: warehouse.branchId,
      branchName: warehouse.branchName,
      reasonCode: 'ilkin_qaliq',
      notes: `İlkin qalıq idxal faylı əsasında yaradılmış sənəd. Sətir sayı: ${rows.length}`,
      lines,
    });

    // Save opening balance record
    const record: OpeningBalanceRecord = {
      warehouseId,
      importedAt: new Date().toISOString(),
      documentId: doc.id,
      documentNumber: doc.docNumber,
      totalSKUs: rows.length,
      totalUnits: rows.reduce((acc, r) => acc + r.quantity, 0),
      totalValueQapik: doc.totalValueQapik,
      importedBy: 'Kamran Əliyev',
    };
    this.openingRecords.push(record);

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, doc);
    }

    return doc;
  }

  async getOpeningBalanceRecords(): Promise<OpeningBalanceRecord[]> {
    await this.delay();
    return [...this.openingRecords];
  }

  // --- TRANSFERS ---

  async getTransfers(params?: TransferFilterParams): Promise<Transfer[]> {
    await this.delay();
    let list = [...this.transfers];

    if (params?.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.transferNumber.toLowerCase().includes(q) ||
          t.sourceWarehouseName.toLowerCase().includes(q) ||
          t.destinationWarehouseName.toLowerCase().includes(q) ||
          t.createdByName.toLowerCase().includes(q)
      );
    }

    if (params?.status && params.status !== 'all') {
      list = list.filter((t) => t.status === params.status);
    }

    if (params?.sourceWarehouseId && params.sourceWarehouseId !== 'all') {
      list = list.filter((t) => t.sourceWarehouseId === params.sourceWarehouseId);
    }

    if (params?.destinationWarehouseId && params.destinationWarehouseId !== 'all') {
      list = list.filter((t) => t.destinationWarehouseId === params.destinationWarehouseId);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  async getTransferById(id: string): Promise<Transfer | null> {
    await this.delay();
    const t = this.transfers.find((item) => item.id === id);
    return t ? JSON.parse(JSON.stringify(t)) : null;
  }

  async createTransfer(
    payload: CreateTransferPayload,
    idempotencyKey?: string
  ): Promise<Transfer> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as Transfer;
    }

    if (payload.sourceWarehouseId === payload.destinationWarehouseId) {
      throw new ValidationError('Mənbə anbar və təyinat anbarı eyni ola bilməz.');
    }

    const srcWh = this.warehouses.find((w) => w.id === payload.sourceWarehouseId);
    const destWh = this.warehouses.find((w) => w.id === payload.destinationWarehouseId);
    if (!srcWh || !destWh) throw new ValidationError('Seçilmiş anbar tapılmadı.');

    // Calculate current available stock for validation
    const currentBalances = deriveStockBalances(
      this.movements,
      this.transfers,
      SEEDED_CATALOG_PRODUCTS,
      [srcWh],
      this.alertRules
    );

    const items: Transfer['items'] = [];
    for (const itemPayload of payload.items) {
      let foundVariant: CatalogProduct['variants'][0] | undefined;
      let foundProduct: CatalogProduct | undefined;

      for (const p of SEEDED_CATALOG_PRODUCTS) {
        const v = p.variants.find((variant) => variant.id === itemPayload.variantId);
        if (v) {
          foundVariant = v;
          foundProduct = p;
          break;
        }
      }

      if (!foundVariant || !foundProduct) {
        throw new ValidationError(`Məhsul variantı tapılmadı: ${itemPayload.variantId}`);
      }

      const bal = currentBalances.find((b) => b.variantId === foundVariant!.id && b.warehouseId === srcWh.id);
      const available = bal ? bal.available : 0;

      if (itemPayload.requestedQty > available) {
        throw new ValidationError(
          `${foundProduct.name} (${foundVariant.sku}): Mənbə anbarda yetərli sərbəst qalıq yoxdur. Sərbəst: ${available} ədəd, tələb olunan: ${itemPayload.requestedQty} ədəd.`
        );
      }

      items.push({
        id: `ti-${Date.now()}-${items.length}`,
        productId: foundProduct.id,
        productName: foundProduct.name,
        variantId: foundVariant.id,
        variantSku: foundVariant.sku,
        variantBarcode: foundVariant.barcode,
        size: foundVariant.size,
        color: foundVariant.color,
        availableAtSource: available,
        requestedQty: itemPayload.requestedQty,
        pickedQty: 0,
        dispatchedQty: 0,
        receivedQty: 0,
        damagedQty: 0,
        missingQty: 0,
        remainingInTransit: 0,
        unitCostQapik: foundProduct.costPriceQapik,
      });
    }

    const transferNumber = `TR-${srcWh.code.replace('WH-', '')}-2026-${(this.transfers.length + 1).toString().padStart(5, '0')}`;

    const newTransfer: Transfer = {
      id: `tr-${Date.now()}`,
      transferNumber,
      sourceWarehouseId: srcWh.id,
      sourceWarehouseName: srcWh.name,
      sourceBranchId: srcWh.branchId,
      sourceBranchName: srcWh.branchName,
      destinationWarehouseId: destWh.id,
      destinationWarehouseName: destWh.name,
      destinationBranchId: destWh.branchId,
      destinationBranchName: destWh.branchName,
      status: 'draft',
      requestedDate: payload.requestedDate || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      createdById: 'usr-003',
      createdByName: 'Rəşad Qasımov',
      notes: payload.notes,
      items,
      timeline: [
        {
          id: `tl-${Date.now()}`,
          status: 'draft',
          timestamp: new Date().toISOString(),
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          userRole: 'Filial meneceri',
          comment: 'Transfer sorğusu qaralama olaraq açıldı',
        },
      ],
    };

    this.transfers.unshift(newTransfer);

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, newTransfer);
    }

    return newTransfer;
  }

  async submitTransfer(id: string, idempotencyKey?: string): Promise<Transfer> {
    await this.delay();
    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    if (t.status !== 'draft') {
      throw new ConcurrencyConflictError('Yalnız qaralama statusunda olan transfer təsdiqə göndərilə bilər.');
    }

    t.status = 'submitted';
    t.submittedAt = new Date().toISOString();
    t.timeline.push({
      id: `tl-${Date.now()}`,
      status: 'submitted',
      timestamp: new Date().toISOString(),
      userId: 'usr-003',
      userName: 'Rəşad Qasımov',
      userRole: 'Filial meneceri',
      comment: 'Təsdiq olunmaq üçün rəhbərliyə göndərildi',
    });

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  async approveTransfer(id: string, notes?: string, idempotencyKey?: string): Promise<Transfer> {
    await this.delay();
    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    if (t.status !== 'submitted') {
      throw new ConcurrencyConflictError('Yalnız təsdiq gözləyən transferlər təsdiqlənə bilər.');
    }

    t.status = 'approved';
    t.approvedAt = new Date().toISOString();
    t.approvedById = 'usr-002';
    t.approvedByName = 'Nərgiz Məmmədova';
    t.timeline.push({
      id: `tl-${Date.now()}`,
      status: 'approved',
      timestamp: new Date().toISOString(),
      userId: 'usr-002',
      userName: 'Nərgiz Məmmədova',
      userRole: 'Baş menecer',
      comment: notes || 'Transfer təsdiqləndi və anbar yığımına ötürüldü',
    });

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  async rejectTransfer(id: string, reason: string, idempotencyKey?: string): Promise<Transfer> {
    await this.delay();
    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    if (t.status !== 'submitted') {
      throw new ConcurrencyConflictError('Yalnız təsdiq gözləyən transferlər imtina edilə bilər.');
    }

    t.status = 'rejected';
    t.rejectionReason = reason;
    t.timeline.push({
      id: `tl-${Date.now()}`,
      status: 'rejected',
      timestamp: new Date().toISOString(),
      userId: 'usr-002',
      userName: 'Nərgiz Məmmədova',
      userRole: 'Baş menecer',
      comment: `İmtina edildi. Səbəb: ${reason}`,
    });

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  async startPicking(id: string, idempotencyKey?: string): Promise<Transfer> {
    await this.delay();
    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    if (t.status !== 'approved') {
      throw new ConcurrencyConflictError('Yalnız təsdiqlənmiş transferlər üçün yığım başlana bilər.');
    }

    t.status = 'picking';
    t.pickingStartedAt = new Date().toISOString();
    t.timeline.push({
      id: `tl-${Date.now()}`,
      status: 'picking',
      timestamp: new Date().toISOString(),
      userId: 'usr-005',
      userName: 'Vüqar İsmayılov',
      userRole: 'Anbardar',
      comment: 'Anbarda malların fiziki yığımına başlandı',
    });

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  async updatePicking(
    id: string,
    payload: UpdatePickingPayload,
    idempotencyKey?: string
  ): Promise<Transfer> {
    await this.delay();
    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    for (const update of payload.items) {
      const item = t.items.find((i) => i.id === update.itemId);
      if (item) {
        item.pickedQty = update.pickedQty;
        item.shortPickReason = update.shortPickReason;
      }
    }

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  async dispatchTransfer(id: string, idempotencyKey?: string): Promise<Transfer> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as Transfer;
    }

    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    if (t.status !== 'picking' && t.status !== 'approved') {
      throw new ConcurrencyConflictError('Yalnız yığım mərhələsində olan transfer yola salına bilər.');
    }

    // Set dispatched quantities and in-transit quantities
    for (const item of t.items) {
      item.dispatchedQty = item.pickedQty > 0 ? item.pickedQty : item.requestedQty;
      item.remainingInTransit = item.dispatchedQty;

      // LEDGER ACTION: Stock leaves source warehouse and moves to transit pool (wh-4)
      const movementId = `MV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.movements.push({
        id: movementId,
        timestamp: new Date().toISOString(),
        type: 'transfer_out',
        productId: item.productId,
        productName: item.productName,
        productSku: item.variantSku,
        productBarcode: item.variantBarcode,
        variantId: item.variantId,
        variantSku: item.variantSku,
        variantBarcode: item.variantBarcode,
        size: item.size,
        color: item.color,
        fromWarehouseId: t.sourceWarehouseId,
        fromWarehouseName: t.sourceWarehouseName,
        toWarehouseId: 'wh-4',
        toWarehouseName: 'Filiallararası Tranzit Anbarı',
        quantity: item.dispatchedQty,
        unitCostQapik: item.unitCostQapik,
        totalCostQapik: multiplyMoney(item.unitCostQapik, item.dispatchedQty),
        referenceDocType: 'transfer',
        referenceDocId: t.id,
        referenceDocNumber: t.transferNumber,
        userId: 'usr-005',
        userName: 'Vüqar İsmayılov',
        notes: 'Mal mənbə anbarı tərk etdi, tranzitdədir',
      });
    }

    t.status = 'dispatched';
    t.dispatchedAt = new Date().toISOString();
    t.dispatchedById = 'usr-005';
    t.dispatchedByName = 'Vüqar İsmayılov';
    t.timeline.push({
      id: `tl-${Date.now()}`,
      status: 'dispatched',
      timestamp: new Date().toISOString(),
      userId: 'usr-005',
      userName: 'Vüqar İsmayılov',
      userRole: 'Anbardar',
      comment: 'Mal mənbə anbarı tərk etdi, tranzitdədir',
    });

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  async receiveTransfer(
    id: string,
    payload: ReceiveTransferPayload,
    idempotencyKey?: string
  ): Promise<Transfer> {
    await this.delay();

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as Transfer;
    }

    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    if (t.status === 'received') {
      throw new ConcurrencyConflictError('Bu transfer artıq tam qəbul edilib və təkrarlana bilməz.');
    }

    if (t.status !== 'dispatched' && t.status !== 'in_transit' && t.status !== 'partially_received') {
      throw new ConcurrencyConflictError('Yalnız yolda olan transferlər qəbul edilə bilər.');
    }

    let allFulfilled = true;

    for (const update of payload.items) {
      const item = t.items.find((i) => i.id === update.itemId);
      if (!item) continue;

      const receivedNow = update.receivedQty || 0;
      const damagedNow = update.damagedQty || 0;
      const missingNow = update.missingQty || 0;

      item.receivedQty += receivedNow;
      item.damagedQty += damagedNow;
      item.missingQty += missingNow;
      item.discrepancyReason = update.discrepancyReason;

      const totalAccountedFor = item.receivedQty + item.damagedQty + item.missingQty;
      item.remainingInTransit = Math.max(0, item.dispatchedQty - totalAccountedFor);

      if (item.remainingInTransit > 0) {
        allFulfilled = false;
      }

      // LEDGER ACTION: Received units leave transit (wh-4) and enter destination warehouse
      if (receivedNow > 0) {
        this.movements.push({
          id: `MV-${Date.now()}-rcv-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toISOString(),
          type: 'transfer_in',
          productId: item.productId,
          productName: item.productName,
          productSku: item.variantSku,
          productBarcode: item.variantBarcode,
          variantId: item.variantId,
          variantSku: item.variantSku,
          variantBarcode: item.variantBarcode,
          size: item.size,
          color: item.color,
          fromWarehouseId: 'wh-4',
          fromWarehouseName: 'Filiallararası Tranzit Anbarı',
          toWarehouseId: t.destinationWarehouseId,
          toWarehouseName: t.destinationWarehouseName,
          quantity: receivedNow,
          unitCostQapik: item.unitCostQapik,
          totalCostQapik: multiplyMoney(item.unitCostQapik, receivedNow),
          referenceDocType: 'transfer',
          referenceDocId: t.id,
          referenceDocNumber: t.transferNumber,
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          notes: 'Təyinat anbarında təhvil alındı',
        });
      }

      // If damaged, register damaged movement
      if (damagedNow > 0) {
        this.movements.push({
          id: `MV-${Date.now()}-dmg-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toISOString(),
          type: 'damaged',
          productId: item.productId,
          productName: item.productName,
          productSku: item.variantSku,
          productBarcode: item.variantBarcode,
          variantId: item.variantId,
          variantSku: item.variantSku,
          variantBarcode: item.variantBarcode,
          size: item.size,
          color: item.color,
          fromWarehouseId: 'wh-4',
          fromWarehouseName: 'Filiallararası Tranzit Anbarı',
          toWarehouseId: t.destinationWarehouseId,
          toWarehouseName: t.destinationWarehouseName,
          quantity: damagedNow,
          unitCostQapik: item.unitCostQapik,
          totalCostQapik: multiplyMoney(item.unitCostQapik, damagedNow),
          referenceDocType: 'damaged',
          referenceDocId: t.id,
          referenceDocNumber: t.transferNumber,
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          reasonCode: update.discrepancyReason || 'daşınmada_zədələnmə',
          notes: 'Qəbul zamanı zədəli aşkarlandı',
        });
      }

      // If missing/lost in transit
      if (missingNow > 0) {
        this.movements.push({
          id: `MV-${Date.now()}-lost-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toISOString(),
          type: 'lost',
          productId: item.productId,
          productName: item.productName,
          productSku: item.variantSku,
          productBarcode: item.variantBarcode,
          variantId: item.variantId,
          variantSku: item.variantSku,
          variantBarcode: item.variantBarcode,
          size: item.size,
          color: item.color,
          fromWarehouseId: 'wh-4',
          fromWarehouseName: 'Filiallararası Tranzit Anbarı',
          quantity: missingNow,
          unitCostQapik: item.unitCostQapik,
          totalCostQapik: multiplyMoney(item.unitCostQapik, missingNow),
          referenceDocType: 'lost',
          referenceDocId: t.id,
          referenceDocNumber: t.transferNumber,
          userId: 'usr-003',
          userName: 'Rəşad Qasımov',
          reasonCode: update.discrepancyReason || 'daşınmada_əskiklik',
          notes: 'Yolda itmiş / çatışmayan mal',
        });
      }
    }

    t.status = allFulfilled ? 'received' : 'partially_received';
    t.receivedAt = new Date().toISOString();
    t.receivedById = 'usr-003';
    t.receivedByName = 'Rəşad Qasımov';

    t.timeline.push({
      id: `tl-${Date.now()}`,
      status: t.status,
      timestamp: new Date().toISOString(),
      userId: 'usr-003',
      userName: 'Rəşad Qasımov',
      userRole: 'Filial meneceri',
      comment: allFulfilled
        ? 'Bütün mallar təhvil alındı və proses tamamlandı'
        : 'Qismən qəbul edildi. Qalan mallar tranzitdədir',
    });

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  async cancelTransfer(id: string, reason: string, idempotencyKey?: string): Promise<Transfer> {
    await this.delay();
    const t = this.transfers.find((tr) => tr.id === id);
    if (!t) throw new Error('Transfer tapılmadı');

    if (t.status === 'dispatched' || t.status === 'in_transit' || t.status === 'received' || t.status === 'partially_received') {
      throw new ValidationError('Yola salınmış və ya artıq qəbul edilmiş transfer ləğv edilə bilməz.');
    }

    t.status = 'cancelled';
    t.cancellationReason = reason;
    t.timeline.push({
      id: `tl-${Date.now()}`,
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      userId: 'usr-003',
      userName: 'Rəşad Qasımov',
      userRole: 'Filial meneceri',
      comment: `Ləğv edildi. Rezervasiya azad edildi. Səbəb: ${reason}`,
    });

    if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, t);
    return t;
  }

  // --- ALERTS & WAREHOUSES ---

  async getAlertRules(): Promise<StockAlertRule[]> {
    await this.delay();
    return [...this.alertRules];
  }

  async saveAlertRule(rule: Partial<StockAlertRule>): Promise<StockAlertRule> {
    await this.delay();
    if (rule.id) {
      const idx = this.alertRules.findIndex((r) => r.id === rule.id);
      if (idx !== -1) {
        this.alertRules[idx] = { ...this.alertRules[idx], ...rule } as StockAlertRule;
        return this.alertRules[idx];
      }
    }
    const newRule: StockAlertRule = {
      id: `rule-${Date.now()}`,
      scope: rule.scope || 'global',
      targetId: rule.targetId,
      targetName: rule.targetName || 'Yeni limit qaydası',
      minQty: rule.minQty || 5,
      autoReorderQty: rule.autoReorderQty || 10,
      isActive: rule.isActive ?? true,
    };
    this.alertRules.push(newRule);
    return newRule;
  }

  async deleteAlertRule(id: string): Promise<boolean> {
    await this.delay();
    this.alertRules = this.alertRules.filter((r) => r.id !== id);
    return true;
  }

  async getWarehouses(): Promise<AdminWarehouse[]> {
    await this.delay();
    return [...this.warehouses];
  }

  async getWarehouseById(id: string): Promise<AdminWarehouse | null> {
    await this.delay();
    const w = this.warehouses.find((item) => item.id === id);
    return w ? JSON.parse(JSON.stringify(w)) : null;
  }

  async getWarehouseBins(warehouseId: string): Promise<WarehouseBinZone[]> {
    await this.delay();
    return this.warehouseBins.filter((b) => b.warehouseId === warehouseId);
  }
}
