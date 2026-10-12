import { describe, it, expect, beforeEach } from 'vitest';
import { toQapik } from '../src/shared/utils/money';
import { calculateReceivablesAging } from '../src/features/finance/utils/agingCalculator';
import { calculateBudgetVariance } from '../src/features/finance/utils/budgetCalculations';
import { calculateManagementPnl } from '../src/features/finance/utils/pnlCalculator';
import { deriveCashFlowDirectMethod } from '../src/features/finance/utils/cashFlowCalculator';
import { autoMatchBankStatement } from '../src/features/finance/utils/reconciliationMatcher';
import { reverseAccountMovement, reverseExpenseRecord } from '../src/features/finance/utils/reversalEngine';
import { MockFinanceAdapter } from '../src/shared/adapters/mock/mockFinanceAdapter';
import {
  CustomerReceivable,
  AccountMovement,
  BankStatementLine,
  ExpenseRecord,
} from '../src/features/finance/types';

describe('Finance & Operational Accounting Engine (Milestone F10)', () => {
  describe('1. Receivables & Payables Aging Calculations', () => {
    it('correctly categorizes receivables into 0-30, 31-60, 61-90, and 90+ days aging buckets', () => {
      const refDate = '2026-04-10';
      const sampleReceivables: CustomerReceivable[] = [
        {
          id: 'r1',
          customerName: 'Müştəri A',
          customerVoenOrId: '1111111111',
          invoiceNumber: 'INV-1',
          invoiceDate: '2026-04-01',
          dueDate: '2026-04-05', // 5 days overdue -> 0-30 days
          totalAmountQapik: toQapik(100000),
          paidAmountQapik: toQapik(0),
          remainingAmountQapik: toQapik(100000), // 1,000.00 ₼
          daysOverdue: 5,
          status: 'overdue',
        },
        {
          id: 'r2',
          customerName: 'Müştəri B',
          customerVoenOrId: '2222222222',
          invoiceNumber: 'INV-2',
          invoiceDate: '2026-02-15',
          dueDate: '2026-03-01', // 40 days overdue -> 31-60 days
          totalAmountQapik: toQapik(250000),
          paidAmountQapik: toQapik(50000),
          remainingAmountQapik: toQapik(200000), // 2,000.00 ₼
          daysOverdue: 40,
          status: 'overdue',
        },
        {
          id: 'r3',
          customerName: 'Müştəri C',
          customerVoenOrId: '3333333333',
          invoiceNumber: 'INV-3',
          invoiceDate: '2026-01-10',
          dueDate: '2026-01-25', // 75 days overdue -> 61-90 days
          totalAmountQapik: toQapik(150000),
          paidAmountQapik: toQapik(0),
          remainingAmountQapik: toQapik(150000), // 1,500.00 ₼
          daysOverdue: 75,
          status: 'overdue',
        },
        {
          id: 'r4',
          customerName: 'Müştəri D',
          customerVoenOrId: '4444444444',
          invoiceNumber: 'INV-4',
          invoiceDate: '2025-12-01',
          dueDate: '2025-12-15', // 116 days overdue -> 90+ days
          totalAmountQapik: toQapik(400000),
          paidAmountQapik: toQapik(0),
          remainingAmountQapik: toQapik(400000), // 4,000.00 ₼
          daysOverdue: 116,
          status: 'overdue',
        },
        {
          id: 'r5',
          customerName: 'Müştəri E (Ödənilib)',
          customerVoenOrId: '5555555555',
          invoiceNumber: 'INV-5',
          invoiceDate: '2025-11-01',
          dueDate: '2025-11-15',
          totalAmountQapik: toQapik(300000),
          paidAmountQapik: toQapik(300000),
          remainingAmountQapik: toQapik(0), // Fully paid -> ignored
          daysOverdue: 146,
          status: 'paid',
        },
      ];

      const aging = calculateReceivablesAging(sampleReceivables, refDate);

      expect(Number(aging.days0To30Qapik)).toBe(100000);
      expect(Number(aging.days31To60Qapik)).toBe(200000);
      expect(Number(aging.days61To90Qapik)).toBe(150000);
      expect(Number(aging.days90PlusQapik)).toBe(400000);
      expect(Number(aging.totalQapik)).toBe(850000); // 8,500.00 ₼
    });
  });

  describe('2. Budget Variance & Alert Levels', () => {
    it('evaluates normal, warning, and exceeded budget variances correctly', () => {
      // 1. Normal: 75% utilization (<90%)
      const normalRes = calculateBudgetVariance(toQapik(1000000), toQapik(750000));
      expect(Number(normalRes.varianceQapik)).toBe(-250000);
      expect(normalRes.variancePercent).toBe(-25);
      expect(normalRes.utilizationPercent).toBe(75);
      expect(normalRes.alertLevel).toBe('normal');
      expect(normalRes.isOverBudget).toBe(false);

      // 2. Warning: 95% utilization (90% - 100%)
      const warnRes = calculateBudgetVariance(toQapik(1000000), toQapik(950000));
      expect(Number(warnRes.varianceQapik)).toBe(-50000);
      expect(warnRes.alertLevel).toBe('warning');
      expect(warnRes.isOverBudget).toBe(false);

      // 3. Exceeded: 110% utilization (>100%)
      const exceededRes = calculateBudgetVariance(toQapik(1000000), toQapik(1100000));
      expect(Number(exceededRes.varianceQapik)).toBe(100000);
      expect(exceededRes.variancePercent).toBe(10);
      expect(exceededRes.alertLevel).toBe('exceeded');
      expect(exceededRes.isOverBudget).toBe(true);
    });
  });

  describe('3. P&L Management View Line Math & Missing Data Validation', () => {
    it('computes Net Revenue, Gross Profit, OPEX, and Net Profit when all required data exists', () => {
      const pnl = calculateManagementPnl({
        period: '2026-Q1',
        branchFilterName: '28 May Flaman Filialı',
        cogsMethodLabel: 'Çəkili Orta Maya (Weighted Average)',
        grossSalesQapik: toQapik(5000000), // 50,000.00 ₼
        returnsQapik: toQapik(200000), // 2,000.00 ₼
        cogsQapik: toQapik(2400000), // 24,000.00 ₼
        operatingExpenses: [
          { categoryId: 'cat-rent', categoryName: 'İcarə Xərcləri', amountQapik: toQapik(450000) },
          { categoryId: 'cat-sal', categoryName: 'Əməkhaqqı', amountQapik: toQapik(800000) },
          { categoryId: 'cat-util', categoryName: 'Kommunal', amountQapik: toQapik(150000) },
        ],
        hasMissingCostData: false,
        unapprovedExpenseCount: 0,
      });

      // Net Revenue = 50,000 - 2,000 = 48,000.00 ₼ (4,800,000 qəpik)
      expect(Number(pnl.netRevenueQapik)).toBe(4800000);

      // Gross Profit = 48,000 - 24,000 = 24,000.00 ₼ (2,400,000 qəpik)
      expect(Number(pnl.grossProfitQapik)).toBe(2400000);
      expect(pnl.grossProfitMarginPercent).toBe(50); // 24,000 / 48,000 = 50%

      // Total OPEX = 4,500 + 8,000 + 1,500 = 14,000.00 ₼ (1,400,000 qəpik)
      expect(Number(pnl.totalOpexQapik)).toBe(1400000);

      // Net Profit = 24,000 - 14,000 = 10,000.00 ₼ (1,000,000 qəpik)
      expect(pnl.isNetProfitComputable).toBe(true);
      expect(Number(pnl.netProfitQapik)).toBe(1000000);
      expect(pnl.netProfitMarginPercent).toBe(20.83); // 10,000 / 48,000 ≈ 20.83%
      expect(pnl.missingDataReasons).toHaveLength(0);
    });

    it('returns "Hesablanmayıb" and reasons when cost data or expense approvals are missing', () => {
      const pnlIncomplete = calculateManagementPnl({
        period: '2026-Q1',
        branchFilterName: 'Bütün Filiallar',
        grossSalesQapik: toQapik(5000000),
        returnsQapik: toQapik(200000),
        cogsQapik: toQapik(2400000),
        operatingExpenses: [
          { categoryId: 'cat-rent', categoryName: 'İcarə Xərcləri', amountQapik: toQapik(450000) },
        ],
        hasMissingCostData: true,
        unapprovedExpenseCount: 3,
        unclosedCountSessions: 1,
      });

      expect(pnlIncomplete.isNetProfitComputable).toBe(false);
      expect(pnlIncomplete.netProfitQapik).toBeUndefined();
      expect(pnlIncomplete.missingDataReasons.length).toBeGreaterThanOrEqual(3);
      expect(pnlIncomplete.missingDataReasons[0]).toContain('Cost Price');
      expect(pnlIncomplete.missingDataReasons[1]).toContain('təsdiqlənməmiş xərc');
    });
  });

  describe('4. Direct-Method Cash Flow Derivation', () => {
    it('derives operating inflows, outflows, and net cash change enforcing Cash Received != Revenue', () => {
      const sampleMovements: AccountMovement[] = [
        {
          id: 'm1',
          documentNumber: 'CSH-01',
          date: '2026-04-01',
          type: 'pos_closing',
          toAccountId: 'acc-1',
          amountQapik: toQapik(300000), // +3,000.00 ₼ cash sales
          description: 'POS kassa bağlanışı',
          performedBy: 'Kassir',
          createdAt: '2026-04-01T20:00:00Z',
        },
        {
          id: 'm2',
          documentNumber: 'CSH-02',
          date: '2026-04-02',
          type: 'customer_collection',
          toAccountId: 'acc-4',
          amountQapik: toQapik(200000), // +2,000.00 ₼ collection
          description: 'Debitor borc yığımı',
          performedBy: 'Mühasib',
          createdAt: '2026-04-02T10:00:00Z',
        },
        {
          id: 'm3',
          documentNumber: 'CSH-03',
          date: '2026-04-03',
          type: 'supplier_payment',
          fromAccountId: 'acc-5',
          amountQapik: toQapik(150000), // -1,500.00 ₼ supplier payment
          description: 'Təchizatçı fakturası ödənişi',
          performedBy: 'Mühasib',
          createdAt: '2026-04-03T11:00:00Z',
        },
        {
          id: 'm4',
          documentNumber: 'CSH-04',
          date: '2026-04-04',
          type: 'expense_payment',
          fromAccountId: 'acc-4',
          amountQapik: toQapik(100000), // -1,000.00 ₼ rent expense
          description: 'Mağaza icarə haqqı',
          performedBy: 'Mühasib',
          createdAt: '2026-04-04T12:00:00Z',
        },
        {
          id: 'm5',
          documentNumber: 'CSH-05',
          date: '2026-04-05',
          type: 'transfer',
          fromAccountId: 'acc-1',
          toAccountId: 'acc-4',
          amountQapik: toQapik(50000), // 500.00 ₼ internal transfer -> does NOT change consolidated net cash!
          description: 'Kassadan banka transfer',
          performedBy: 'Menecer',
          createdAt: '2026-04-05T15:00:00Z',
        },
      ];

      const cf = deriveCashFlowDirectMethod({
        period: '2026-04',
        branchFilterName: 'Konsolidasiya',
        openingCashAndBankQapik: toQapik(1000000), // 10,000.00 ₼
        movements: sampleMovements,
      });

      // Total Operating Inflows: 3,000 + 2,000 = 5,000.00 ₼
      expect(Number(cf.totalOperatingInflowsQapik)).toBe(500000);

      // Total Operating Outflows: 1,500 + 1,000 = 2,500.00 ₼
      expect(Number(cf.totalOperatingOutflowsQapik)).toBe(250000);

      // Net Operating Cash Flow: 5,000 - 2,500 = 2,500.00 ₼
      expect(Number(cf.netOperatingCashFlowQapik)).toBe(250000);

      // Net Cash Change = +2,500.00 ₼
      expect(Number(cf.netCashChangeQapik)).toBe(250000);

      // Closing Cash = 10,000 + 2,500 = 12,500.00 ₼ (1,250,000 qəpik)
      expect(Number(cf.closingCashAndBankQapik)).toBe(1250000);
    });
  });

  describe('5. Non-Destructive Financial Reversals (Never Delete!)', () => {
    it('creates an opposite compensating entry and preserves original audit trail', () => {
      const originalMovement: AccountMovement = {
        id: 'mov-test-1',
        documentNumber: 'CSH-2026-0099',
        date: '2026-04-05',
        type: 'transfer',
        fromAccountId: 'acc-1',
        fromAccountName: 'Kassa 1',
        toAccountId: 'acc-4',
        toAccountName: 'ABB Bank',
        amountQapik: toQapik(150000), // 1,500.00 ₼
        description: 'Səhv köçürmə',
        performedBy: 'Əməliyyatçı',
        createdAt: '2026-04-05T10:00:00Z',
      };

      const result = reverseAccountMovement(
        originalMovement,
        'Səhv bank hesabına köçürülüb, rəhbərlik göstərişi ilə ləğv edilir',
        'Baş Mühasib',
        'REV-CSH-2026-0099'
      );

      // Original record is updated with reversal flags
      expect(result.original.isReversed).toBe(true);
      expect(result.original.reversalReason).toContain('Səhv bank hesabına köçürülüb');
      expect(result.original.reversedByMovementId).toBe(result.reversal.id);

      // Reversal record has swapped accounts and is marked as reversal
      expect(result.reversal.isReversal).toBe(true);
      expect(result.reversal.reversesMovementId).toBe(originalMovement.id);
      expect(result.reversal.fromAccountId).toBe('acc-4'); // Swapped!
      expect(result.reversal.toAccountId).toBe('acc-1'); // Swapped!
      expect(Number(result.reversal.amountQapik)).toBe(150000);
      expect(result.reversal.documentNumber).toBe('REV-CSH-2026-0099');
    });

    it('rejects reversal if reason is missing or too short', () => {
      const originalMovement: AccountMovement = {
        id: 'mov-test-2',
        documentNumber: 'CSH-2026-0100',
        date: '2026-04-05',
        type: 'withdrawal',
        amountQapik: toQapik(50000),
        description: 'Xərc',
        performedBy: 'Kassir',
        createdAt: '2026-04-05T10:00:00Z',
      };

      expect(() => {
        reverseAccountMovement(originalMovement, 'abc', 'Mühasib', 'REV-01');
      }).toThrow(/minimum 5 simvol/);
    });

    it('rejects reversing an already reversed transaction', () => {
      const alreadyReversed: AccountMovement = {
        id: 'mov-test-3',
        documentNumber: 'CSH-2026-0101',
        date: '2026-04-05',
        type: 'deposit',
        amountQapik: toQapik(50000),
        description: 'İnkassasiya',
        performedBy: 'Kassir',
        isReversed: true,
        reversalReason: 'Artıq ləğv edilib',
        createdAt: '2026-04-05T10:00:00Z',
      };

      expect(() => {
        reverseAccountMovement(alreadyReversed, 'Yenidən ləğv cəhdi', 'Mühasib', 'REV-02');
      }).toThrow(/artıq ləğv edilib/);
    });

    it('creates a non-destructive reversal for a paid expense and marks original as reversed', () => {
      const originalExpense: ExpenseRecord = {
        id: 'exp-test-1',
        documentNumber: 'EXP-2026-9999',
        date: '2026-04-01',
        categoryId: 'cat-rent',
        categoryCode: 'rent',
        categoryName: 'İcarə Xərcləri',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        amountQapik: toQapik(300000), // 3,000.00 ₼
        taxClassId: 'tax-1',
        taxRatePercent: 18,
        taxAmountQapik: toQapik(54000),
        totalAmountQapik: toQapik(354000),
        description: 'Səhv daxil edilmiş icarə xərci',
        status: 'paid',
        paymentMethod: 'bank_transfer',
        paymentAccountId: 'acc-4',
        paymentAccountName: 'ABB Cari Hesab',
        attachments: [],
        approvalThresholdLevel: 'accountant',
        submittedBy: 'Filial Meneceri',
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };

      const result = reverseExpenseRecord(
        originalExpense,
        'Mühasibatlıq tərəfindən təkrar daxil edildiyi üçün ləğv edilir',
        'Baş Mühasib',
        'REV-EXP-2026-9999'
      );

      expect(result.original.status).toBe('reversed');
      expect(result.original.isReversed).toBe(true);
      expect(result.original.reversalReason).toContain('təkrar daxil edildiyi üçün');
      expect(result.reversal.isReversal).toBe(true);
      expect(result.reversal.reversesExpenseId).toBe(originalExpense.id);
      expect(result.reversal.documentNumber).toBe('REV-EXP-2026-9999');
    });
  });

  describe('6. Bank Statement Auto-Matching Logic', () => {
    it('matches lines by exact amount, date proximity, and reference code with high confidence', () => {
      const statementLines: BankStatementLine[] = [
        {
          id: 'l1',
          statementId: 's1',
          date: '2026-04-05',
          reference: 'CSH-2026-0001',
          counterparty: '28 May Filialı',
          description: '28 May inkassasiya',
          amountQapik: toQapik(200000),
          matchStatus: 'unmatched',
        },
        {
          id: 'l2',
          statementId: 's1',
          date: '2026-04-06',
          reference: 'UNKNOWN-REF',
          counterparty: 'Naməlum Müştəri',
          description: 'Qeyri-müəyyən ödəniş',
          amountQapik: toQapik(999999),
          matchStatus: 'unmatched',
        },
      ];

      const movements: AccountMovement[] = [
        {
          id: 'mov-match-1',
          documentNumber: 'CSH-2026-0001',
          date: '2026-04-05',
          type: 'deposit',
          amountQapik: toQapik(200000),
          description: '28 May filialı gün sonu nağd inkassasiyası',
          performedBy: 'Menecer',
          createdAt: '2026-04-05T20:00:00Z',
        },
      ];

      const result = autoMatchBankStatement(statementLines, movements);

      expect(result.matchedCount).toBe(1);
      expect(result.unmatchedCount).toBe(1);
      expect(result.lines[0].matchStatus).toBe('auto_matched');
      expect(result.lines[0].matchConfidence).toBe(100);
      expect(result.lines[0].matchedMovementId).toBe('mov-match-1');
      expect(result.lines[1].matchStatus).toBe('unmatched');
    });
  });

  describe('7. MockFinanceAdapter End-to-End State Operations', () => {
    let adapter: MockFinanceAdapter;

    beforeEach(() => {
      adapter = new MockFinanceAdapter();
    });

    it('returns seeded accounts with realistic derived balances', async () => {
      const accounts = await adapter.getAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(6);
      const abbAccount = accounts.find((a) => a.code === 'ACC-ABB-AZN');
      expect(abbAccount).toBeDefined();
      expect(Number(abbAccount?.currentBalanceQapik)).toBeGreaterThan(0);
    });

    it('creates movement and alters source and destination account balances', async () => {
      const accountsBefore = await adapter.getAccounts();
      const cashAccBefore = accountsBefore.find((a) => a.id === 'acc-1')!;
      const bankAccBefore = accountsBefore.find((a) => a.id === 'acc-4')!;

      const initialCash = Number(cashAccBefore.currentBalanceQapik);
      const initialBank = Number(bankAccBefore.currentBalanceQapik);

      const transferAmount = toQapik(50000); // 500.00 ₼

      await adapter.createMovement({
        type: 'deposit',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-4',
        amountQapik: transferAmount,
        description: 'Test inkassasiya',
      });

      const accountsAfter = await adapter.getAccounts();
      const cashAccAfter = accountsAfter.find((a) => a.id === 'acc-1')!;
      const bankAccAfter = accountsAfter.find((a) => a.id === 'acc-4')!;

      expect(Number(cashAccAfter.currentBalanceQapik)).toBe(initialCash - Number(transferAmount));
      expect(Number(bankAccAfter.currentBalanceQapik)).toBe(initialBank + Number(transferAmount));
    });

    it('executes full expense lifecycle: Draft -> Submitted -> Approved -> Paid -> Reversal', async () => {
      // 1. Create Draft
      const exp = await adapter.createExpense({
        categoryId: 'cat-utilities',
        branchId: 'branch-1',
        amountQapik: toQapik(15000), // 150.00 ₼
        description: 'Test kommunal',
      });
      expect(exp.status).toBe('draft');

      // 2. Submit
      const submitted = await adapter.submitExpense(exp.id);
      expect(submitted.status).toBe('submitted');

      // 3. Approve
      const approved = await adapter.approveExpense(exp.id, 'Rəhbərlik');
      expect(approved.status).toBe('approved');

      // 4. Pay
      const paid = await adapter.payExpense(exp.id, 'acc-4', 'Mühasib');
      expect(paid.status).toBe('paid');

      // 5. Reverse (Never delete!)
      const reversalResult = await adapter.reverseExpense(
        exp.id,
        'Səhv qəbz əsasında ödənilmişdi, storno edilir',
        'Baş Mühasib'
      );
      expect(reversalResult.original.status).toBe('reversed');
      expect(reversalResult.original.isReversed).toBe(true);
      expect(reversalResult.reversal.isReversal).toBe(true);
      expect(reversalResult.reversal.documentNumber).toContain('REV-');
    });

    it('explicitly returns "Aktiv deyil" state for General Ledger boundary and does not fake journals', async () => {
      const glState = await adapter.getGlIntegrationState();
      expect(glState.isGlEnabled).toBe(false);
      expect(glState.statusMessageAz).toContain('Aktiv deyil');
    });
  });
});
