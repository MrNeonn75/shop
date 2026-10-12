import { AccountMovement, BankStatementLine } from '../types';

export interface AutoMatchSummary {
  matchedCount: number;
  unmatchedCount: number;
  lines: BankStatementLine[];
}

/**
 * Auto-matches bank statement rows against system account movements.
 * Matching heuristics:
 * 1. High confidence (95% - 100%): Exact absolute amount match, date within +/- 2 days, and matching reference/doc number.
 * 2. Medium confidence (80% - 90%): Exact absolute amount match, date within +/- 3 days, matching counterparty or description.
 * 3. Moderate confidence (70%): Exact amount match and date within +/- 5 days.
 */
export function autoMatchBankStatement(
  statementLines: BankStatementLine[],
  movements: AccountMovement[]
): AutoMatchSummary {
  const updatedLines: BankStatementLine[] = [];
  const matchedMovementIds = new Set<string>();

  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const line of statementLines) {
    if (line.matchStatus === 'manual_matched' && line.matchedMovementId) {
      matchedMovementIds.add(line.matchedMovementId);
      updatedLines.push(line);
      matchedCount++;
      continue;
    }

    const lineDate = new Date(line.date).getTime();
    const lineAmt = Math.abs(Number(line.amountQapik));

    let bestMatch: AccountMovement | null = null;
    let bestConfidence = 0;

    for (const mov of movements) {
      if (mov.isReversed || matchedMovementIds.has(mov.id)) continue;

      const movAmt = Math.abs(Number(mov.amountQapik));
      if (movAmt !== lineAmt) continue;

      const movDate = new Date(mov.date).getTime();
      const diffDays = Math.abs((lineDate - movDate) / (1000 * 60 * 60 * 24));

      let confidence = 0;
      const refMatches =
        (line.reference && mov.documentNumber && line.reference.toLowerCase().includes(mov.documentNumber.toLowerCase())) ||
        (line.reference && mov.referenceDocNumber && line.reference.toLowerCase().includes(mov.referenceDocNumber.toLowerCase()));

      const descMatches =
        line.description &&
        mov.description &&
        (line.description.toLowerCase().includes(mov.description.toLowerCase()) ||
          mov.description.toLowerCase().includes(line.counterparty.toLowerCase()));

      if (diffDays <= 2 && refMatches) {
        confidence = 100;
      } else if (diffDays <= 3 && (refMatches || descMatches)) {
        confidence = 90;
      } else if (diffDays <= 2) {
        confidence = 80;
      } else if (diffDays <= 5) {
        confidence = 70;
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = mov;
      }
    }

    if (bestMatch && bestConfidence >= 70) {
      matchedMovementIds.add(bestMatch.id);
      matchedCount++;
      updatedLines.push({
        ...line,
        matchStatus: 'auto_matched',
        matchedMovementId: bestMatch.id,
        matchedMovementDocNumber: bestMatch.documentNumber,
        matchedMovementDescription: bestMatch.description,
        matchConfidence: bestConfidence,
      });
    } else {
      unmatchedCount++;
      updatedLines.push({
        ...line,
        matchStatus: 'unmatched',
        matchedMovementId: undefined,
        matchedMovementDocNumber: undefined,
        matchedMovementDescription: undefined,
        matchConfidence: 0,
      });
    }
  }

  return {
    matchedCount,
    unmatchedCount,
    lines: updatedLines,
  };
}

