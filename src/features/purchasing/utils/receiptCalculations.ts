import { PurchaseOrderItem, GoodsReceiptItem, DiscrepancyReport } from '../types';

export interface ReceiptLineInput {
  poItemId: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  orderedQty: number;
  previouslyReceivedQty: number;
  receivedNowQty: number;
  rejectedQty: number;
  damagedQty: number;
  reasonCode?: string;
  notes?: string;
}

export interface ReceiptValidationResult {
  isValid: boolean;
  errors: Record<string, string>; // keyed by line index or sku
  totalReceived: number;
  totalDamaged: number;
  totalRejected: number;
}

/**
 * Validates goods receipt line quantities against PO quantities with tolerance limits.
 */
export function validateReceiptLines(
  lines: ReceiptLineInput[],
  tolerancePercent = 0 // default 0% over-receipt tolerance
): ReceiptValidationResult {
  const errors: Record<string, string> = {};
  let totalReceived = 0;
  let totalDamaged = 0;
  let totalRejected = 0;

  lines.forEach((line, index) => {
    const key = `line_${index}_${line.sku}`;

    if (line.receivedNowQty < 0) {
      errors[`${key}_received`] = 'Qəbul edilən say mənfi ola bilməz';
    }
    if (line.rejectedQty < 0) {
      errors[`${key}_rejected`] = 'İmtina sayı mənfi ola bilməz';
    }
    if (line.damagedQty < 0) {
      errors[`${key}_damaged`] = 'Zədələnmiş say mənfi ola bilməz';
    }

    const remainingToOrder = line.orderedQty - line.previouslyReceivedQty;
    const maxAllowed = Math.floor(line.orderedQty * (1 + tolerancePercent / 100)) - line.previouslyReceivedQty;

    if (line.receivedNowQty > maxAllowed) {
      const errMsg = `Həddən artıq qəbul qadağandır: Sifariş üzrə qalıq ${remainingToOrder} ədəd, daxil edilən ${line.receivedNowQty} ədəd icazə verilən maksimum saydan çoxdur (${maxAllowed} ədəd)`;
      errors[`${key}_over_receipt`] = errMsg;
      if (line.poItemId) {
        errors[line.poItemId] = errMsg;
      }
    }

    if ((line.rejectedQty > 0 || line.damagedQty > 0) && !line.reasonCode && !line.notes) {
      const reasonMsg = 'Zədə və ya imtina qeyd edildikdə səbəb mütləq göstərilməlidir (səbəb qeyd edilməlidir)';
      errors[`${key}_reason`] = reasonMsg;
      if (line.poItemId) {
        errors[line.poItemId] = reasonMsg;
      }
    }

    totalReceived += line.receivedNowQty;
    totalDamaged += line.damagedQty;
    totalRejected += line.rejectedQty;
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    totalReceived,
    totalDamaged,
    totalRejected,
  };
}

/**
 * Generate Discrepancy Report comparing PO ordered quantities and GR received quantities.
 */
export function generateDiscrepancyReport(
  poNumber: string,
  grNumber: string,
  poItems: PurchaseOrderItem[],
  grItems: GoodsReceiptItem[]
): DiscrepancyReport {
  let hasDiscrepancy = false;
  const lines = poItems.map((po) => {
    const gr = grItems.find((g) => g.sku === po.sku || g.poItemId === po.id);
    const received = gr?.receivedNowQty ?? 0;
    const damaged = gr?.damagedQty ?? 0;
    const rejected = gr?.rejectedQty ?? 0;
    const diff = (po.previouslyReceivedQty + received) - po.orderedQty;

    const lineHasDiscrepancy = diff !== 0 || damaged > 0 || rejected > 0;
    if (lineHasDiscrepancy) {
      hasDiscrepancy = true;
    }

    return {
      sku: po.sku,
      productName: po.productName,
      size: po.size,
      color: po.color,
      orderedQty: po.orderedQty,
      receivedQty: received,
      rejectedQty: rejected,
      damagedQty: damaged,
      discrepancyQty: diff,
      unitCost: po.unitCost,
      varianceAmount: (diff * po.unitCost) as import('../../../shared/utils/money').Qapik,
      reason: gr?.reasonCode || gr?.notes,
    };
  });

  return {
    poNumber,
    grNumber,
    hasDiscrepancy,
    lines,
  };
}

