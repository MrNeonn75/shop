import { Qapik } from '../../../shared/utils/money';
import {
  ThreeWayMatchResult,
  ThreeWayMatchLineResult,
  MatchStatus,
  PurchaseOrderItem,
  GoodsReceiptItem,
  SupplierInvoiceLine,
  SupplierInvoice,
  PurchaseOrder,
  GoodsReceipt,
} from '../types';

export interface MatchOptions {
  toleranceQtyPercent?: number;   // default 0%
  tolerancePricePercent?: number; // default 0%
  qtyTolerancePercent?: number;   // alias
  priceTolerancePercent?: number; // alias
}

/**
 * Three-Way Match Engine: PO vs Goods Receipt vs Supplier Invoice.
 * Supports both parameter formats:
 * 1) (invoice: SupplierInvoice, po: PurchaseOrder, gr: GoodsReceipt | null, options)
 * 2) (poItems: PurchaseOrderItem[], grItems: GoodsReceiptItem[], invoiceLines: SupplierInvoiceLine[], options)
 */
export function calculateThreeWayMatch(
  arg1: PurchaseOrderItem[] | SupplierInvoice,
  arg2?: GoodsReceiptItem[] | PurchaseOrder,
  arg3?: SupplierInvoiceLine[] | GoodsReceipt | null,
  options: MatchOptions = {}
): ThreeWayMatchResult {
  const toleranceQtyPercent = options.qtyTolerancePercent ?? options.toleranceQtyPercent ?? 0;
  const tolerancePricePercent = options.priceTolerancePercent ?? options.tolerancePricePercent ?? 0;

  let poItems: PurchaseOrderItem[] = [];
  let grItems: GoodsReceiptItem[] = [];
  let invoiceLines: SupplierInvoiceLine[] = [];

  const isInvoiceFirst = Boolean(arg1 && typeof arg1 === 'object' && 'lines' in arg1);

  if (isInvoiceFirst) {
    const invoice = arg1 as SupplierInvoice;
    const po = arg2 as PurchaseOrder | undefined;
    const gr = arg3 as GoodsReceipt | null | undefined;

    // Check if Goods Receipt is missing entirely
    if (gr === null || gr === undefined) {
      const flags = ['Məhsul qəbulu (Goods Receipt) sənədi mövcud deyil'];
      const lines: ThreeWayMatchLineResult[] = (invoice.lines || []).map((invLine) => {
        const poLine = po?.items.find(
          (p) => p.sku === invLine.sku || (invLine.poItemId && p.id === invLine.poItemId)
        );
        const poUnitCost = poLine?.unitCost ?? (0 as Qapik);
        const priceDiff = (invLine.unitCost - poUnitCost) as Qapik;
        return {
          productId: invLine.productId,
          productName: invLine.productName,
          sku: invLine.sku,
          poQty: poLine?.orderedQty ?? 0,
          grQty: 0,
          invQty: invLine.invoicedQty,
          poUnitCost,
          invUnitCost: invLine.unitCost,
          qtyDiff: invLine.invoicedQty,
          priceDiff,
          priceDiffPercent: poUnitCost > 0 ? ((invLine.unitCost - poUnitCost) / poUnitCost) * 100 : 0,
          isQtyMatched: false,
          isPriceMatched: priceDiff === 0,
          isWithinTolerance: false,
          status: 'qty_mismatch' as MatchStatus,
          notes: 'Anbar qəbulu sənədi yoxdur',
        };
      });

      return {
        overallStatus: 'qty_mismatch',
        toleranceQtyPercent,
        tolerancePricePercent,
        isApprovedForPayment: false,
        canApproveForPayment: false,
        hasMismatch: true,
        flagMissingGR: true,
        flags,
        lines,
        checkedAt: new Date().toISOString(),
      };
    }

    poItems = po ? po.items : [];
    grItems = gr ? gr.items : [];
    invoiceLines = invoice.lines || [];
  } else {
    poItems = (arg1 as PurchaseOrderItem[]) || [];
    grItems = (arg2 as GoodsReceiptItem[]) || [];
    invoiceLines = (arg3 as SupplierInvoiceLine[]) || [];
  }

  const flags: string[] = [];
  const lines: ThreeWayMatchLineResult[] = [];

  // Group invoice lines by SKU (or ID)
  for (const invLine of invoiceLines) {
    const poLine = poItems.find(
      (p) => p.sku === invLine.sku || (invLine.poItemId && p.id === invLine.poItemId)
    );
    const grLine = grItems.find(
      (g) => g.sku === invLine.sku || (invLine.grItemId && g.id === invLine.grItemId)
    );

    const poQty = poLine?.orderedQty ?? 0;
    const grQty = grLine?.receivedNowQty ?? 0;
    const invQty = invLine.invoicedQty;

    const poUnitCost = poLine?.unitCost ?? (0 as Qapik);
    const invUnitCost = invLine.unitCost;

    const qtyDiff = invQty - grQty; // Positive means invoiced more than received
    const priceDiff = (invUnitCost - poUnitCost) as Qapik; // Positive means invoice is more expensive

    const priceDiffPercent =
      poUnitCost > 0 ? ((invUnitCost - poUnitCost) / poUnitCost) * 100 : 0;

    // Evaluate quantity match (invoice qty should match actual received qty in Goods Receipt)
    const qtyAllowedDelta = (grQty * toleranceQtyPercent) / 100;
    const isQtyExact = qtyDiff === 0;
    const isQtyWithinTolerance = Math.abs(qtyDiff) <= qtyAllowedDelta;

    // Evaluate price match (invoice unit price should match PO agreed unit price)
    const priceAllowedDelta = (poUnitCost * tolerancePricePercent) / 100;
    const isPriceExact = priceDiff === 0;
    const isPriceWithinTolerance = Math.abs(priceDiff) <= priceAllowedDelta;

    let lineStatus: MatchStatus;
    if (isQtyExact && isPriceExact) {
      lineStatus = 'exact_match';
    } else if (isQtyWithinTolerance && isPriceWithinTolerance) {
      lineStatus = 'tolerance_match';
    } else if (!isQtyWithinTolerance && !isPriceWithinTolerance) {
      lineStatus = 'both_mismatch';
      flags.push(`[${invLine.sku}] Say və qiymət kənarlaşması (Faktura: ${invQty} ədəd / ${invUnitCost} qəpik, Qəbul: ${grQty} ədəd, Sifariş: ${poUnitCost} qəpik)`);
    } else if (!isQtyWithinTolerance) {
      lineStatus = 'qty_mismatch';
      flags.push(`[${invLine.sku}] Say kənarlaşması: Faktura ${invQty} ədəd, Qəbul edilən ${grQty} ədəd`);
    } else {
      lineStatus = 'price_mismatch';
      flags.push(`[${invLine.sku}] Qiymət kənarlaşması: Faktura ${invUnitCost} qəpik, Sifariş ${poUnitCost} qəpik (%${priceDiffPercent.toFixed(1)})`);
    }

    lines.push({
      productId: invLine.productId,
      productName: invLine.productName,
      sku: invLine.sku,
      poQty,
      grQty,
      invQty,
      poUnitCost,
      invUnitCost,
      qtyDiff,
      priceDiff,
      priceDiffPercent,
      isQtyMatched: isQtyWithinTolerance,
      isPriceMatched: isPriceWithinTolerance,
      isWithinTolerance: isQtyWithinTolerance && isPriceWithinTolerance,
      status: lineStatus,
      notes:
        lineStatus !== 'exact_match'
          ? `Kənarlaşma: Say fərqi ${qtyDiff}, Qiymət fərqi ${priceDiff}`
          : undefined,
    });
  }

  // Determine overall status
  const hasBothMismatch = lines.some((l) => l.status === 'both_mismatch');
  const hasQtyMismatch = lines.some((l) => l.status === 'qty_mismatch' || l.status === 'quantity_mismatch');
  const hasPriceMismatch = lines.some((l) => l.status === 'price_mismatch');
  const hasToleranceMatch = lines.some((l) => l.status === 'tolerance_match' || l.status === 'match_within_tolerance');

  let overallStatus: MatchStatus = 'exact_match';
  let isApprovedForPayment = true;

  if (hasBothMismatch) {
    overallStatus = 'both_mismatch';
    isApprovedForPayment = false;
  } else if (hasQtyMismatch && hasPriceMismatch) {
    overallStatus = 'both_mismatch';
    isApprovedForPayment = false;
  } else if (hasQtyMismatch) {
    overallStatus = 'qty_mismatch';
    isApprovedForPayment = false;
  } else if (hasPriceMismatch) {
    overallStatus = 'price_mismatch';
    isApprovedForPayment = false;
  } else if (hasToleranceMatch) {
    overallStatus = 'tolerance_match';
    isApprovedForPayment = true; // within allowed tolerance
  }

  return {
    overallStatus,
    toleranceQtyPercent,
    tolerancePricePercent,
    isApprovedForPayment,
    canApproveForPayment: isApprovedForPayment,
    hasMismatch: !isApprovedForPayment,
    flagMissingGR: false,
    flags,
    lines,
    checkedAt: new Date().toISOString(),
  };
}
