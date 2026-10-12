import { Qapik } from '../../../shared/utils/money';
import { SupplierInvoice, PayablesAgingBucket } from '../types';

/**
 * Calculates Payables Aging Buckets:
 * 0-30 days, 31-60 days, 61-90 days, 90+ days.
 * Based on invoice dueDate compared to referenceDate (defaults to today).
 */
export function calculatePayablesAging(
  invoices: SupplierInvoice[],
  referenceDate: string | Date = new Date()
): PayablesAgingBucket[] {
  const refTime = (referenceDate instanceof Date ? referenceDate : new Date(referenceDate)).getTime();
  const bucketMap = new Map<string, PayablesAgingBucket>();

  for (const inv of invoices) {
    // Only count unpaid or partially paid invoices with positive outstanding amount
    if (inv.status === 'paid' || inv.status === 'cancelled' || inv.outstandingAmount <= 0) {
      continue;
    }

    const dueTime = new Date(inv.dueDate).getTime();
    // Days past due (if positive, overdue; if negative or 0, current)
    const diffDays = Math.floor((refTime - dueTime) / (1000 * 60 * 60 * 24));

    if (!bucketMap.has(inv.supplierId)) {
      bucketMap.set(inv.supplierId, {
        supplierId: inv.supplierId,
        supplierName: inv.supplierName,
        taxId: inv.supplierTaxId,
        current0To30: 0 as Qapik,
        days31To60: 0 as Qapik,
        days61To90: 0 as Qapik,
        days90Plus: 0 as Qapik,
        totalPayable: 0 as Qapik,
      });
    }

    const bucket = bucketMap.get(inv.supplierId)!;
    bucket.totalPayable = (bucket.totalPayable + inv.outstandingAmount) as Qapik;

    if (diffDays <= 30) {
      bucket.current0To30 = (bucket.current0To30 + inv.outstandingAmount) as Qapik;
    } else if (diffDays <= 60) {
      bucket.days31To60 = (bucket.days31To60 + inv.outstandingAmount) as Qapik;
    } else if (diffDays <= 90) {
      bucket.days61To90 = (bucket.days61To90 + inv.outstandingAmount) as Qapik;
    } else {
      bucket.days90Plus = (bucket.days90Plus + inv.outstandingAmount) as Qapik;
    }
  }

  return Array.from(bucketMap.values());
}

