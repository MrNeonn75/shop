import {
  StockMovement,
  StockBalance,
  StockAlertRule,
} from '../types';
import { Transfer } from '../../transfers/types';
import { CatalogProduct } from '../../catalog/types/catalog';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { toQapik, multiplyMoney, Qapik } from '../../../shared/utils/money';

export interface LedgerSummary {
  totalSkus: number;
  totalUnitsOnHand: number;
  totalUnitsAvailable: number;
  totalUnitsReserved: number;
  totalUnitsInTransit: number;
  totalValuationQapik: Qapik;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
  slowMovingCount: number;
  deadStockCount: number;
}

/**
 * Pure LEDGER derivation function.
 * Balances are NEVER stored statically or modified directly.
 * Every quantity is derived by accumulating immutable StockMovement records.
 */
export function deriveStockBalances(
  movements: StockMovement[],
  transfers: Transfer[],
  products: CatalogProduct[],
  warehouses: AdminWarehouse[],
  alertRules: StockAlertRule[] = [],
  _slowMovingDaysThreshold = 30,
  _deadStockDaysThreshold = 90,
  currentDate = new Date()
): StockBalance[] {
  const balances: StockBalance[] = [];
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

  // Calculate reserved stock by (variantId + sourceWarehouseId) from active transfers
  const reservedMap = new Map<string, number>();
  // Calculate in-transit stock by (variantId + destinationWarehouseId) from dispatched transfers
  const inTransitMap = new Map<string, number>();

  for (const transfer of transfers) {
    if (transfer.status === 'approved' || transfer.status === 'picking') {
      for (const item of transfer.items) {
        const key = `${item.variantId}_${transfer.sourceWarehouseId}`;
        const qtyToReserve = item.pickedQty > 0 ? item.pickedQty : item.requestedQty;
        reservedMap.set(key, (reservedMap.get(key) || 0) + qtyToReserve);
      }
    } else if (
      transfer.status === 'dispatched' ||
      transfer.status === 'in_transit' ||
      transfer.status === 'partially_received'
    ) {
      for (const item of transfer.items) {
        const key = `${item.variantId}_${transfer.destinationWarehouseId}`;
        const transitQty =
          item.remainingInTransit !== undefined
            ? item.remainingInTransit
            : item.dispatchedQty - (item.receivedQty || 0) - (item.damagedQty || 0) - (item.missingQty || 0);
        if (transitQty > 0) {
          inTransitMap.set(key, (inTransitMap.get(key) || 0) + transitQty);
        }
      }
    }
  }

  // Pre-index movements by (variantId + warehouseId)
  interface LedgerBucket {
    inQty: number;
    outQty: number;
    lastMovementDate?: string;
    lastSaleDate?: string;
    unitCostQapik: Qapik;
  }

  const bucketMap = new Map<string, LedgerBucket>();

  const getBucket = (variantId: string, warehouseId: string): LedgerBucket => {
    const key = `${variantId}_${warehouseId}`;
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        inQty: 0,
        outQty: 0,
        unitCostQapik: toQapik(0),
      };
      bucketMap.set(key, bucket);
    }
    return bucket;
  };

  // Sort movements chronologically to preserve accurate last timestamps & unit costs
  const sortedMovements = [...movements].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const m of sortedMovements) {
    // Inward flow to toWarehouse
    if (m.toWarehouseId) {
      const b = getBucket(m.variantId, m.toWarehouseId);
      b.inQty += m.quantity;
      b.lastMovementDate = m.timestamp;
      if (m.unitCostQapik > 0) {
        b.unitCostQapik = m.unitCostQapik;
      }
    }

    // Outward flow from fromWarehouse
    if (m.fromWarehouseId) {
      const b = getBucket(m.variantId, m.fromWarehouseId);
      b.outQty += m.quantity;
      b.lastMovementDate = m.timestamp;
      if (m.type === 'sale') {
        b.lastSaleDate = m.timestamp;
      }
      if (m.unitCostQapik > 0 && b.unitCostQapik === 0) {
        b.unitCostQapik = m.unitCostQapik;
      }
    }
  }

  // Iterate all products and variants across all active warehouses
  for (const product of products) {
    for (const variant of product.variants) {
      for (const warehouse of warehouses) {
        const key = `${variant.id}_${warehouse.id}`;
        const bucket = bucketMap.get(key);

        const onHand = bucket ? bucket.inQty - bucket.outQty : 0;
        const reserved = reservedMap.get(key) || 0;
        const available = onHand - reserved;
        const inTransit = inTransitMap.get(key) || 0;

        // Skip non-existent zero lines only if never had any movements, reservations or transit
        if (!bucket && reserved === 0 && inTransit === 0 && warehouse.type === 'in-transit') {
          continue;
        }

        // Determine min stock level based on alert rules
        let minLevel = product.minStockLevel || 5;
        const matchingRule = alertRules.find(
          (r) =>
            r.isActive &&
            ((r.scope === 'product' && r.targetId === product.id) ||
              (r.scope === 'warehouse' && r.targetId === warehouse.id) ||
              (r.scope === 'category' && r.targetId === product.categoryId) ||
              r.scope === 'global')
        );
        if (matchingRule) {
          minLevel = matchingRule.minQty;
        }

        // Cost valuation
        const unitCostQapik =
          variant.costPriceOverrideQapik ||
          bucket?.unitCostQapik ||
          product.costPriceQapik ||
          toQapik(0);
        const valuationQapik = onHand > 0 ? multiplyMoney(unitCostQapik, onHand) : toQapik(0);

        // Days without sale calculation
        let daysWithoutSale = 0;
        if (bucket?.lastSaleDate) {
          const saleTime = new Date(bucket.lastSaleDate).getTime();
          const diffMs = currentDate.getTime() - saleTime;
          daysWithoutSale = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        } else if (bucket?.lastMovementDate) {
          const mvTime = new Date(bucket.lastMovementDate).getTime();
          const diffMs = currentDate.getTime() - mvTime;
          daysWithoutSale = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        } else {
          daysWithoutSale = 120; // Default cold stock age
        }

        // Stock state
        let stockState: StockBalance['stockState'] = 'normal';
        if (onHand < 0) {
          stockState = 'negative';
        } else if (onHand === 0) {
          stockState = 'out_of_stock';
        } else if (onHand <= minLevel) {
          stockState = 'low';
        }

        const branch = warehouseMap.get(warehouse.id);

        balances.push({
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          productBarcode: product.barcode,
          section: product.section,
          type: product.type,
          categoryName: product.categoryName,
          brandName: product.brandName,
          variantId: variant.id,
          variantSku: variant.sku,
          variantBarcode: variant.barcode,
          size: variant.size,
          color: variant.color,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          branchId: branch?.branchId || 'branch-1',
          branchName: branch?.branchName || 'Baş Ofis / Mərkəz',
          onHand,
          reserved,
          available,
          inTransit,
          minLevel,
          unitCostQapik,
          valuationQapik,
          lastMovementDate: bucket?.lastMovementDate,
          lastSaleDate: bucket?.lastSaleDate,
          daysWithoutSale,
          stockState,
        });
      }
    }
  }

  return balances;
}

/**
 * Validates whether an outgoing stock transaction violates negative stock protection rules.
 */
export function validateNegativeStockOperation(
  currentOnHand: number,
  quantityToDecrease: number,
  allowOverride = false,
  overrideReason?: string
): { isValid: boolean; error?: string } {
  const resultingOnHand = currentOnHand - quantityToDecrease;

  if (resultingOnHand < 0) {
    if (!allowOverride) {
      return {
        isValid: false,
        error: `Yetərsiz qalıq: Mövcud qalıq ${currentOnHand} ədəd, tələb olunan ${quantityToDecrease} ədəd (Çatışmayan: ${Math.abs(resultingOnHand)}). Mənfi qalıq bloklanıb.`,
      };
    }

    if (!overrideReason || overrideReason.trim().length < 5) {
      return {
        isValid: false,
        error: 'Mənfi qalıq icazəsi üçün əsaslandırılmış səbəb qeyd olunmalıdır (minimum 5 simvol).',
      };
    }
  }

  return { isValid: true };
}

/**
 * Variant Matrix (Size × Color) structure for drill-down drawer.
 */
export interface VariantMatrixCell {
  variantId: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  onHand: number;
  available: number;
  reserved: number;
  inTransit: number;
  stockState: StockBalance['stockState'];
}

export interface VariantMatrixData {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  sizes: string[];
  colors: string[];
  matrix: Record<string, Record<string, VariantMatrixCell | null>>; // matrix[size][color]
  totalOnHand: number;
  totalAvailable: number;
  totalReserved: number;
}

export function buildVariantMatrix(
  product: CatalogProduct,
  warehouseId: string,
  warehouseName: string,
  balances: StockBalance[]
): VariantMatrixData {
  const sizes: string[] = Array.from(new Set(product.variants.map((v) => v.size)));
  const colors: string[] = Array.from(new Set(product.variants.map((v) => v.color)));

  const relevantBalances = balances.filter(
    (b) => b.productId === product.id && b.warehouseId === warehouseId
  );

  const matrix: Record<string, Record<string, VariantMatrixCell | null>> = {};
  for (const s of sizes) {
    matrix[s] = {};
    for (const c of colors) {
      matrix[s][c] = null;
    }
  }

  let totalOnHand = 0;
  let totalAvailable = 0;
  let totalReserved = 0;

  for (const variant of product.variants) {
    const bal = relevantBalances.find((b) => b.variantId === variant.id);
    const cell: VariantMatrixCell = {
      variantId: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      size: variant.size,
      color: variant.color,
      onHand: bal?.onHand || 0,
      available: bal?.available || 0,
      reserved: bal?.reserved || 0,
      inTransit: bal?.inTransit || 0,
      stockState: bal?.stockState || 'out_of_stock',
    };

    if (matrix[variant.size]) {
      matrix[variant.size][variant.color] = cell;
    }

    totalOnHand += cell.onHand;
    totalAvailable += cell.available;
    totalReserved += cell.reserved;
  }

  return {
    productId: product.id,
    productName: product.name,
    warehouseId,
    warehouseName,
    sizes,
    colors,
    matrix,
    totalOnHand,
    totalAvailable,
    totalReserved,
  };
}
