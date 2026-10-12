import { toQapik, Qapik } from '../../utils/money';
import { FinanceRepository } from '../types';
import {
  FinanceAccount,
  AccountMovement,
  FinanceFilterParams,
  DailyCashReportSummary,
  TenderReconciliation,
  BankStatementImport,
  BankStatementLine,
  ExpenseCategory,
  ExpenseRecord,
  RecurringExpenseSchedule,
  SharedExpenseAllocation,
  OtherIncomeRecord,
  CustomerReceivable,
  AgingBucketSummary,
  PaymentRecord,
  BudgetPlan,
  BudgetRevision,
  ManagementPnlReport,
  CashFlowReport,
  DrillDownTransaction,
  GlIntegrationState,
  ChartOfAccountsItem,
  PostingRuleMapping,
  JournalEntry,
  ApprovalInboxItem,
} from '../../../features/finance/types';
import { calculateReceivablesAging } from '../../../features/finance/utils/agingCalculator';
import { calculateBudgetVariance } from '../../../features/finance/utils/budgetCalculations';
import { calculateManagementPnl } from '../../../features/finance/utils/pnlCalculator';
import { deriveCashFlowDirectMethod } from '../../../features/finance/utils/cashFlowCalculator';
import { autoMatchBankStatement, AutoMatchSummary } from '../../../features/finance/utils/reconciliationMatcher';
import { reverseAccountMovement, reverseExpenseRecord } from '../../../features/finance/utils/reversalEngine';

export class MockFinanceAdapter implements FinanceRepository {
  private accounts: FinanceAccount[] = [];
  private movements: AccountMovement[] = [];
  private tenderReconciliations: TenderReconciliation[] = [];
  private bankImports: BankStatementImport[] = [];
  private bankLines: BankStatementLine[] = [];
  private expenseCategories: ExpenseCategory[] = [];
  private expenses: ExpenseRecord[] = [];
  private recurringSchedules: RecurringExpenseSchedule[] = [];
  private sharedAllocations: SharedExpenseAllocation[] = [];
  private otherIncome: OtherIncomeRecord[] = [];
  private customerReceivables: CustomerReceivable[] = [];
  private payments: PaymentRecord[] = [];
  private budgets: BudgetPlan[] = [];
  private chartOfAccounts: ChartOfAccountsItem[] = [];
  private postingRules: PostingRuleMapping[] = [];
  private journalEntries: JournalEntry[] = [];
  private idempotencyCache = new Set<string>();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // 1. Accounts
    this.accounts = [
      {
        id: 'acc-1',
        code: 'ACC-CASH-28M',
        name: '28 May Filial Kassası',
        type: 'cash',
        currency: 'AZN',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        initialBalanceQapik: toQapik(250000), // 2,500.00 ₼
        currentBalanceQapik: toQapik(384050), // 3,840.50 ₼
        isActive: true,
        notes: '28 May filialı əsas nağd kassa qovşağı (DEMO)',
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2026-04-10T12:00:00Z',
      },
      {
        id: 'acc-2',
        code: 'ACC-CASH-GM',
        name: 'Gənclik Mall Filial Kassası',
        type: 'cash',
        currency: 'AZN',
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        initialBalanceQapik: toQapik(300000), // 3,000.00 ₼
        currentBalanceQapik: toQapik(452000), // 4,520.00 ₼
        isActive: true,
        notes: 'Gənclik Mall nağd kassa qovşağı (DEMO)',
        createdAt: '2024-03-20T00:00:00Z',
        updatedAt: '2026-04-10T12:00:00Z',
      },
      {
        id: 'acc-3',
        code: 'ACC-CASH-DM',
        name: 'Dəniz Mall Filial Kassası',
        type: 'cash',
        currency: 'AZN',
        branchId: 'branch-3',
        branchName: 'Dəniz Mall Filialı',
        initialBalanceQapik: toQapik(180000), // 1,800.00 ₼
        currentBalanceQapik: toQapik(291020), // 2,910.20 ₼
        isActive: true,
        notes: 'Dəniz Mall nağd kassa qovşağı (DEMO)',
        createdAt: '2024-06-10T00:00:00Z',
        updatedAt: '2026-04-10T12:00:00Z',
      },
      {
        id: 'acc-4',
        code: 'ACC-ABB-AZN',
        name: 'ABB Əsas Cari Hesab (AZN)',
        type: 'bank',
        currency: 'AZN',
        bankName: 'Azərbaycan Beynəlxalq Bankı (ABB)',
        accountNumber: 'AZ21IBAZ38010019440001234567',
        initialBalanceQapik: toQapik(8500000), // 85,000.00 ₼
        currentBalanceQapik: toQapik(12450000), // 124,500.00 ₼
        isActive: true,
        notes: 'Əsas korporativ əməliyyat və vergi hesabı (DEMO)',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2026-04-10T12:00:00Z',
      },
      {
        id: 'acc-5',
        code: 'ACC-PASHA-AZN',
        name: 'PAŞA Bank Cari Hesab (AZN)',
        type: 'bank',
        currency: 'AZN',
        bankName: 'PAŞA Bank ASC',
        accountNumber: 'AZ45PASHA0001293847560012',
        initialBalanceQapik: toQapik(4200000), // 42,000.00 ₼
        currentBalanceQapik: toQapik(5820000), // 58,200.00 ₼
        isActive: true,
        notes: 'Təchizatçı xarici və yerli ödənişlər hesabı (DEMO)',
        createdAt: '2024-02-01T00:00:00Z',
        updatedAt: '2026-04-10T12:00:00Z',
      },
      {
        id: 'acc-6',
        code: 'ACC-POS-CLEARING',
        name: 'POS Terminal Klirinq Tranzit Hesabı',
        type: 'card_settlement',
        currency: 'AZN',
        initialBalanceQapik: toQapik(1200000), // 12,000.00 ₼
        currentBalanceQapik: toQapik(1645000), // 16,450.00 ₼
        isActive: true,
        notes: 'Bütün filialların POS kart ödənişlərinin banka oturma tranziti (DEMO)',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2026-04-10T12:00:00Z',
      },
    ];

    // 2. Movements
    this.movements = [
      {
        id: 'mov-1',
        documentNumber: 'CSH-2026-0001',
        date: '2026-04-09',
        type: 'deposit',
        fromAccountId: 'acc-1',
        fromAccountName: '28 May Filial Kassası',
        toAccountId: 'acc-4',
        toAccountName: 'ABB Əsas Cari Hesab (AZN)',
        amountQapik: toQapik(200000), // 2,000.00 ₼
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        referenceDocType: 'bank_transfer',
        description: '28 May filialı gün sonu nağd inkassasiyası',
        performedBy: 'Kamran Əliyev (Filial meneceri)',
        createdAt: '2026-04-09T19:30:00Z',
      },
      {
        id: 'mov-2',
        documentNumber: 'CSH-2026-0002',
        date: '2026-04-09',
        type: 'pos_closing',
        toAccountId: 'acc-1',
        toAccountName: '28 May Filial Kassası',
        amountQapik: toQapik(334050), // 3,340.50 ₼
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        referenceDocType: 'pos_shift',
        description: '28 May Kassa 1 Z-hesabat bağlanışı və mədaxil',
        performedBy: 'Günel Məmmədova (Kassir)',
        createdAt: '2026-04-09T21:05:00Z',
      },
      {
        id: 'mov-3',
        documentNumber: 'CSH-2026-0003',
        date: '2026-04-08',
        type: 'transfer',
        fromAccountId: 'acc-4',
        fromAccountName: 'ABB Əsas Cari Hesab (AZN)',
        toAccountId: 'acc-5',
        toAccountName: 'PAŞA Bank Cari Hesab (AZN)',
        amountQapik: toQapik(1500000), // 15,000.00 ₼
        description: 'Təchizatçı ödənişləri üçün banklararası likvidlik köçürməsi',
        performedBy: 'Nərgiz Rüstəmova (Mühasib)',
        createdAt: '2026-04-08T11:20:00Z',
      },
      {
        id: 'mov-4',
        documentNumber: 'CSH-2026-0004',
        date: '2026-04-07',
        type: 'withdrawal',
        fromAccountId: 'acc-4',
        fromAccountName: 'ABB Əsas Cari Hesab (AZN)',
        toAccountId: 'acc-2',
        toAccountName: 'Gənclik Mall Filial Kassası',
        amountQapik: toQapik(100000), // 1,000.00 ₼
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        description: 'Gənclik Mall filialına xırda xərclər üçün kassa nağdlaşdırması',
        performedBy: 'Rəşad Qasımov (Filial meneceri)',
        createdAt: '2026-04-07T14:15:00Z',
      },
      {
        id: 'mov-5',
        documentNumber: 'CSH-2026-0005',
        date: '2026-04-06',
        type: 'expense_payment',
        fromAccountId: 'acc-4',
        fromAccountName: 'ABB Əsas Cari Hesab (AZN)',
        amountQapik: toQapik(450000), // 4,500.00 ₼
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        referenceDocType: 'expense',
        referenceDocId: 'exp-1',
        referenceDocNumber: 'EXP-2026-0001',
        description: '28 May mağazasının aprel ayı icarə haqqı ödənişi',
        performedBy: 'Nərgiz Rüstəmova (Mühasib)',
        createdAt: '2026-04-06T10:00:00Z',
      },
      {
        id: 'mov-6',
        documentNumber: 'CSH-2026-0006',
        date: '2026-04-05',
        type: 'supplier_payment',
        fromAccountId: 'acc-5',
        fromAccountName: 'PAŞA Bank Cari Hesab (AZN)',
        amountQapik: toQapik(1250000), // 12,500.00 ₼
        referenceDocType: 'supplier_payment',
        description: '"Baku Fashion Distribution" təchizatçısına qaimə üzrə ödəniş',
        performedBy: 'Nərgiz Rüstəmova (Mühasib)',
        createdAt: '2026-04-05T15:40:00Z',
      },
      {
        id: 'mov-7',
        documentNumber: 'CSH-2026-0007',
        date: '2026-04-04',
        type: 'customer_collection',
        toAccountId: 'acc-4',
        toAccountName: 'ABB Əsas Cari Hesab (AZN)',
        amountQapik: toQapik(380000), // 3,800.00 ₼
        referenceDocType: 'customer_receipt',
        description: '"AzərTurizm QSC" korporativ sifariş üzrə bank köçürməsi yığımı',
        performedBy: 'Nərgiz Rüstəmova (Mühasib)',
        createdAt: '2026-04-04T16:10:00Z',
      },
    ];

    // 3. Tender reconciliations
    this.tenderReconciliations = [
      {
        id: 'tr-1',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        date: '2026-04-09',
        shiftId: 'shift-101',
        registerNumber: 'Kassa 1',
        tenderType: 'cash',
        expectedQapik: toQapik(202000), // 2,020.00 ₼
        actualSettledQapik: toQapik(200000), // 2,000.00 ₼
        discrepancyQapik: toQapik(-2000), // -20.00 ₼ (kəsir)
        status: 'investigating',
        notes: '20 ₼ kassa kəsiri qeydə alınıb. Kassir qəpik qalığını yenidən yoxlayır.',
        cashierName: 'Günel Məmmədova',
      },
      {
        id: 'tr-2',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        date: '2026-04-09',
        shiftId: 'shift-101',
        registerNumber: 'Kassa 1',
        tenderType: 'card',
        expectedQapik: toQapik(315000), // 3,150.00 ₼
        actualSettledQapik: toQapik(315000), // 3,150.00 ₼
        discrepancyQapik: toQapik(0),
        status: 'matched',
        notes: 'POS terminal slip cəmi fiskal çek cəmi ilə tam üst-üstə düşdü.',
        cashierName: 'Günel Məmmədova',
      },
      {
        id: 'tr-3',
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        date: '2026-04-09',
        shiftId: 'shift-102',
        registerNumber: 'Kassa 2',
        tenderType: 'cash',
        expectedQapik: toQapik(280000), // 2,800.00 ₼
        actualSettledQapik: toQapik(280000), // 2,800.00 ₼
        discrepancyQapik: toQapik(0),
        status: 'matched',
        cashierName: 'Rauf Əliyev',
      },
    ];

    // 4. Bank imports & lines
    this.bankImports = [
      {
        id: 'imp-1',
        accountId: 'acc-4',
        accountName: 'ABB Əsas Cari Hesab (AZN)',
        fileName: 'abb_statement_april_2026.csv',
        importedAt: '2026-04-10T09:00:00Z',
        totalLines: 4,
        matchedLines: 2,
        unmatchedLines: 2,
        totalIncomingQapik: toQapik(580000), // 5,800.00 ₼
        totalOutgoingQapik: toQapik(650000), // 6,500.00 ₼
        status: 'in_progress',
      },
    ];

    this.bankLines = [
      {
        id: 'line-1',
        statementId: 'imp-1',
        date: '2026-04-09',
        reference: 'CSH-2026-0001',
        counterparty: 'BRAND HOUSE MMC / 28 May Filialı',
        description: '28 May filialı gün sonu nağd inkassasiyası',
        amountQapik: toQapik(200000), // +2,000.00 ₼
        matchStatus: 'auto_matched',
        matchedMovementId: 'mov-1',
        matchedMovementDocNumber: 'CSH-2026-0001',
        matchedMovementDescription: '28 May filialı gün sonu nağd inkassasiyası',
        matchConfidence: 100,
      },
      {
        id: 'line-2',
        statementId: 'imp-1',
        date: '2026-04-06',
        reference: 'EXP-2026-0001',
        counterparty: 'AF Mall İcarə QSC',
        description: '28 May mağazasının aprel ayı icarə haqqı ödənişi',
        amountQapik: toQapik(-450000), // -4,500.00 ₼
        matchStatus: 'auto_matched',
        matchedMovementId: 'mov-5',
        matchedMovementDocNumber: 'CSH-2026-0005',
        matchedMovementDescription: '28 May mağazasının aprel ayı icarə haqqı ödənişi',
        matchConfidence: 90,
      },
      {
        id: 'line-3',
        statementId: 'imp-1',
        date: '2026-04-04',
        reference: 'AZER-TURIZM-INV-44',
        counterparty: 'AzərTurizm QSC',
        description: 'Korporativ geyim dəstləri üzrə invoys ödənişi',
        amountQapik: toQapik(380000), // +3,800.00 ₼
        matchStatus: 'unmatched',
      },
      {
        id: 'line-4',
        statementId: 'imp-1',
        date: '2026-04-03',
        reference: 'BANK-COMMISSION-04',
        counterparty: 'Azərbaycan Beynəlxalq Bankı',
        description: 'Aylıq bank xidmət haqqı və SMS bildiriş tarifi',
        amountQapik: toQapik(-200000), // -2,000.00 ₼
        matchStatus: 'unmatched',
      },
    ];

    // 5. Expense categories
    this.expenseCategories = [
      {
        id: 'cat-rent',
        code: 'rent',
        nameAz: 'İcarə Xərcləri',
        description: 'Filial vitrinləri, ticarət zalları və mərkəzi anbar icarəsi',
        iconName: 'Building',
        subcategories: [
          { id: 'sub-rent-store', nameAz: 'Ticarət Zalı İcarəsi' },
          { id: 'sub-rent-wh', nameAz: 'Anbar İcarəsi' },
          { id: 'sub-rent-office', nameAz: 'Baş Ofis İcarəsi' },
        ],
      },
      {
        id: 'cat-utilities',
        code: 'utilities',
        nameAz: 'Kommunal və Rabitə',
        description: 'Elektrik, isitmə, su, optik internet və POS rabitə xətləri',
        iconName: 'Zap',
        subcategories: [
          { id: 'sub-util-elec', nameAz: 'Elektrik Enerjisi' },
          { id: 'sub-util-net', nameAz: 'İnternet və Telefon' },
          { id: 'sub-util-water', nameAz: 'Su və Kanalizasiya' },
        ],
      },
      {
        id: 'cat-salary',
        code: 'salary',
        nameAz: 'Əməkhaqqı və Mükafatlar',
        description: 'Mağaza heyəti, menecerlər və ofis işçilərinin maaşları',
        iconName: 'Users',
        subcategories: [
          { id: 'sub-sal-base', nameAz: 'Əsas Əməkhaqqı' },
          { id: 'sub-sal-bonus', nameAz: 'Satış Bonusu və Mükafat' },
          { id: 'sub-sal-overtime', nameAz: 'Artıq İş Saatı' },
        ],
      },
      {
        id: 'cat-marketing',
        code: 'marketing',
        nameAz: 'Marketinq və Reklam',
        description: 'Rəqəmsal reklamlar, sosial media, çöl reklamları və çap materialları',
        iconName: 'Megaphone',
        subcategories: [
          { id: 'sub-mkt-digital', nameAz: 'Sosial Media & Google Ads' },
          { id: 'sub-mkt-outdoor', nameAz: 'Bannrlər və Çöl Reklamı' },
          { id: 'sub-mkt-print', nameAz: 'Kataloq və Qablaşdırma Çapı' },
        ],
      },
      {
        id: 'cat-transport',
        code: 'transport',
        nameAz: 'Nəqliyyat və Logistika',
        description: 'Filiallararası daşınma, kuryer xidmətləri və yanacaq',
        iconName: 'Truck',
        subcategories: [
          { id: 'sub-tr-fuel', nameAz: 'Yanacaq Xərcləri' },
          { id: 'sub-tr-courier', nameAz: 'Kuryer və Ekspress Çatdırılma' },
        ],
      },
      {
        id: 'cat-maintenance',
        code: 'maintenance',
        nameAz: 'Təmir və Təsərrüfat',
        description: 'Vitrin avadanlıqları təmiri, işıqlandırma və təsərrüfat malları',
        iconName: 'Wrench',
        subcategories: [
          { id: 'sub-maint-store', nameAz: 'Mağaza Avadanlığı Təmiri' },
          { id: 'sub-maint-supplies', nameAz: 'Təsərrüfat və Təmizlik Malları' },
        ],
      },
      {
        id: 'cat-tax',
        code: 'tax',
        nameAz: 'Vergilər və Rüsumlar',
        description: 'Dövlət büdcəsinə vergi və rüsum ödənişləri',
        iconName: 'Scale',
        subcategories: [
          { id: 'sub-tax-profit', nameAz: 'Mənfəət Vergisi' },
          { id: 'sub-tax-property', nameAz: 'Əmlak Vergisi' },
          { id: 'sub-tax-fees', nameAz: 'Dövlət Rüsumları' },
        ],
      },
      {
        id: 'cat-other',
        code: 'other',
        nameAz: 'Digər Əməliyyat Xərcləri',
        description: 'Bank komissiyaları, konsaltinq və gözlənilməz xərclər',
        iconName: 'MoreHorizontal',
        subcategories: [
          { id: 'sub-oth-bank', nameAz: 'Bank Komissiyaları' },
          { id: 'sub-oth-misc', nameAz: 'Xırda İnzibati Xərclər' },
        ],
      },
    ];

    // 6. Seeded expenses
    this.expenses = [
      {
        id: 'exp-1',
        documentNumber: 'EXP-2026-0001',
        categoryId: 'cat-rent',
        categoryCode: 'rent',
        categoryName: 'İcarə Xərcləri',
        subcategoryId: 'sub-rent-store',
        subcategoryName: 'Ticarət Zalı İcarəsi',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        supplierName: 'AF Mall İcarə QSC',
        amountQapik: toQapik(450000), // 4,500.00 ₼
        taxClassId: 'tax-1',
        taxRatePercent: 18,
        taxAmountQapik: toQapik(81000), // 810.00 ₼
        totalAmountQapik: toQapik(531000), // 5,310.00 ₼
        paymentAccountId: 'acc-4',
        paymentAccountName: 'ABB Əsas Cari Hesab (AZN)',
        paymentMethod: 'bank_transfer',
        date: '2026-04-06',
        description: '28 May mağazasının aprel ayı icarə haqqı ödənişi',
        status: 'paid',
        attachments: [
          {
            id: 'att-1',
            fileName: 'icare_muqavile_28may_aprel.pdf',
            fileSizeKb: 340,
            uploadedAt: '2026-04-06T09:15:00Z',
            fileUrl: '/uploads/demo/icare_28may.pdf',
          },
        ],
        approvalThresholdLevel: 'general_manager',
        submittedBy: 'Kamran Əliyev (Filial meneceri)',
        submittedAt: '2026-04-05T14:00:00Z',
        approvedBy: 'Elmir Həsənov (Baş menecer)',
        approvedAt: '2026-04-05T16:30:00Z',
        paidBy: 'Nərgiz Rüstəmova (Mühasib)',
        paidAt: '2026-04-06T10:00:00Z',
        createdAt: '2026-04-05T14:00:00Z',
        updatedAt: '2026-04-06T10:00:00Z',
      },
      {
        id: 'exp-2',
        documentNumber: 'EXP-2026-0002',
        categoryId: 'cat-utilities',
        categoryCode: 'utilities',
        categoryName: 'Kommunal və Rabitə',
        subcategoryId: 'sub-util-elec',
        subcategoryName: 'Elektrik Enerjisi',
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        amountQapik: toQapik(38000), // 380.00 ₼
        taxClassId: 'tax-1',
        taxRatePercent: 18,
        taxAmountQapik: toQapik(6840),
        totalAmountQapik: toQapik(44840),
        paymentAccountId: 'acc-2',
        paymentAccountName: 'Gənclik Mall Filial Kassası',
        paymentMethod: 'cash',
        date: '2026-04-08',
        description: 'Gənclik Mall mart ayı elektrik sərfiyyatı qəbzi',
        status: 'approved',
        attachments: [],
        approvalThresholdLevel: 'branch_manager',
        submittedBy: 'Rəşad Qasımov (Filial meneceri)',
        submittedAt: '2026-04-08T11:00:00Z',
        approvedBy: 'Rəşad Qasımov (Filial meneceri)',
        approvedAt: '2026-04-08T11:05:00Z',
        createdAt: '2026-04-08T11:00:00Z',
        updatedAt: '2026-04-08T11:05:00Z',
      },
      {
        id: 'exp-3',
        documentNumber: 'EXP-2026-0003',
        categoryId: 'cat-marketing',
        categoryCode: 'marketing',
        categoryName: 'Marketinq və Reklam',
        subcategoryId: 'sub-mkt-digital',
        subcategoryName: 'Sosial Media & Google Ads',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        supplierName: 'Meta Ads Ireland Ltd',
        amountQapik: toQapik(220000), // 2,200.00 ₼
        taxClassId: 'tax-4', // exempt / xaricdən xidmət
        taxRatePercent: 0,
        taxAmountQapik: toQapik(0),
        totalAmountQapik: toQapik(220000),
        paymentMethod: 'bank_transfer',
        date: '2026-04-09',
        description: 'Bahar kolleksiyası Instagram & TikTok video reklam büdcəsi',
        status: 'submitted',
        attachments: [],
        approvalThresholdLevel: 'accountant',
        submittedBy: 'Leyla Əliyeva (Marketinq meneceri)',
        submittedAt: '2026-04-09T15:20:00Z',
        createdAt: '2026-04-09T15:20:00Z',
        updatedAt: '2026-04-09T15:20:00Z',
      },
      {
        id: 'exp-4',
        documentNumber: 'EXP-2026-0004',
        categoryId: 'cat-maintenance',
        categoryCode: 'maintenance',
        categoryName: 'Təmir və Təsərrüfat',
        subcategoryId: 'sub-maint-store',
        subcategoryName: 'Mağaza Avadanlığı Təmiri',
        branchId: 'branch-3',
        branchName: 'Dəniz Mall Filialı',
        amountQapik: toQapik(15000), // 150.00 ₼
        taxClassId: 'tax-1',
        taxRatePercent: 18,
        taxAmountQapik: toQapik(2700),
        totalAmountQapik: toQapik(17700),
        paymentMethod: 'cash',
        date: '2026-04-07',
        description: 'Dəniz Mall vitrin projektorlarının lampalarının dəyişdirilməsi',
        status: 'draft',
        attachments: [],
        approvalThresholdLevel: 'branch_manager',
        submittedBy: 'Aynur Səmədova (Filial meneceri)',
        createdAt: '2026-04-07T12:00:00Z',
        updatedAt: '2026-04-07T12:00:00Z',
      },
    ];

    // 7. Recurring schedules
    this.recurringSchedules = [
      {
        id: 'rec-1',
        title: '28 May Ticarət Zalı İcarəsi',
        categoryId: 'cat-rent',
        categoryName: 'İcarə Xərcləri',
        subcategoryId: 'sub-rent-store',
        subcategoryName: 'Ticarət Zalı İcarəsi',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        supplierName: 'AF Mall İcarə QSC',
        estimatedAmountQapik: toQapik(450000), // 4,500.00 ₼
        frequency: 'monthly',
        dayOfMonth: 5,
        nextDueDate: '2026-05-05',
        isActive: true,
        lastDraftGeneratedAt: '2026-04-05T09:00:00Z',
        notes: 'Avtomatik ödənilmir; hər ay baxış üçün xərc qaralaması yaradır.',
      },
      {
        id: 'rec-2',
        title: 'Filiallar Üzrə Optik İnternet və POS Əlaqə',
        categoryId: 'cat-utilities',
        categoryName: 'Kommunal və Rabitə',
        subcategoryId: 'sub-util-net',
        subcategoryName: 'İnternet və Telefon',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        supplierName: 'CityNet Provayder',
        estimatedAmountQapik: toQapik(12000), // 120.00 ₼
        frequency: 'monthly',
        dayOfMonth: 1,
        nextDueDate: '2026-05-01',
        isActive: true,
        notes: 'Statik IP və təhlükəsiz POS rabitə xətti.',
      },
    ];

    // 8. Shared allocations
    this.sharedAllocations = [
      {
        id: 'alloc-1',
        title: 'Aprel Ayı Mərkəzi Brend Kampaniyası Xərci',
        totalAmountQapik: toQapik(600000), // 6,000.00 ₼
        categoryId: 'cat-marketing',
        categoryName: 'Marketinq və Reklam',
        date: '2026-04-01',
        allocationRule: 'fixed_percentage',
        shares: [
          {
            branchId: 'branch-1',
            branchName: '28 May Flaman Filialı',
            percentage: 40,
            allocatedAmountQapik: toQapik(240000), // 2,400.00 ₼
          },
          {
            branchId: 'branch-2',
            branchName: 'Gənclik Mall Filialı',
            percentage: 35,
            allocatedAmountQapik: toQapik(210000), // 2,100.00 ₼
          },
          {
            branchId: 'branch-3',
            branchName: 'Dəniz Mall Filialı',
            percentage: 25,
            allocatedAmountQapik: toQapik(150000), // 1,500.00 ₼
          },
        ],
        status: 'applied',
        appliedAt: '2026-04-02T10:00:00Z',
        appliedBy: 'Nərgiz Rüstəmova (Mühasib)',
      },
    ];

    // 9. Other income
    this.otherIncome = [
      {
        id: 'inc-1',
        documentNumber: 'INC-2026-0001',
        category: 'rental',
        categoryName: 'Vitrin Alt-İcarə Gəliri',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        amountQapik: toQapik(45000), // 450.00 ₼
        receivedAccountId: 'acc-1',
        receivedAccountName: '28 May Filial Kassası',
        date: '2026-04-05',
        description: 'Qəhvə köşkü üçün filial girişində kiçik künc icarəsi',
        payerName: 'Coffee Corner MMC',
        createdAt: '2026-04-05T11:00:00Z',
      },
    ];

    // 10. Customer Receivables
    this.customerReceivables = [
      {
        id: 'rec-cust-1',
        customerName: 'AzərTurizm QSC',
        customerVoenOrId: '1300928471',
        invoiceNumber: 'INV-CORP-2026-01',
        invoiceDate: '2026-03-20',
        dueDate: '2026-04-05',
        totalAmountQapik: toQapik(650000), // 6,500.00 ₼
        paidAmountQapik: toQapik(380000), // 3,800.00 ₼
        remainingAmountQapik: toQapik(270000), // 2,700.00 ₼
        daysOverdue: 5,
        status: 'overdue',
      },
      {
        id: 'rec-cust-2',
        customerName: 'SOCAR Downstream Management',
        customerVoenOrId: '1400284751',
        invoiceNumber: 'INV-CORP-2026-02',
        invoiceDate: '2026-04-01',
        dueDate: '2026-04-20',
        totalAmountQapik: toQapik(420000), // 4,200.00 ₼
        paidAmountQapik: toQapik(0),
        remainingAmountQapik: toQapik(420000), // 4,200.00 ₼
        daysOverdue: 0,
        status: 'current',
      },
      {
        id: 'rec-cust-3',
        customerName: 'Baku Media Center',
        customerVoenOrId: '1500392817',
        invoiceNumber: 'INV-CORP-2026-03',
        invoiceDate: '2026-02-10',
        dueDate: '2026-02-28',
        totalAmountQapik: toQapik(180000), // 1,800.00 ₼
        paidAmountQapik: toQapik(0),
        remainingAmountQapik: toQapik(180000), // 1,800.00 ₼
        daysOverdue: 41,
        status: 'overdue',
      },
    ];

    // 11. Payments
    this.payments = [
      {
        id: 'pmt-1',
        paymentNumber: 'PMT-2026-0001',
        type: 'supplier_payment',
        counterpartyId: 'supp-1',
        counterpartyName: 'Baku Fashion Distribution MMC',
        date: '2026-04-05',
        accountId: 'acc-5',
        accountName: 'PAŞA Bank Cari Hesab (AZN)',
        amountQapik: toQapik(1250000), // 12,500.00 ₼
        allocations: [
          {
            invoiceId: 'sinv-1',
            invoiceNumber: 'INV-BFD-2026-001',
            allocatedAmountQapik: toQapik(1250000),
          },
        ],
        unallocatedAdvanceQapik: toQapik(0),
        referenceNotes: 'Alış fakturası tam bağlandı.',
        performedBy: 'Nərgiz Rüstəmova (Mühasib)',
        createdAt: '2026-04-05T15:40:00Z',
      },
    ];

    // 12. Budgets
    this.budgets = [
      {
        id: 'bdg-1',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        period: '2026-04',
        categoryId: 'cat-rent',
        categoryName: 'İcarə Xərcləri',
        budgetedAmountQapik: toQapik(450000), // 4,500.00 ₼
        actualSpentQapik: toQapik(450000), // 4,500.00 ₼
        status: 'approved',
        varianceQapik: toQapik(0),
        variancePercent: 0,
        alertLevel: 'normal',
        approvedBy: 'Elmir Həsənov (Baş menecer)',
        approvedAt: '2026-03-25T11:00:00Z',
        revisions: [],
        createdAt: '2026-03-20T10:00:00Z',
        updatedAt: '2026-04-06T10:00:00Z',
      },
      {
        id: 'bdg-2',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        period: '2026-04',
        categoryId: 'cat-marketing',
        categoryName: 'Marketinq və Reklam',
        budgetedAmountQapik: toQapik(200000), // 2,000.00 ₼
        actualSpentQapik: toQapik(220000), // 2,200.00 ₼
        status: 'approved',
        varianceQapik: toQapik(20000), // +200.00 ₼
        variancePercent: 10,
        alertLevel: 'exceeded',
        approvedBy: 'Elmir Həsənov (Baş menecer)',
        approvedAt: '2026-03-25T11:00:00Z',
        revisions: [
          {
            id: 'rev-bdg-1',
            revisionNumber: 1,
            previousAmountQapik: toQapik(150000),
            newAmountQapik: toQapik(200000),
            reason: 'Bahar aksiyası üçün əlavə promo tələbi',
            requestedBy: 'Leyla Əliyeva',
            requestedAt: '2026-03-24T10:00:00Z',
            status: 'approved',
            decidedBy: 'Elmir Həsənov',
            decidedAt: '2026-03-25T11:00:00Z',
          },
        ],
        createdAt: '2026-03-20T10:00:00Z',
        updatedAt: '2026-04-09T15:20:00Z',
      },
      {
        id: 'bdg-3',
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        period: '2026-04',
        categoryId: 'cat-utilities',
        categoryName: 'Kommunal və Rabitə',
        budgetedAmountQapik: toQapik(50000), // 500.00 ₼
        actualSpentQapik: toQapik(38000), // 380.00 ₼
        status: 'approved',
        varianceQapik: toQapik(-12000),
        variancePercent: -24,
        alertLevel: 'normal',
        revisions: [],
        createdAt: '2026-03-20T10:00:00Z',
        updatedAt: '2026-04-08T11:05:00Z',
      },
    ];

    // 13. General Ledger Boundary (Mock Standalone State)
    this.chartOfAccounts = [
      { code: '221', nameAz: 'Kassa (Nağd Pul)', type: 'asset', balanceQapik: toQapik(1127070), isDebitNormal: true },
      { code: '223', nameAz: 'Bank Cari Hesabları', type: 'asset', balanceQapik: toQapik(18270000), isDebitNormal: true },
      { code: '224', nameAz: 'POS Klirinq Tranziti', type: 'asset', balanceQapik: toQapik(1645000), isDebitNormal: true },
      { code: '201', nameAz: 'Mallar və Materiallar', type: 'asset', balanceQapik: toQapik(45800000), isDebitNormal: true },
      { code: '211', nameAz: 'Alıcılarla Hesablaşmalar (Debitor)', type: 'asset', balanceQapik: toQapik(870000), isDebitNormal: true },
      { code: '531', nameAz: 'Təchizatçılara Borclar (Kreditor)', type: 'liability', balanceQapik: toQapik(16500000), isDebitNormal: false },
      { code: '521', nameAz: 'Büdcəyə Vergi Öhdəlikləri (ƏDV)', type: 'liability', balanceQapik: toQapik(2800000), isDebitNormal: false },
      { code: '601', nameAz: 'Satış Gəlirləri (Pərakəndə)', type: 'revenue', balanceQapik: toQapik(64500000), isDebitNormal: false },
      { code: '701', nameAz: 'Satılan Malların Maya Dəyəri (COGS)', type: 'expense', balanceQapik: toQapik(35400000), isDebitNormal: true },
      { code: '721', nameAz: 'Əməliyyat Xərcləri (İcarə, Maaş, Kommunal)', type: 'expense', balanceQapik: toQapik(9200000), isDebitNormal: true },
    ];

    this.postingRules = [
      {
        id: 'rule-pos-cash',
        eventCode: 'pos_sale',
        eventNameAz: 'Nağd Satış Əməliyyatı',
        debitAccountCode: '221',
        debitAccountName: 'Kassa (Nağd Pul)',
        creditAccountCode: '601',
        creditAccountName: 'Satış Gəlirləri (Pərakəndə)',
        description: 'POS kassa terminalından nağd satış vurulduqda avtomatik müxabirələşmə',
      },
      {
        id: 'rule-pos-cogs',
        eventCode: 'cogs_recognition',
        eventNameAz: 'Satılmış Malların Maya Dəyəri',
        debitAccountCode: '701',
        debitAccountName: 'Satılan Malların Maya Dəyəri (COGS)',
        creditAccountCode: '201',
        creditAccountName: 'Mallar və Materiallar',
        description: 'Çəkili orta maya dəyəri üzrə stok balansından silinmə',
      },
      {
        id: 'rule-gr-invoice',
        eventCode: 'goods_receipt',
        eventNameAz: 'Malların Mədaxili (Alış Qaiməsi)',
        debitAccountCode: '201',
        debitAccountName: 'Mallar və Materiallar',
        creditAccountCode: '531',
        creditAccountName: 'Təchizatçılara Borclar (Kreditor)',
        description: 'Malların qəbul aktı (GR) və təchizatçı fakturası üzrə anbara daxil olması',
      },
      {
        id: 'rule-exp-pay',
        eventCode: 'expense_payment',
        eventNameAz: 'Bankdan Xərc Ödənişi',
        debitAccountCode: '721',
        debitAccountName: 'Əməliyyat Xərcləri',
        creditAccountCode: '223',
        creditAccountName: 'Bank Cari Hesabları',
        description: 'İcarə, kommunal və digər inzibati xərclərin bankdan ödənilməsi',
      },
    ];

    this.journalEntries = [
      {
        id: 'je-1',
        entryNumber: 'JE-2026-0001',
        date: '2026-04-09',
        sourceDocType: 'pos_closing',
        sourceDocNumber: 'CSH-2026-0002',
        description: '28 May filialı kassa növbəsi Z-hesabat bağlanışı üzrə müxabirə',
        lines: [
          { id: 'jel-1', accountCode: '221', accountName: 'Kassa (Nağd Pul)', debitQapik: toQapik(334050), creditQapik: toQapik(0), description: 'Kassaya daxil olan nağd pul' },
          { id: 'jel-2', accountCode: '601', accountName: 'Satış Gəlirləri', debitQapik: toQapik(0), creditQapik: toQapik(334050), description: 'Günün xalis satış gəliri' },
        ],
        totalDebitQapik: toQapik(334050),
        totalCreditQapik: toQapik(334050),
        isBalanced: true,
        status: 'posted',
        createdAt: '2026-04-09T21:05:00Z',
      },
      {
        id: 'je-2',
        entryNumber: 'JE-2026-0002',
        date: '2026-04-06',
        sourceDocType: 'expense',
        sourceDocNumber: 'EXP-2026-0001',
        description: '28 May mağazası aprel ayı icarə ödənişi',
        lines: [
          { id: 'jel-3', accountCode: '721', accountName: 'Əməliyyat Xərcləri (İcarə)', debitQapik: toQapik(450000), creditQapik: toQapik(0), description: 'İcarə xərci' },
          { id: 'jel-4', accountCode: '223', accountName: 'Bank Cari Hesabları', debitQapik: toQapik(0), creditQapik: toQapik(450000), description: 'Bankdan çıxan məbləğ' },
        ],
        totalDebitQapik: toQapik(450000),
        totalCreditQapik: toQapik(450000),
        isBalanced: true,
        status: 'posted',
        createdAt: '2026-04-06T10:00:00Z',
      },
    ];
  }

  // --- Accounts & Movements ---

  async getAccounts(): Promise<FinanceAccount[]> {
    return JSON.parse(JSON.stringify(this.accounts));
  }

  async getAccountById(id: string): Promise<FinanceAccount | null> {
    const acc = this.accounts.find((a) => a.id === id);
    return acc ? JSON.parse(JSON.stringify(acc)) : null;
  }

  async getMovements(params?: FinanceFilterParams): Promise<AccountMovement[]> {
    let list = [...this.movements];

    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((m) => !m.branchId || m.branchId === params.branchId);
    }
    if (params?.accountId) {
      list = list.filter((m) => m.fromAccountId === params.accountId || m.toAccountId === params.accountId);
    }
    if (params?.startDate) {
      list = list.filter((m) => m.date >= params.startDate!);
    }
    if (params?.endDate) {
      list = list.filter((m) => m.date <= params.endDate!);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (m) =>
          m.documentNumber.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          (m.fromAccountName && m.fromAccountName.toLowerCase().includes(q)) ||
          (m.toAccountName && m.toAccountName.toLowerCase().includes(q))
      );
    }

    return JSON.parse(JSON.stringify(list));
  }

  async createMovement(
    payload: Partial<AccountMovement>,
    idempotencyKey?: string
  ): Promise<AccountMovement> {
    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      const existing = this.movements[0];
      return JSON.parse(JSON.stringify(existing));
    }
    if (idempotencyKey) {
      this.idempotencyCache.add(idempotencyKey);
    }

    const docNumber = `CSH-${new Date().getFullYear()}-${String(this.movements.length + 1).padStart(4, '0')}`;
    const newMovement: AccountMovement = {
      id: `mov-${Date.now()}`,
      documentNumber: docNumber,
      date: payload.date || new Date().toISOString().slice(0, 10),
      type: payload.type || 'transfer',
      fromAccountId: payload.fromAccountId,
      fromAccountName: payload.fromAccountName || this.accounts.find((a) => a.id === payload.fromAccountId)?.name,
      toAccountId: payload.toAccountId,
      toAccountName: payload.toAccountName || this.accounts.find((a) => a.id === payload.toAccountId)?.name,
      amountQapik: toQapik(payload.amountQapik || 0),
      branchId: payload.branchId,
      branchName: payload.branchName,
      referenceDocType: payload.referenceDocType,
      referenceDocId: payload.referenceDocId,
      description: payload.description || 'Kassa/Bank hərəkəti',
      performedBy: payload.performedBy || 'Cari İstifadəçi',
      createdAt: new Date().toISOString(),
    };

    // Update balances of involved accounts
    if (newMovement.fromAccountId) {
      const fromAcc = this.accounts.find((a) => a.id === newMovement.fromAccountId);
      if (fromAcc) {
        fromAcc.currentBalanceQapik = toQapik(Number(fromAcc.currentBalanceQapik) - Number(newMovement.amountQapik));
      }
    }
    if (newMovement.toAccountId) {
      const toAcc = this.accounts.find((a) => a.id === newMovement.toAccountId);
      if (toAcc) {
        toAcc.currentBalanceQapik = toQapik(Number(toAcc.currentBalanceQapik) + Number(newMovement.amountQapik));
      }
    }

    this.movements.unshift(newMovement);
    return JSON.parse(JSON.stringify(newMovement));
  }

  async reverseMovement(
    id: string,
    reason: string,
    performedBy: string
  ): Promise<{ original: AccountMovement; reversal: AccountMovement }> {
    const original = this.movements.find((m) => m.id === id);
    if (!original) {
      throw new Error(`Əməliyyat tapılmadı: ${id}`);
    }

    const revDocNumber = `REV-${original.documentNumber}`;
    const { original: updatedOriginal, reversal } = reverseAccountMovement(
      original,
      reason,
      performedBy,
      revDocNumber
    );

    // Update original in list
    const index = this.movements.findIndex((m) => m.id === id);
    this.movements[index] = updatedOriginal;
    this.movements.unshift(reversal);

    // Revert account balances
    if (reversal.fromAccountId) {
      const fromAcc = this.accounts.find((a) => a.id === reversal.fromAccountId);
      if (fromAcc) {
        fromAcc.currentBalanceQapik = toQapik(Number(fromAcc.currentBalanceQapik) - Number(reversal.amountQapik));
      }
    }
    if (reversal.toAccountId) {
      const toAcc = this.accounts.find((a) => a.id === reversal.toAccountId);
      if (toAcc) {
        toAcc.currentBalanceQapik = toQapik(Number(toAcc.currentBalanceQapik) + Number(reversal.amountQapik));
      }
    }

    return {
      original: JSON.parse(JSON.stringify(updatedOriginal)),
      reversal: JSON.parse(JSON.stringify(reversal)),
    };
  }

  async getDailyCashSummaries(branchId?: string, date?: string): Promise<DailyCashReportSummary[]> {
    const targetDate = date || '2026-04-09';
    const branches = [
      { id: 'branch-1', name: '28 May Flaman Filialı' },
      { id: 'branch-2', name: 'Gənclik Mall Filialı' },
      { id: 'branch-3', name: 'Dəniz Mall Filialı' },
    ];

    const filteredBranches = branchId && branchId !== 'all' ? branches.filter((b) => b.id === branchId) : branches;

    return filteredBranches.map((b) => ({
      date: targetDate,
      branchId: b.id,
      branchName: b.name,
      openingBalanceQapik: toQapik(250000), // 2,500.00 ₼
      cashSalesQapik: toQapik(334050), // 3,340.50 ₼
      otherInflowsQapik: toQapik(0),
      cashExpensesQapik: toQapik(0),
      bankDepositsQapik: toQapik(200000), // 2,000.00 ₼
      closingBalanceQapik: toQapik(384050), // 3,840.50 ₼
      discrepancyQapik: toQapik(0),
    }));
  }

  // --- Reconciliation ---

  async getTenderReconciliations(params?: FinanceFilterParams): Promise<TenderReconciliation[]> {
    let list = [...this.tenderReconciliations];
    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((r) => r.branchId === params.branchId);
    }
    return JSON.parse(JSON.stringify(list));
  }

  async resolveTenderMismatch(id: string, notes: string, resolvedBy: string): Promise<TenderReconciliation> {
    const item = this.tenderReconciliations.find((r) => r.id === id);
    if (!item) {
      throw new Error(`Üzləşmə sətiri tapılmadı: ${id}`);
    }
    item.status = 'resolved';
    item.notes = (item.notes ? `${item.notes} | ` : '') + notes;
    item.resolvedBy = resolvedBy;
    item.resolvedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(item));
  }

  async getBankStatementImports(accountId?: string): Promise<BankStatementImport[]> {
    let list = [...this.bankImports];
    if (accountId) {
      list = list.filter((i) => i.accountId === accountId);
    }
    return JSON.parse(JSON.stringify(list));
  }

  async importBankStatement(
    accountId: string,
    fileName: string,
    lines: Array<Partial<BankStatementLine>>
  ): Promise<BankStatementImport> {
    const acc = this.accounts.find((a) => a.id === accountId);
    const statementId = `imp-${Date.now()}`;

    let incoming = 0;
    let outgoing = 0;

    const parsedLines: BankStatementLine[] = lines.map((l, idx) => {
      const amt = Number(l.amountQapik || 0);
      if (amt >= 0) incoming += amt;
      else outgoing += Math.abs(amt);

      return {
        id: `line-${statementId}-${idx + 1}`,
        statementId,
        date: l.date || new Date().toISOString().slice(0, 10),
        reference: l.reference || `REF-${idx + 1}`,
        counterparty: l.counterparty || 'Naməlum Müştəri/Təchizatçı',
        description: l.description || '',
        amountQapik: toQapik(amt),
        matchStatus: 'unmatched',
      };
    });

    const newImport: BankStatementImport = {
      id: statementId,
      accountId,
      accountName: acc?.name || 'Bank Hesabı',
      fileName,
      importedAt: new Date().toISOString(),
      totalLines: parsedLines.length,
      matchedLines: 0,
      unmatchedLines: parsedLines.length,
      totalIncomingQapik: toQapik(incoming),
      totalOutgoingQapik: toQapik(outgoing),
      status: 'pending',
    };

    this.bankImports.unshift(newImport);
    this.bankLines.push(...parsedLines);

    return JSON.parse(JSON.stringify(newImport));
  }

  async getBankStatementLines(statementId: string): Promise<BankStatementLine[]> {
    const lines = this.bankLines.filter((l) => l.statementId === statementId);
    return JSON.parse(JSON.stringify(lines));
  }

  async autoMatchStatementLines(statementId: string): Promise<AutoMatchSummary> {
    const lines = this.bankLines.filter((l) => l.statementId === statementId);
    const summary = autoMatchBankStatement(lines, this.movements);

    // Update internal line states
    for (const updated of summary.lines) {
      const idx = this.bankLines.findIndex((l) => l.id === updated.id);
      if (idx !== -1) {
        this.bankLines[idx] = updated;
      }
    }

    // Update parent import stats
    const imp = this.bankImports.find((i) => i.id === statementId);
    if (imp) {
      imp.matchedLines = summary.matchedCount;
      imp.unmatchedLines = summary.unmatchedCount;
      imp.status = summary.unmatchedCount === 0 ? 'reconciled' : 'in_progress';
    }

    return summary;
  }

  async manualMatchStatementLine(lineId: string, movementId: string, notes?: string): Promise<BankStatementLine> {
    const line = this.bankLines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Çıxarış sətiri tapılmadı: ${lineId}`);

    const mov = this.movements.find((m) => m.id === movementId);
    if (!mov) throw new Error(`Kassa/Bank əməliyyatı tapılmadı: ${movementId}`);

    line.matchStatus = 'manual_matched';
    line.matchedMovementId = mov.id;
    line.matchedMovementDocNumber = mov.documentNumber;
    line.matchedMovementDescription = mov.description;
    line.matchConfidence = 100;
    if (notes) line.notes = notes;

    const imp = this.bankImports.find((i) => i.id === line.statementId);
    if (imp) {
      imp.matchedLines++;
      imp.unmatchedLines = Math.max(0, imp.unmatchedLines - 1);
    }

    return JSON.parse(JSON.stringify(line));
  }

  // --- Expenses & Recurring ---

  async getExpenseCategories(): Promise<ExpenseCategory[]> {
    return JSON.parse(JSON.stringify(this.expenseCategories));
  }

  async getExpenses(params?: FinanceFilterParams): Promise<ExpenseRecord[]> {
    let list = [...this.expenses];
    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((e) => e.branchId === params.branchId);
    }
    if (params?.categoryId) {
      list = list.filter((e) => e.categoryId === params.categoryId);
    }
    if (params?.status) {
      list = list.filter((e) => e.status === params.status);
    }
    if (params?.startDate) {
      list = list.filter((e) => e.date >= params.startDate!);
    }
    if (params?.endDate) {
      list = list.filter((e) => e.date <= params.endDate!);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (e) =>
          e.documentNumber.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.supplierName && e.supplierName.toLowerCase().includes(q))
      );
    }
    return JSON.parse(JSON.stringify(list));
  }

  async getExpenseById(id: string): Promise<ExpenseRecord | null> {
    const exp = this.expenses.find((e) => e.id === id);
    return exp ? JSON.parse(JSON.stringify(exp)) : null;
  }

  async createExpense(payload: Partial<ExpenseRecord>, idempotencyKey?: string): Promise<ExpenseRecord> {
    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return JSON.parse(JSON.stringify(this.expenses[0]));
    }
    if (idempotencyKey) this.idempotencyCache.add(idempotencyKey);

    const cat = this.expenseCategories.find((c) => c.id === payload.categoryId);
    const amountQapik = toQapik(payload.amountQapik || 0);
    const taxRatePercent = payload.taxRatePercent !== undefined ? payload.taxRatePercent : 18;
    const taxAmountQapik = toQapik(Math.round((amountQapik * taxRatePercent) / 100));
    const totalAmountQapik = toQapik(amountQapik + taxAmountQapik);

    let threshold: 'branch_manager' | 'accountant' | 'general_manager' = 'branch_manager';
    if (totalAmountQapik > toQapik(500000)) {
      threshold = 'general_manager'; // > 5,000 AZN
    } else if (totalAmountQapik > toQapik(50000)) {
      threshold = 'accountant'; // 500 - 5,000 AZN
    }

    const docNumber = `EXP-${new Date().getFullYear()}-${String(this.expenses.length + 1).padStart(4, '0')}`;
    const newExpense: ExpenseRecord = {
      id: `exp-${Date.now()}`,
      documentNumber: docNumber,
      categoryId: payload.categoryId || 'cat-other',
      categoryCode: cat?.code || 'other',
      categoryName: cat?.nameAz || 'Digər Əməliyyat Xərcləri',
      subcategoryId: payload.subcategoryId,
      subcategoryName: payload.subcategoryName,
      branchId: payload.branchId || 'branch-1',
      branchName: payload.branchName || '28 May Flaman Filialı',
      supplierId: payload.supplierId,
      supplierName: payload.supplierName,
      amountQapik,
      taxClassId: payload.taxClassId || 'tax-1',
      taxRatePercent,
      taxAmountQapik,
      totalAmountQapik,
      paymentAccountId: payload.paymentAccountId,
      paymentAccountName: payload.paymentAccountName,
      paymentMethod: payload.paymentMethod || 'bank_transfer',
      date: payload.date || new Date().toISOString().slice(0, 10),
      description: payload.description || 'Xərc qeydiyyatı',
      status: 'draft',
      attachments: payload.attachments || [],
      approvalThresholdLevel: threshold,
      submittedBy: payload.submittedBy || 'Cari İstifadəçi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.expenses.unshift(newExpense);
    return JSON.parse(JSON.stringify(newExpense));
  }

  async submitExpense(id: string): Promise<ExpenseRecord> {
    const exp = this.expenses.find((e) => e.id === id);
    if (!exp) throw new Error(`Xərc tapılmadı: ${id}`);
    exp.status = 'submitted';
    exp.submittedAt = new Date().toISOString();
    exp.updatedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(exp));
  }

  async approveExpense(id: string, approvedBy: string): Promise<ExpenseRecord> {
    const exp = this.expenses.find((e) => e.id === id);
    if (!exp) throw new Error(`Xərc tapılmadı: ${id}`);
    exp.status = 'approved';
    exp.approvedBy = approvedBy;
    exp.approvedAt = new Date().toISOString();
    exp.updatedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(exp));
  }

  async rejectExpense(id: string, reason: string, rejectedBy: string): Promise<ExpenseRecord> {
    const exp = this.expenses.find((e) => e.id === id);
    if (!exp) throw new Error(`Xərc tapılmadı: ${id}`);
    exp.status = 'rejected';
    exp.rejectionReason = reason;
    exp.rejectedBy = rejectedBy;
    exp.rejectedAt = new Date().toISOString();
    exp.updatedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(exp));
  }

  async payExpense(id: string, accountId: string, paidBy: string): Promise<ExpenseRecord> {
    const exp = this.expenses.find((e) => e.id === id);
    if (!exp) throw new Error(`Xərc tapılmadı: ${id}`);

    const acc = this.accounts.find((a) => a.id === accountId);
    exp.status = 'paid';
    exp.paymentAccountId = accountId;
    exp.paymentAccountName = acc?.name;
    exp.paidBy = paidBy;
    exp.paidAt = new Date().toISOString();
    exp.updatedAt = new Date().toISOString();

    // Generate movement
    await this.createMovement({
      type: 'expense_payment',
      fromAccountId: accountId,
      amountQapik: exp.totalAmountQapik,
      branchId: exp.branchId,
      branchName: exp.branchName,
      referenceDocType: 'expense',
      referenceDocId: exp.id,
      referenceDocNumber: exp.documentNumber,
      description: `Ödəniş: ${exp.documentNumber} (${exp.categoryName}) — ${exp.description}`,
      performedBy: paidBy,
    });

    return JSON.parse(JSON.stringify(exp));
  }

  async reverseExpense(
    id: string,
    reason: string,
    performedBy: string
  ): Promise<{ original: ExpenseRecord; reversal: ExpenseRecord }> {
    const original = this.expenses.find((e) => e.id === id);
    if (!original) throw new Error(`Xərc tapılmadı: ${id}`);

    const revDocNumber = `REV-${original.documentNumber}`;
    const { original: updatedOriginal, reversal } = reverseExpenseRecord(
      original,
      reason,
      performedBy,
      revDocNumber
    );

    const index = this.expenses.findIndex((e) => e.id === id);
    this.expenses[index] = updatedOriginal;
    this.expenses.unshift(reversal);

    return {
      original: JSON.parse(JSON.stringify(updatedOriginal)),
      reversal: JSON.parse(JSON.stringify(reversal)),
    };
  }

  async getRecurringSchedules(): Promise<RecurringExpenseSchedule[]> {
    return JSON.parse(JSON.stringify(this.recurringSchedules));
  }

  async generateDraftFromRecurring(scheduleId: string): Promise<ExpenseRecord> {
    const sched = this.recurringSchedules.find((s) => s.id === scheduleId);
    if (!sched) throw new Error(`Təkrarlanan qrafik tapılmadı: ${scheduleId}`);

    const newDraft = await this.createExpense({
      categoryId: sched.categoryId,
      subcategoryId: sched.subcategoryId,
      subcategoryName: sched.subcategoryName,
      branchId: sched.branchId,
      branchName: sched.branchName,
      supplierName: sched.supplierName,
      amountQapik: sched.estimatedAmountQapik,
      date: new Date().toISOString().slice(0, 10),
      description: `Dövri Plan Üzrə Xərc: ${sched.title}`,
      submittedBy: 'Sistem Avtomatlaşdırması (Draft Generator)',
    });

    sched.lastDraftGeneratedAt = new Date().toISOString();
    return newDraft;
  }

  async getSharedAllocations(): Promise<SharedExpenseAllocation[]> {
    return JSON.parse(JSON.stringify(this.sharedAllocations));
  }

  async previewSharedAllocation(
    totalAmountQapik: Qapik,
    categoryId: string,
    rule: 'fixed_percentage' | 'sales_proportional'
  ): Promise<SharedExpenseAllocation> {
    const cat = this.expenseCategories.find((c) => c.id === categoryId);
    const branches = [
      { id: 'branch-1', name: '28 May Flaman Filialı', pct: 40 },
      { id: 'branch-2', name: 'Gənclik Mall Filialı', pct: 35 },
      { id: 'branch-3', name: 'Dəniz Mall Filialı', pct: 25 },
    ];

    const total = Number(totalAmountQapik);
    const shares = branches.map((b) => ({
      branchId: b.id,
      branchName: b.name,
      percentage: b.pct,
      allocatedAmountQapik: toQapik(Math.round((total * b.pct) / 100)),
    }));

    return {
      id: `alloc-prev-${Date.now()}`,
      title: `Ortaq Xərc Bölgüsü (${cat?.nameAz || 'Xərc'})`,
      totalAmountQapik,
      categoryId,
      categoryName: cat?.nameAz || 'Xərc',
      date: new Date().toISOString().slice(0, 10),
      allocationRule: rule,
      shares,
      status: 'preview',
    };
  }

  async applySharedAllocation(allocationId: string, appliedBy: string): Promise<SharedExpenseAllocation> {
    const alloc = this.sharedAllocations.find((a) => a.id === allocationId);
    if (alloc) {
      alloc.status = 'applied';
      alloc.appliedBy = appliedBy;
      alloc.appliedAt = new Date().toISOString();
      return JSON.parse(JSON.stringify(alloc));
    }

    // If it was previewed and submitted directly
    const newAlloc: SharedExpenseAllocation = {
      id: `alloc-${Date.now()}`,
      title: 'Mərkəzi Ortaq Xərc Bölgüsü',
      totalAmountQapik: toQapik(600000),
      categoryId: 'cat-marketing',
      categoryName: 'Marketinq və Reklam',
      date: new Date().toISOString().slice(0, 10),
      allocationRule: 'fixed_percentage',
      shares: [
        { branchId: 'branch-1', branchName: '28 May Flaman Filialı', percentage: 40, allocatedAmountQapik: toQapik(240000) },
        { branchId: 'branch-2', branchName: 'Gənclik Mall Filialı', percentage: 35, allocatedAmountQapik: toQapik(210000) },
        { branchId: 'branch-3', branchName: 'Dəniz Mall Filialı', percentage: 25, allocatedAmountQapik: toQapik(150000) },
      ],
      status: 'applied',
      appliedBy,
      appliedAt: new Date().toISOString(),
    };

    this.sharedAllocations.unshift(newAlloc);
    return JSON.parse(JSON.stringify(newAlloc));
  }

  async getOtherIncomeRecords(params?: FinanceFilterParams): Promise<OtherIncomeRecord[]> {
    let list = [...this.otherIncome];
    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((i) => i.branchId === params.branchId);
    }
    return JSON.parse(JSON.stringify(list));
  }

  async createOtherIncome(payload: Partial<OtherIncomeRecord>): Promise<OtherIncomeRecord> {
    const docNumber = `INC-${new Date().getFullYear()}-${String(this.otherIncome.length + 1).padStart(4, '0')}`;
    const newInc: OtherIncomeRecord = {
      id: `inc-${Date.now()}`,
      documentNumber: docNumber,
      category: payload.category || 'other',
      categoryName: payload.categoryName || 'Digər Gəlir',
      branchId: payload.branchId || 'branch-1',
      branchName: payload.branchName || '28 May Flaman Filialı',
      amountQapik: toQapik(payload.amountQapik || 0),
      receivedAccountId: payload.receivedAccountId || 'acc-1',
      receivedAccountName: payload.receivedAccountName || '28 May Filial Kassası',
      date: payload.date || new Date().toISOString().slice(0, 10),
      description: payload.description || 'Gəlir qeydi',
      payerName: payload.payerName || 'Ödəyici',
      createdAt: new Date().toISOString(),
    };

    this.otherIncome.unshift(newInc);
    return JSON.parse(JSON.stringify(newInc));
  }

  // --- Payables & Receivables ---

  async getCustomerReceivables(_params?: FinanceFilterParams): Promise<CustomerReceivable[]> {
    return JSON.parse(JSON.stringify(this.customerReceivables));
  }

  async getReceivablesAging(referenceDate?: string): Promise<AgingBucketSummary> {
    return calculateReceivablesAging(this.customerReceivables, referenceDate);
  }

  async getPayments(_params?: FinanceFilterParams): Promise<PaymentRecord[]> {
    return JSON.parse(JSON.stringify(this.payments));
  }

  async recordPayment(payload: Partial<PaymentRecord>, _idempotencyKey?: string): Promise<PaymentRecord> {
    const pmtNumber = `PMT-${new Date().getFullYear()}-${String(this.payments.length + 1).padStart(4, '0')}`;
    const newPayment: PaymentRecord = {
      id: `pmt-${Date.now()}`,
      paymentNumber: pmtNumber,
      type: payload.type || 'customer_collection',
      counterpartyId: payload.counterpartyId || 'cust-1',
      counterpartyName: payload.counterpartyName || 'Müştəri',
      date: payload.date || new Date().toISOString().slice(0, 10),
      accountId: payload.accountId || 'acc-4',
      accountName: payload.accountName || 'ABB Cari Hesab',
      amountQapik: toQapik(payload.amountQapik || 0),
      allocations: payload.allocations || [],
      unallocatedAdvanceQapik: toQapik(payload.unallocatedAdvanceQapik || 0),
      referenceNotes: payload.referenceNotes,
      performedBy: payload.performedBy || 'Mühasib',
      createdAt: new Date().toISOString(),
    };

    this.payments.unshift(newPayment);
    return JSON.parse(JSON.stringify(newPayment));
  }

  // --- Budgets ---

  async getBudgets(params?: FinanceFilterParams): Promise<BudgetPlan[]> {
    let list = [...this.budgets];
    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((b) => b.branchId === params.branchId);
    }
    return JSON.parse(JSON.stringify(list));
  }

  async createBudget(payload: Partial<BudgetPlan>): Promise<BudgetPlan> {
    const cat = this.expenseCategories.find((c) => c.id === payload.categoryId);
    const budgetedAmountQapik = toQapik(payload.budgetedAmountQapik || 0);
    const actualSpentQapik = toQapik(payload.actualSpentQapik || 0);
    const variance = calculateBudgetVariance(budgetedAmountQapik, actualSpentQapik);

    const newBudget: BudgetPlan = {
      id: `bdg-${Date.now()}`,
      branchId: payload.branchId || 'branch-1',
      branchName: payload.branchName || '28 May Flaman Filialı',
      period: payload.period || '2026-04',
      categoryId: payload.categoryId || 'cat-other',
      categoryName: cat?.nameAz || 'Digər Xərclər',
      budgetedAmountQapik,
      actualSpentQapik,
      status: 'approved',
      varianceQapik: variance.varianceQapik,
      variancePercent: variance.variancePercent,
      alertLevel: variance.alertLevel,
      revisions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.budgets.unshift(newBudget);
    return JSON.parse(JSON.stringify(newBudget));
  }

  async requestBudgetRevision(
    budgetId: string,
    newAmountQapik: Qapik,
    reason: string,
    requestedBy: string
  ): Promise<BudgetPlan> {
    const budget = this.budgets.find((b) => b.id === budgetId);
    if (!budget) throw new Error(`Büdcə tapılmadı: ${budgetId}`);

    const rev: BudgetPlan['revisions'][0] = {
      id: `rev-${Date.now()}`,
      revisionNumber: budget.revisions.length + 1,
      previousAmountQapik: budget.budgetedAmountQapik,
      newAmountQapik,
      reason,
      requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    budget.revisions.unshift(rev);
    return JSON.parse(JSON.stringify(budget));
  }

  async decideBudgetRevision(
    budgetId: string,
    revisionId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    decisionNote?: string
  ): Promise<BudgetPlan> {
    const budget = this.budgets.find((b) => b.id === budgetId);
    if (!budget) throw new Error(`Büdcə tapılmadı: ${budgetId}`);

    const rev = budget.revisions.find((r: BudgetRevision) => r.id === revisionId);
    if (!rev) throw new Error(`Təftiş qeydi tapılmadı: ${revisionId}`);

    rev.status = decision;
    rev.decidedBy = decidedBy;
    rev.decidedAt = new Date().toISOString();
    rev.decisionNote = decisionNote;

    if (decision === 'approved') {
      budget.budgetedAmountQapik = rev.newAmountQapik;
      const variance = calculateBudgetVariance(budget.budgetedAmountQapik, budget.actualSpentQapik);
      budget.varianceQapik = variance.varianceQapik;
      budget.variancePercent = variance.variancePercent;
      budget.alertLevel = variance.alertLevel;
    }

    budget.updatedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(budget));
  }

  // --- Reports ---

  async getManagementPnl(params?: FinanceFilterParams): Promise<ManagementPnlReport> {
    const branchName =
      params?.branchId && params.branchId !== 'all'
        ? this.accounts.find((a) => a.branchId === params.branchId)?.branchName || 'Seçilmiş Filial'
        : 'Bütün Filiallar (Konsolidasiya)';

    // Scale numbers realistically based on filter
    const scale = params?.branchId && params.branchId !== 'all' ? 0.35 : 1.0;

    const grossSalesQapik = toQapik(Math.round(48500000 * scale)); // ~485,000 ₼
    const returnsQapik = toQapik(Math.round(1500000 * scale)); // ~15,000 ₼
    const cogsQapik = toQapik(Math.round(25800000 * scale)); // ~258,000 ₼

    const operatingExpenses = [
      { categoryId: 'cat-rent', categoryName: 'İcarə Xərcləri', amountQapik: toQapik(Math.round(4500000 * scale)), drillDownCount: 3 },
      { categoryId: 'cat-salary', categoryName: 'Əməkhaqqı və Mükafatlar', amountQapik: toQapik(Math.round(6200000 * scale)), drillDownCount: 12 },
      { categoryId: 'cat-utilities', categoryName: 'Kommunal və Rabitə', amountQapik: toQapik(Math.round(480000 * scale)), drillDownCount: 4 },
      { categoryId: 'cat-marketing', categoryName: 'Marketinq və Reklam', amountQapik: toQapik(Math.round(1800000 * scale)), drillDownCount: 5 },
      { categoryId: 'cat-transport', categoryName: 'Nəqliyyat və Logistika', amountQapik: toQapik(Math.round(350000 * scale)), drillDownCount: 2 },
      { categoryId: 'cat-maintenance', categoryName: 'Təmir və Təsərrüfat', amountQapik: toQapik(Math.round(220000 * scale)), drillDownCount: 3 },
      { categoryId: 'cat-tax', categoryName: 'Vergilər və Rüsumlar', amountQapik: toQapik(Math.round(1100000 * scale)), drillDownCount: 2 },
    ];

    return calculateManagementPnl({
      period: '2026-Q1 (Yanvar - Mart)',
      branchFilterName: branchName,
      cogsMethodLabel: 'Çəkili Orta Maya (Weighted Average)',
      grossSalesQapik,
      returnsQapik,
      cogsQapik,
      operatingExpenses,
      hasMissingCostData: false,
      unapprovedExpenseCount: 0,
    });
  }

  async getCashFlowReport(params?: FinanceFilterParams): Promise<CashFlowReport> {
    const branchName =
      params?.branchId && params.branchId !== 'all'
        ? this.accounts.find((a) => a.branchId === params.branchId)?.branchName || 'Seçilmiş Filial'
        : 'Bütün Filiallar (Konsolidasiya)';

    return deriveCashFlowDirectMethod({
      period: '2026-Q1 (Yanvar - Mart)',
      branchFilterName: branchName,
      openingCashAndBankQapik: toQapik(12500000), // 125,000.00 ₼
      movements: this.movements,
    });
  }

  async getDrillDownTransactions(_lineId: string, _params?: FinanceFilterParams): Promise<DrillDownTransaction[]> {
    return [
      {
        id: 'dd-1',
        date: '2026-04-06',
        documentNumber: 'EXP-2026-0001',
        branchName: '28 May Flaman Filialı',
        categoryOrTender: 'İcarə Xərcləri',
        description: '28 May mağazasının aprel ayı icarə haqqı ödənişi',
        amountQapik: toQapik(450000),
      },
      {
        id: 'dd-2',
        date: '2026-04-01',
        documentNumber: 'EXP-2026-0008',
        branchName: 'Gənclik Mall Filialı',
        categoryOrTender: 'İcarə Xərcləri',
        description: 'Gənclik Mall ticarət mərkəzi icarə qaiməsi',
        amountQapik: toQapik(480000),
      },
      {
        id: 'dd-3',
        date: '2026-04-01',
        documentNumber: 'EXP-2026-0009',
        branchName: 'Dəniz Mall Filialı',
        categoryOrTender: 'İcarə Xərcləri',
        description: 'Dəniz Mall mağaza icarə haqqı',
        amountQapik: toQapik(390000),
      },
    ];
  }

  // --- GL Boundary ---

  async getGlIntegrationState(): Promise<GlIntegrationState> {
    return {
      isGlEnabled: false, // Explicitly false!
      glProviderName: 'Xarici 1C / SAP / GL Modulu',
      connectionStatus: 'unconfigured',
      statusMessageAz: 'Aktiv deyil: Xarici Baş Kitab (General Ledger) inteqrasiyası hazırda aktivləşdirilməyib. Əməliyyatlar operativ maliyyə rejimində qeydə alınır.',
    };
  }

  async getChartOfAccounts(): Promise<ChartOfAccountsItem[]> {
    return JSON.parse(JSON.stringify(this.chartOfAccounts));
  }

  async getPostingRules(): Promise<PostingRuleMapping[]> {
    return JSON.parse(JSON.stringify(this.postingRules));
  }

  async getJournalEntries(): Promise<JournalEntry[]> {
    return JSON.parse(JSON.stringify(this.journalEntries));
  }

  // --- Unified Approvals Inbox ---

  async getPendingApprovals(): Promise<ApprovalInboxItem[]> {
    const list: ApprovalInboxItem[] = [];

    // Expenses requiring approval
    for (const exp of this.expenses) {
      if (exp.status === 'submitted') {
        list.push({
          id: `app-exp-${exp.id}`,
          entityType: 'expense',
          entityId: exp.id,
          documentNumber: exp.documentNumber,
          title: `${exp.categoryName} — ${exp.description}`,
          branchName: exp.branchName,
          amountQapik: exp.totalAmountQapik,
          submittedBy: exp.submittedBy,
          submittedAt: exp.submittedAt || exp.createdAt,
          status: 'pending',
          thresholdNote:
            exp.approvalThresholdLevel === 'general_manager'
              ? 'Rəhbərlik Təsdiqi (> 5,000 ₼)'
              : exp.approvalThresholdLevel === 'accountant'
              ? 'Baş Mühasib Təsdiqi (500 – 5,000 ₼)'
              : 'Filial Meneceri Təsdiqi (< 500 ₼)',
          history: [
            { timestamp: exp.createdAt, user: exp.submittedBy, action: 'Yaradıldı (Qaralama)' },
            { timestamp: exp.submittedAt || exp.createdAt, user: exp.submittedBy, action: 'Təsdiqə Göndərildi' },
          ],
        });
      }
    }

    // Budget revisions
    for (const bdg of this.budgets) {
      for (const rev of bdg.revisions) {
        if (rev.status === 'pending') {
          list.push({
            id: `app-bdg-${rev.id}`,
            entityType: 'budget_revision',
            entityId: bdg.id,
            documentNumber: `B-REV-${rev.revisionNumber}`,
            title: `Büdcə Limit Dəyişikliyi: ${bdg.categoryName} (${bdg.branchName})`,
            branchName: bdg.branchName,
            amountQapik: rev.newAmountQapik,
            submittedBy: rev.requestedBy,
            submittedAt: rev.requestedAt,
            status: 'pending',
            thresholdNote: 'Maliyyə Planı Təftişi',
            history: [
              { timestamp: rev.requestedAt, user: rev.requestedBy, action: `Dəyişiklik tələb olundu: ${rev.reason}` },
            ],
          });
        }
      }
    }

    return list;
  }
}
