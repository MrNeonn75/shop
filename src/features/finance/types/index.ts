import { Qapik } from '../../../shared/utils/money';

/**
 * BRAND HOUSE ERP — Finance Module Types & Models
 *
 * Operational financial control domain model with clear boundaries
 * for general ledger integration, cash/bank accounts, revenue recognition,
 * hierarchical expense tracking, and non-destructive reversal entries.
 */

// ---------------------------------------------------------------------------
// 1. Core Principles & Filters
// ---------------------------------------------------------------------------

export interface FinanceFilterParams {
  branchId?: string; // specific branch or 'all' / undefined
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  status?: string;
  accountId?: string;
  categoryId?: string;
  search?: string;
  comparisonPeriod?: 'previous_period' | 'same_period_last_year' | 'none';
}

// ---------------------------------------------------------------------------
// 2. Cash & Bank Accounts
// ---------------------------------------------------------------------------

export type FinanceAccountType = 'cash' | 'bank' | 'card_settlement';

export interface FinanceAccount {
  id: string;
  code: string; // e.g. "ACC-CASH-28M", "ACC-ABB-AZN", "ACC-POS-CLEARING"
  name: string; // e.g. "28 May Filial Kassası", "ABB Əsas Cari Hesab"
  type: FinanceAccountType;
  currency: 'AZN';
  branchId?: string; // populated for branch cash registers
  branchName?: string;
  bankName?: string; // e.g. "Azərbaycan Beynəlxalq Bankı (ABB)", "PAŞA Bank"
  accountNumber?: string; // IBAN / Hesab nömrəsi
  initialBalanceQapik: Qapik;
  currentBalanceQapik: Qapik; // derived from movements
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type MovementType =
  | 'transfer' // Hesablararası köçürmə
  | 'deposit' // Banka inkassasiya / mədaxil
  | 'withdrawal' // Bankdan nağdlaşdırma / kassaya mədaxil
  | 'pos_closing' // POS kassa Z-hesabat bağlanışı
  | 'expense_payment' // Xərc ödənişi
  | 'supplier_payment' // Təchizatçıya ödəniş
  | 'customer_collection' // Müştəridən yığım
  | 'other_income'; // Digər gəlir

export interface AccountMovement {
  id: string;
  documentNumber: string; // e.g. "CSH-2026-0045"
  date: string; // YYYY-MM-DD
  type: MovementType;
  fromAccountId?: string;
  fromAccountName?: string;
  toAccountId?: string;
  toAccountName?: string;
  amountQapik: Qapik;
  branchId?: string;
  branchName?: string;
  referenceDocType?: 'expense' | 'supplier_payment' | 'pos_shift' | 'customer_receipt' | 'bank_transfer' | 'reversal';
  referenceDocId?: string;
  referenceDocNumber?: string;
  description: string;
  performedBy: string;
  
  // Reversal fields (Transactions are never deleted!)
  isReversed?: boolean;
  reversedByMovementId?: string;
  reversalReason?: string;
  isReversal?: boolean;
  reversesMovementId?: string;

  createdAt: string;
}

// ---------------------------------------------------------------------------
// 3. POS Tender & Bank Statement Reconciliation
// ---------------------------------------------------------------------------

export type TenderType = 'cash' | 'card' | 'split';
export type TenderReconciliationStatus = 'matched' | 'mismatch' | 'investigating' | 'resolved';

export interface TenderReconciliation {
  id: string;
  branchId: string;
  branchName: string;
  date: string;
  shiftId: string;
  registerNumber: string;
  tenderType: TenderType;
  expectedQapik: Qapik; // From sales / Z-report
  actualSettledQapik: Qapik; // Actually counted / deposited
  discrepancyQapik: Qapik; // actual - expected
  status: TenderReconciliationStatus;
  notes?: string;
  cashierName: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface BankStatementImport {
  id: string;
  accountId: string;
  accountName: string;
  fileName: string;
  importedAt: string;
  totalLines: number;
  matchedLines: number;
  unmatchedLines: number;
  totalIncomingQapik: Qapik;
  totalOutgoingQapik: Qapik;
  status: 'pending' | 'in_progress' | 'reconciled';
}

export type BankMatchStatus = 'unmatched' | 'auto_matched' | 'manual_matched';

export interface BankStatementLine {
  id: string;
  statementId: string;
  date: string;
  reference: string;
  counterparty: string;
  description: string;
  amountQapik: Qapik; // positive for incoming, negative for outgoing
  matchStatus: BankMatchStatus;
  matchedMovementId?: string;
  matchedMovementDocNumber?: string;
  matchedMovementDescription?: string;
  matchConfidence?: number; // 0-100%
  notes?: string;
}

// ---------------------------------------------------------------------------
// 4. Expenses & Recurring Schedules
// ---------------------------------------------------------------------------

export type ExpenseCategoryCode =
  | 'rent'
  | 'utilities'
  | 'salary'
  | 'marketing'
  | 'transport'
  | 'maintenance'
  | 'tax'
  | 'other';

export interface ExpenseSubcategory {
  id: string;
  nameAz: string;
}

export interface ExpenseCategory {
  id: string;
  code: ExpenseCategoryCode;
  nameAz: string;
  description: string;
  iconName?: string;
  subcategories: ExpenseSubcategory[];
}

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected' | 'reversed';

export interface ExpenseAttachment {
  id: string;
  fileName: string;
  fileSizeKb: number;
  uploadedAt: string;
  fileUrl: string;
}

export interface ExpenseRecord {
  id: string;
  documentNumber: string; // e.g. "EXP-2026-0128"
  categoryId: string;
  categoryCode: ExpenseCategoryCode;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  branchId: string;
  branchName: string;
  supplierId?: string;
  supplierName?: string;
  
  amountQapik: Qapik; // Net amount without tax
  taxClassId: string; // From tax configuration (e.g. tax-1, 18%)
  taxRatePercent: number; // Configured rate (e.g. 18 or 0)
  taxAmountQapik: Qapik;
  totalAmountQapik: Qapik; // amountQapik + taxAmountQapik
  
  paymentAccountId?: string;
  paymentAccountName?: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'card';
  date: string; // YYYY-MM-DD
  description: string;
  status: ExpenseStatus;
  attachments: ExpenseAttachment[];

  // Approval hierarchy
  approvalThresholdLevel: 'branch_manager' | 'accountant' | 'general_manager';
  submittedBy: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  paidBy?: string;
  paidAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;

  // Reversal trail
  isReversed?: boolean;
  reversalReason?: string;
  reversedByExpenseId?: string;
  isReversal?: boolean;
  reversesExpenseId?: string;

  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpenseSchedule {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  branchId: string;
  branchName: string;
  supplierId?: string;
  supplierName?: string;
  estimatedAmountQapik: Qapik;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth: number; // e.g. 5th of every month
  nextDueDate: string;
  isActive: boolean;
  lastDraftGeneratedAt?: string;
  notes?: string;
}

export interface SharedExpenseAllocationShare {
  branchId: string;
  branchName: string;
  percentage: number;
  allocatedAmountQapik: Qapik;
}

export interface SharedExpenseAllocation {
  id: string;
  title: string;
  totalAmountQapik: Qapik;
  categoryId: string;
  categoryName: string;
  date: string;
  allocationRule: 'fixed_percentage' | 'sales_proportional';
  shares: SharedExpenseAllocationShare[];
  status: 'preview' | 'applied';
  appliedAt?: string;
  appliedBy?: string;
}

// ---------------------------------------------------------------------------
// 5. Other Income
// ---------------------------------------------------------------------------

export type OtherIncomeCategory = 'rental' | 'commission' | 'fx_gain' | 'scrap_sale' | 'other';

export interface OtherIncomeRecord {
  id: string;
  documentNumber: string; // e.g. "INC-2026-0015"
  category: OtherIncomeCategory;
  categoryName: string;
  branchId: string;
  branchName: string;
  amountQapik: Qapik;
  receivedAccountId: string;
  receivedAccountName: string;
  date: string;
  description: string;
  payerName: string;
  isReversed?: boolean;
  reversalReason?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 6. Payables & Receivables
// ---------------------------------------------------------------------------

export interface AgingBucketSummary {
  days0To30Qapik: Qapik;
  days31To60Qapik: Qapik;
  days61To90Qapik: Qapik;
  days90PlusQapik: Qapik;
  totalQapik: Qapik;
}

export interface CustomerReceivable {
  id: string;
  customerName: string;
  customerVoenOrId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmountQapik: Qapik;
  paidAmountQapik: Qapik;
  remainingAmountQapik: Qapik;
  daysOverdue: number;
  status: 'current' | 'overdue' | 'paid';
}

export interface PaymentAllocationItem {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmountQapik: Qapik;
}

export interface PaymentRecord {
  id: string;
  paymentNumber: string; // e.g. "PMT-2026-0089"
  type: 'supplier_payment' | 'customer_collection';
  counterpartyId: string;
  counterpartyName: string;
  date: string;
  accountId: string;
  accountName: string;
  amountQapik: Qapik;
  allocations: PaymentAllocationItem[];
  unallocatedAdvanceQapik: Qapik;
  referenceNotes?: string;
  performedBy: string;
  isReversed?: boolean;
  reversalReason?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 7. Budgets
// ---------------------------------------------------------------------------

export type BudgetStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type BudgetAlertLevel = 'normal' | 'warning' | 'exceeded';

export interface BudgetRevision {
  id: string;
  revisionNumber: number;
  previousAmountQapik: Qapik;
  newAmountQapik: Qapik;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface BudgetPlan {
  id: string;
  branchId: string;
  branchName: string;
  period: string; // e.g. "2026-04", "2026-Q2"
  categoryId: string;
  categoryName: string;
  budgetedAmountQapik: Qapik;
  actualSpentQapik: Qapik;
  status: BudgetStatus;
  varianceQapik: Qapik; // actualSpent - budgetedAmount (positive means over budget)
  variancePercent: number; // ((actualSpent - budgetedAmount) / budgetedAmount) * 100
  alertLevel: BudgetAlertLevel;
  approvedBy?: string;
  approvedAt?: string;
  revisions: BudgetRevision[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 8. Financial Reports (P&L, Cash Flow, Daily Cash)
// ---------------------------------------------------------------------------

export interface DrillDownTransaction {
  id: string;
  date: string;
  documentNumber: string;
  branchName: string;
  categoryOrTender: string;
  description: string;
  amountQapik: Qapik;
}

export interface ManagementPnlLine {
  lineId: string;
  titleAz: string;
  amountQapik: Qapik;
  percentageOfRevenue: number;
  drillDownCount: number;
}

export interface ManagementPnlReport {
  period: string;
  branchFilterName: string;
  cogsMethodLabel: string; // e.g. "Çəkili Orta Maya (Weighted Average)"
  
  // Standard P&L lines
  netRevenueQapik: Qapik;
  cogsQapik: Qapik;
  grossProfitQapik: Qapik;
  grossProfitMarginPercent: number;
  
  operatingExpenses: ManagementPnlLine[];
  totalOpexQapik: Qapik;

  // Strict conditional Net Profit computation
  isNetProfitComputable: boolean;
  missingDataReasons: string[];
  netProfitQapik?: Qapik;
  netProfitMarginPercent?: number;

  generatedAt: string;
}

export interface CashFlowCategoryLine {
  categoryName: string;
  amountQapik: Qapik;
  isPositive: boolean;
}

export interface CashFlowReport {
  period: string;
  branchFilterName: string;
  openingCashAndBankQapik: Qapik;
  
  // Operating Activities (Direct method)
  operatingInflows: CashFlowCategoryLine[];
  totalOperatingInflowsQapik: Qapik;
  operatingOutflows: CashFlowCategoryLine[];
  totalOperatingOutflowsQapik: Qapik;
  netOperatingCashFlowQapik: Qapik;

  // Investing & Financing
  investingCashFlowQapik: Qapik;
  financingCashFlowQapik: Qapik;

  netCashChangeQapik: Qapik;
  closingCashAndBankQapik: Qapik;
  generatedAt: string;
}

export interface DailyCashReportSummary {
  date: string;
  branchId: string;
  branchName: string;
  openingBalanceQapik: Qapik;
  cashSalesQapik: Qapik;
  otherInflowsQapik: Qapik;
  cashExpensesQapik: Qapik;
  bankDepositsQapik: Qapik;
  closingBalanceQapik: Qapik;
  discrepancyQapik: Qapik;
}

// ---------------------------------------------------------------------------
// 9. Accounting Integration Boundary (General Ledger)
// ---------------------------------------------------------------------------

export interface ChartOfAccountsItem {
  code: string; // e.g. "221", "223", "601", "701", "531", "201"
  nameAz: string; // e.g. "Kassa", "Bank Hesabları", "Satış Gəlirləri", "Satışın Maya Dəyəri"
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balanceQapik: Qapik;
  isDebitNormal: boolean;
}

export interface PostingRuleMapping {
  id: string;
  eventCode: 'pos_sale' | 'goods_receipt' | 'cogs_recognition' | 'expense_payment' | 'vat_payable';
  eventNameAz: string;
  debitAccountCode: string;
  debitAccountName: string;
  creditAccountCode: string;
  creditAccountName: string;
  description: string;
}

export interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  debitQapik: Qapik;
  creditQapik: Qapik;
  description: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string; // e.g. "JE-2026-00034"
  date: string;
  sourceDocType: string;
  sourceDocNumber: string;
  description: string;
  lines: JournalEntryLine[];
  totalDebitQapik: Qapik;
  totalCreditQapik: Qapik;
  isBalanced: boolean; // totalDebitQapik === totalCreditQapik
  status: 'posted' | 'reversed';
  reversedByEntryId?: string;
  reversalReason?: string;
  createdAt: string;
}

export interface GlIntegrationState {
  isGlEnabled: boolean; // default: false (Aktiv deyil)
  glProviderName?: string; // e.g. "1C:Mühasibatlıq", "SAP ERP", "ASAN E-Qaimə"
  lastSyncAt?: string;
  connectionStatus: 'unconfigured' | 'connected' | 'error';
  statusMessageAz: string;
}

// ---------------------------------------------------------------------------
// 10. Unified Approvals & Audit
// ---------------------------------------------------------------------------

export type ApprovalEntityType = 'expense' | 'supplier_payment' | 'budget_revision';

export interface ApprovalHistoryItem {
  timestamp: string;
  user: string;
  action: string;
  note?: string;
}

export interface ApprovalInboxItem {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  documentNumber: string;
  title: string;
  branchName: string;
  amountQapik: Qapik;
  submittedBy: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  thresholdNote: string;
  history: ApprovalHistoryItem[];
}

