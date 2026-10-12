import { AccountMovement, ExpenseRecord } from '../types';

export interface ReversalResult<T> {
  original: T;
  reversal: T;
}

/**
 * Creates a non-destructive reversal (storno) for a finalized account movement.
 * CRITICAL RULE: Finalized financial records are NEVER deleted!
 */
export function reverseAccountMovement(
  original: AccountMovement,
  reason: string,
  performedBy: string,
  newDocNumber: string
): ReversalResult<AccountMovement> {
  if (original.isReversed) {
    throw new Error(`Bu əməliyyat artıq ləğv edilib (${original.documentNumber}).`);
  }
  if (original.isReversal) {
    throw new Error('Ləğvetmə (storno) əməliyyatının özünü yenidən ləğv etmək olmaz.');
  }
  if (!reason || reason.trim().length < 5) {
    throw new Error('Ləğvetmə üçün əsaslandırılmış səbəb qeyd edilməlidir (minimum 5 simvol).');
  }

  const reversalId = `rev-mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const updatedOriginal: AccountMovement = {
    ...original,
    isReversed: true,
    reversalReason: reason.trim(),
    reversedByMovementId: reversalId,
  };

  // Reversal swaps from and to accounts or acts as an exact opposite offsetting entry
  const reversalEntry: AccountMovement = {
    id: reversalId,
    documentNumber: newDocNumber,
    date: new Date().toISOString().slice(0, 10),
    type: original.type,
    fromAccountId: original.toAccountId,
    fromAccountName: original.toAccountName,
    toAccountId: original.fromAccountId,
    toAccountName: original.fromAccountName,
    amountQapik: original.amountQapik,
    branchId: original.branchId,
    branchName: original.branchName,
    referenceDocType: 'reversal',
    referenceDocId: original.id,
    referenceDocNumber: original.documentNumber,
    description: `Ləğvetmə / Storno: ${original.documentNumber} (${original.description}) — Səbəb: ${reason.trim()}`,
    performedBy,
    isReversal: true,
    reversesMovementId: original.id,
    createdAt: new Date().toISOString(),
  };

  return {
    original: updatedOriginal,
    reversal: reversalEntry,
  };
}

/**
 * Creates a non-destructive reversal for a paid expense record.
 */
export function reverseExpenseRecord(
  original: ExpenseRecord,
  reason: string,
  performedBy: string,
  newDocNumber: string
): ReversalResult<ExpenseRecord> {
  if (original.isReversed) {
    throw new Error(`Bu xərc artıq ləğv edilib (${original.documentNumber}).`);
  }
  if (original.isReversal) {
    throw new Error('Ləğvetmə (storno) xərcini yenidən ləğv etmək olmaz.');
  }
  if (!reason || reason.trim().length < 5) {
    throw new Error('Xərcin ləğvi üçün əsaslandırılmış səbəb qeyd edilməlidir (minimum 5 simvol).');
  }

  const reversalId = `rev-exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const updatedOriginal: ExpenseRecord = {
    ...original,
    status: 'reversed',
    isReversed: true,
    reversalReason: reason.trim(),
    reversedByExpenseId: reversalId,
    updatedAt: new Date().toISOString(),
  };

  const reversalRecord: ExpenseRecord = {
    ...original,
    id: reversalId,
    documentNumber: newDocNumber,
    date: new Date().toISOString().slice(0, 10),
    status: 'reversed',
    description: `Ləğvetmə (Storno): ${original.documentNumber} (${original.description}) — Səbəb: ${reason.trim()}`,
    isReversal: true,
    reversesExpenseId: original.id,
    approvedBy: performedBy,
    approvedAt: new Date().toISOString(),
    submittedBy: performedBy,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    original: updatedOriginal,
    reversal: reversalRecord,
  };
}
