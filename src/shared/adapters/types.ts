import { Branch, PaginatedResult, Product, ProductFilterParams } from '../types/models';
import {
  CatalogProduct,
  CatalogFilterParams,
  ProductCategoryTaxonomy,
  Brand,
  ProductStatus,
} from '../../features/catalog/types/catalog';

export interface ProductRepository {
  getProducts(params?: ProductFilterParams): Promise<PaginatedResult<Product>>;
  getProductById(id: string): Promise<Product | null>;
  createProduct(
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<Product>;
  updateProduct(id: string, updates: Partial<Product>): Promise<Product>;
  deleteProduct(id: string): Promise<boolean>;
}

export interface CatalogRepository {
  getProducts(params?: CatalogFilterParams): Promise<PaginatedResult<CatalogProduct>>;
  getProductById(id: string): Promise<CatalogProduct | null>;
  createProduct(
    product: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<CatalogProduct>;
  updateProduct(id: string, updates: Partial<CatalogProduct>): Promise<CatalogProduct>;
  deleteProduct(id: string): Promise<boolean>;
  bulkUpdateStatus(productIds: string[], status: ProductStatus): Promise<number>;
  bulkUpdateCategory(
    productIds: string[],
    categoryId: string,
    categoryName: string
  ): Promise<number>;
  checkIdentifierUniqueness(
    sku: string,
    barcode: string,
    excludeProductId?: string
  ): Promise<{ skuAvailable: boolean; barcodeAvailable: boolean }>;
  getCategories(): Promise<ProductCategoryTaxonomy[]>;
  saveCategory(category: Partial<ProductCategoryTaxonomy>): Promise<ProductCategoryTaxonomy>;
  deleteCategory(id: string, reassignToId?: string): Promise<boolean>;
  getBrands(): Promise<Brand[]>;
  saveBrand(brand: Partial<Brand>): Promise<Brand>;
  deleteBrand(id: string): Promise<boolean>;
  importProducts(
    products: Partial<CatalogProduct>[]
  ): Promise<{ importedCount: number; errors: Array<{ row: number; reason: string }> }>;
}

export interface BranchRepository {
  getBranches(): Promise<Branch[]>;
  getBranchById(id: string): Promise<Branch | null>;
}

export interface DashboardRepository {
  getSummary(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').DashboardSummaryResponse>;
  getSalesTrend(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').SalesTrendDataPoint[]>;
  getSalesByBranch(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').BranchSalesDataPoint[]>;
  getSectionTypeSales(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').SectionTypeSalesData>;
  getTopSellingProducts(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').TopSellingProductsData>;
  getPaymentBreakdown(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').PaymentBreakdownData>;
  getInventoryAlerts(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').InventoryAlertsData>;
  getSlowMovingStock(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').SlowMovingStockData>;
  getExpenseTrend(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').ExpenseTrendData>;
  getOperationsStatus(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').OperationsStatusData>;
  getActivities(params: import('../../features/dashboard/types').DashboardFilterParams): Promise<import('../../features/dashboard/types').DashboardActivitiesData>;
}

export interface InventoryRepository {
  getMovements(params?: import('../../features/inventory/types').MovementFilterParams): Promise<PaginatedResult<import('../../features/inventory/types').StockMovement>>;
  getStockBalances(params?: import('../../features/inventory/types').StockFilterParams): Promise<import('../../features/inventory/types').StockBalance[]>;
  getVariantMatrix(productId: string, warehouseId: string): Promise<import('../../features/inventory/services/ledgerEngine').VariantMatrixData>;
  getStockDocuments(params?: { type?: string; status?: string; warehouseId?: string }): Promise<import('../../features/inventory/types').StockDocument[]>;
  getStockDocumentById(id: string): Promise<import('../../features/inventory/types').StockDocument | null>;
  createStockDocument(doc: Partial<import('../../features/inventory/types').StockDocument>, idempotencyKey?: string): Promise<import('../../features/inventory/types').StockDocument>;
  confirmStockDocument(id: string, idempotencyKey?: string): Promise<import('../../features/inventory/types').StockDocument>;
  getCountSessions(params?: { status?: string; warehouseId?: string }): Promise<import('../../features/inventory/types').InventoryCountSession[]>;
  getCountSessionById(id: string): Promise<import('../../features/inventory/types').InventoryCountSession | null>;
  createCountSession(payload: Partial<import('../../features/inventory/types').InventoryCountSession>, idempotencyKey?: string): Promise<import('../../features/inventory/types').InventoryCountSession>;
  logCountScan(sessionId: string, payload: { barcodeOrSku: string; delta: number; isUndo?: boolean; manualQty?: number }): Promise<import('../../features/inventory/types').InventoryCountSession>;
  toggleRecountItem(sessionId: string, itemId: string): Promise<import('../../features/inventory/types').InventoryCountSession>;
  updateCountSessionStatus(sessionId: string, status: import('../../features/inventory/types').InventoryCountStatus): Promise<import('../../features/inventory/types').InventoryCountSession>;
  approveCountSession(sessionId: string, idempotencyKey?: string): Promise<{ session: import('../../features/inventory/types').InventoryCountSession; adjustmentDocument: import('../../features/inventory/types').StockDocument }>;
  importOpeningBalance(warehouseId: string, rows: import('../../features/inventory/types').OpeningBalanceRow[], override: boolean, overrideReason?: string, idempotencyKey?: string): Promise<import('../../features/inventory/types').StockDocument>;
  getOpeningBalanceRecords(): Promise<import('../../features/inventory/types').OpeningBalanceRecord[]>;
  getAlertRules(): Promise<import('../../features/inventory/types').StockAlertRule[]>;
  saveAlertRule(rule: Partial<import('../../features/inventory/types').StockAlertRule>): Promise<import('../../features/inventory/types').StockAlertRule>;
  deleteAlertRule(id: string): Promise<boolean>;
  getWarehouses(): Promise<import('./mock/adminMockData').AdminWarehouse[]>;
  getWarehouseById(id: string): Promise<import('./mock/adminMockData').AdminWarehouse | null>;
  getWarehouseBins(warehouseId: string): Promise<import('../../features/inventory/types').WarehouseBinZone[]>;
}

export interface TransferRepository {
  getTransfers(params?: import('../../features/transfers/types').TransferFilterParams): Promise<import('../../features/transfers/types').Transfer[]>;
  getTransferById(id: string): Promise<import('../../features/transfers/types').Transfer | null>;
  createTransfer(payload: import('../../features/transfers/types').CreateTransferPayload, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  submitTransfer(id: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  approveTransfer(id: string, notes?: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  rejectTransfer(id: string, reason: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  startPicking(id: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  updatePicking(id: string, payload: import('../../features/transfers/types').UpdatePickingPayload, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  dispatchTransfer(id: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  receiveTransfer(id: string, payload: import('../../features/transfers/types').ReceiveTransferPayload, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
  cancelTransfer(id: string, reason: string, idempotencyKey?: string): Promise<import('../../features/transfers/types').Transfer>;
}

export interface SupplierRepository {
  getSuppliers(params?: import('../../features/suppliers/types').SupplierFilterParams): Promise<PaginatedResult<import('../../features/suppliers/types').Supplier>>;
  getSupplierById(id: string): Promise<import('../../features/suppliers/types').Supplier | null>;
  createSupplier(payload: Omit<import('../../features/suppliers/types').Supplier, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>): Promise<import('../../features/suppliers/types').Supplier>;
  updateSupplier(id: string, updates: Partial<import('../../features/suppliers/types').Supplier>): Promise<import('../../features/suppliers/types').Supplier>;
  deleteSupplier(id: string): Promise<boolean>;
  getSupplierContacts(supplierId: string): Promise<import('../../features/suppliers/types').SupplierContact[]>;
  saveSupplierContact(contact: Partial<import('../../features/suppliers/types').SupplierContact>): Promise<import('../../features/suppliers/types').SupplierContact>;
  deleteSupplierContact(id: string): Promise<boolean>;
  getSupplierContracts(supplierId: string): Promise<import('../../features/suppliers/types').SupplierContract[]>;
  saveSupplierContract(contract: Partial<import('../../features/suppliers/types').SupplierContract>): Promise<import('../../features/suppliers/types').SupplierContract>;
  getSupplierProducts(supplierId: string): Promise<import('../../features/suppliers/types').SupplierProductItem[]>;
  getSupplierStatement(supplierId: string): Promise<import('../../features/suppliers/types').SupplierStatementEntry[]>;
  getSupplierPerformance(supplierId: string): Promise<import('../../features/suppliers/types').SupplierPerformanceMetrics>;
  getSupplierAuditLogs(supplierId: string): Promise<import('../../features/suppliers/types').SupplierAuditEntry[]>;
}

export interface PurchasingRepository {
  // Requests
  getPurchaseRequests(params?: import('../../features/purchasing/types').PurchasingFilterParams): Promise<import('../../features/purchasing/types').PurchaseRequest[]>;
  getPurchaseRequestById(id: string): Promise<import('../../features/purchasing/types').PurchaseRequest | null>;
  createPurchaseRequest(payload: Partial<import('../../features/purchasing/types').PurchaseRequest>): Promise<import('../../features/purchasing/types').PurchaseRequest>;
  updatePurchaseRequestStatus(id: string, decision: 'approved' | 'rejected' | 'returned_for_edit', reason?: string): Promise<import('../../features/purchasing/types').PurchaseRequest>;
  getSuggestedReorderItems(warehouseId?: string): Promise<import('../../features/purchasing/types').SuggestedReorderItem[]>;

  // Orders
  getPurchaseOrders(params?: import('../../features/purchasing/types').PurchasingFilterParams): Promise<import('../../features/purchasing/types').PurchaseOrder[]>;
  getPurchaseOrderById(id: string): Promise<import('../../features/purchasing/types').PurchaseOrder | null>;
  createPurchaseOrder(payload: Partial<import('../../features/purchasing/types').PurchaseOrder>): Promise<import('../../features/purchasing/types').PurchaseOrder>;
  updatePurchaseOrderStatus(id: string, status: import('../../features/purchasing/types').PurchaseOrderStatus, notes?: string): Promise<import('../../features/purchasing/types').PurchaseOrder>;
  sendPurchaseOrderEmail(id: string, toEmail?: string): Promise<{ success: boolean; message: string }>;

  // Goods Receipt
  getGoodsReceipts(params?: import('../../features/purchasing/types').PurchasingFilterParams): Promise<import('../../features/purchasing/types').GoodsReceipt[]>;
  getGoodsReceiptById(id: string): Promise<import('../../features/purchasing/types').GoodsReceipt | null>;
  createGoodsReceipt(payload: Partial<import('../../features/purchasing/types').GoodsReceipt>, idempotencyKey: string): Promise<import('../../features/purchasing/types').GoodsReceipt>;
  confirmGoodsReceipt(id: string, idempotencyKey: string): Promise<import('../../features/purchasing/types').GoodsReceipt>;

  // Invoices & Three-way Match
  getSupplierInvoices(params?: import('../../features/purchasing/types').PurchasingFilterParams): Promise<import('../../features/purchasing/types').SupplierInvoice[]>;
  getSupplierInvoiceById(id: string): Promise<import('../../features/purchasing/types').SupplierInvoice | null>;
  createSupplierInvoice(payload: Partial<import('../../features/purchasing/types').SupplierInvoice>): Promise<import('../../features/purchasing/types').SupplierInvoice>;
  updateSupplierInvoiceStatus(id: string, status: import('../../features/purchasing/types').SupplierInvoiceStatus, resolutionNote?: string): Promise<import('../../features/purchasing/types').SupplierInvoice>;
  runThreeWayMatch(invoiceId: string, options?: { toleranceQtyPercent?: number; tolerancePricePercent?: number }): Promise<import('../../features/purchasing/types').ThreeWayMatchResult>;

  // Returns & Credit Notes
  getPurchaseReturns(): Promise<import('../../features/purchasing/types').PurchaseReturn[]>;
  createPurchaseReturn(payload: Partial<import('../../features/purchasing/types').PurchaseReturn>): Promise<import('../../features/purchasing/types').PurchaseReturn>;
  getCreditNotes(): Promise<import('../../features/purchasing/types').CreditNote[]>;

  // Payments & Aging
  getSupplierPayments(params?: import('../../features/purchasing/types').PurchasingFilterParams): Promise<import('../../features/purchasing/types').SupplierPayment[]>;
  createSupplierPayment(payload: Partial<import('../../features/purchasing/types').SupplierPayment>): Promise<import('../../features/purchasing/types').SupplierPayment>;
  approveSupplierPayment(id: string): Promise<import('../../features/purchasing/types').SupplierPayment>;
  getPayablesAging(referenceDate?: string): Promise<import('../../features/purchasing/types').PayablesAgingBucket[]>;
}

export interface FinanceRepository {
  // Accounts & Movements
  getAccounts(): Promise<import('../../features/finance/types').FinanceAccount[]>;
  getAccountById(id: string): Promise<import('../../features/finance/types').FinanceAccount | null>;
  getMovements(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').AccountMovement[]>;
  createMovement(payload: Partial<import('../../features/finance/types').AccountMovement>, idempotencyKey?: string): Promise<import('../../features/finance/types').AccountMovement>;
  reverseMovement(id: string, reason: string, performedBy: string): Promise<{ original: import('../../features/finance/types').AccountMovement; reversal: import('../../features/finance/types').AccountMovement }>;
  getDailyCashSummaries(branchId?: string, date?: string): Promise<import('../../features/finance/types').DailyCashReportSummary[]>;

  // Reconciliation
  getTenderReconciliations(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').TenderReconciliation[]>;
  resolveTenderMismatch(id: string, notes: string, resolvedBy: string): Promise<import('../../features/finance/types').TenderReconciliation>;
  getBankStatementImports(accountId?: string): Promise<import('../../features/finance/types').BankStatementImport[]>;
  importBankStatement(accountId: string, fileName: string, lines: Array<Partial<import('../../features/finance/types').BankStatementLine>>): Promise<import('../../features/finance/types').BankStatementImport>;
  getBankStatementLines(statementId: string): Promise<import('../../features/finance/types').BankStatementLine[]>;
  autoMatchStatementLines(statementId: string): Promise<import('../../features/finance/utils/reconciliationMatcher').AutoMatchSummary>;
  manualMatchStatementLine(lineId: string, movementId: string, notes?: string): Promise<import('../../features/finance/types').BankStatementLine>;

  // Expenses & Recurring
  getExpenseCategories(): Promise<import('../../features/finance/types').ExpenseCategory[]>;
  getExpenses(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').ExpenseRecord[]>;
  getExpenseById(id: string): Promise<import('../../features/finance/types').ExpenseRecord | null>;
  createExpense(payload: Partial<import('../../features/finance/types').ExpenseRecord>, idempotencyKey?: string): Promise<import('../../features/finance/types').ExpenseRecord>;
  submitExpense(id: string): Promise<import('../../features/finance/types').ExpenseRecord>;
  approveExpense(id: string, approvedBy: string): Promise<import('../../features/finance/types').ExpenseRecord>;
  rejectExpense(id: string, reason: string, rejectedBy: string): Promise<import('../../features/finance/types').ExpenseRecord>;
  payExpense(id: string, accountId: string, paidBy: string): Promise<import('../../features/finance/types').ExpenseRecord>;
  reverseExpense(id: string, reason: string, performedBy: string): Promise<{ original: import('../../features/finance/types').ExpenseRecord; reversal: import('../../features/finance/types').ExpenseRecord }>;
  getRecurringSchedules(): Promise<import('../../features/finance/types').RecurringExpenseSchedule[]>;
  generateDraftFromRecurring(scheduleId: string): Promise<import('../../features/finance/types').ExpenseRecord>;
  getSharedAllocations(): Promise<import('../../features/finance/types').SharedExpenseAllocation[]>;
  previewSharedAllocation(totalAmountQapik: import('../../shared/utils/money').Qapik, categoryId: string, rule: 'fixed_percentage' | 'sales_proportional'): Promise<import('../../features/finance/types').SharedExpenseAllocation>;
  applySharedAllocation(allocationId: string, appliedBy: string): Promise<import('../../features/finance/types').SharedExpenseAllocation>;
  getOtherIncomeRecords(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').OtherIncomeRecord[]>;
  createOtherIncome(payload: Partial<import('../../features/finance/types').OtherIncomeRecord>): Promise<import('../../features/finance/types').OtherIncomeRecord>;

  // Payables & Receivables
  getCustomerReceivables(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').CustomerReceivable[]>;
  getReceivablesAging(referenceDate?: string): Promise<import('../../features/finance/types').AgingBucketSummary>;
  getPayments(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').PaymentRecord[]>;
  recordPayment(payload: Partial<import('../../features/finance/types').PaymentRecord>, idempotencyKey?: string): Promise<import('../../features/finance/types').PaymentRecord>;

  // Budgets
  getBudgets(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').BudgetPlan[]>;
  createBudget(payload: Partial<import('../../features/finance/types').BudgetPlan>): Promise<import('../../features/finance/types').BudgetPlan>;
  requestBudgetRevision(budgetId: string, newAmountQapik: import('../../shared/utils/money').Qapik, reason: string, requestedBy: string): Promise<import('../../features/finance/types').BudgetPlan>;
  decideBudgetRevision(budgetId: string, revisionId: string, decision: 'approved' | 'rejected', decidedBy: string, decisionNote?: string): Promise<import('../../features/finance/types').BudgetPlan>;

  // Reports
  getManagementPnl(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').ManagementPnlReport>;
  getCashFlowReport(params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').CashFlowReport>;
  getDrillDownTransactions(lineId: string, params?: import('../../features/finance/types').FinanceFilterParams): Promise<import('../../features/finance/types').DrillDownTransaction[]>;

  // GL Boundary
  getGlIntegrationState(): Promise<import('../../features/finance/types').GlIntegrationState>;
  getChartOfAccounts(): Promise<import('../../features/finance/types').ChartOfAccountsItem[]>;
  getPostingRules(): Promise<import('../../features/finance/types').PostingRuleMapping[]>;
  getJournalEntries(): Promise<import('../../features/finance/types').JournalEntry[]>;

  // Approvals Inbox
  getPendingApprovals(): Promise<import('../../features/finance/types').ApprovalInboxItem[]>;
}

export interface HrRepository {
  // Employees
  getEmployees(params?: { search?: string; branchId?: string; department?: string; status?: string }): Promise<import('../../features/hr/types').Employee[]>;
  getEmployeeById(id: string): Promise<import('../../features/hr/types').Employee | null>;
  createEmployee(data: Partial<import('../../features/hr/types').Employee>): Promise<import('../../features/hr/types').Employee>;
  updateEmployee(id: string, data: Partial<import('../../features/hr/types').Employee>): Promise<import('../../features/hr/types').Employee>;
  offboardEmployee(id: string, terminationDate: string, reason: string, checklist: { assetsReturned: boolean; keysReturned: boolean; uniformReturned: boolean; accessRevoked: boolean; finalSettlementCalculated: boolean; notes?: string }): Promise<import('../../features/hr/types').Employee>;

  // Shift Templates & Schedules
  getShiftTemplates(): Promise<import('../../features/hr/types').ShiftTemplate[]>;
  getShiftSchedule(branchId: string, weekStartDate: string): Promise<import('../../features/hr/types').ShiftScheduleWeek>;
  saveShiftSchedule(schedule: import('../../features/hr/types').ShiftScheduleWeek): Promise<import('../../features/hr/types').ShiftScheduleWeek>;
  publishShiftSchedule(id: string, publishedBy: string): Promise<import('../../features/hr/types').ShiftScheduleWeek>;
  copyPreviousWeekSchedule(branchId: string, currentWeekStart: string): Promise<import('../../features/hr/types').ShiftScheduleWeek>;

  // Attendance
  getAttendanceRecords(params?: { branchId?: string; date?: string; employeeId?: string }): Promise<import('../../features/hr/types').AttendanceRecord[]>;
  recordAttendancePunch(employeeId: string, type: 'in' | 'out', source: 'device' | 'manual', time?: string, reason?: string): Promise<import('../../features/hr/types').AttendanceRecord>;
  correctAttendanceException(id: string, checkInTime: string, checkOutTime: string, reason: string, correctedBy: string): Promise<import('../../features/hr/types').AttendanceRecord>;
  getMonthlyTimesheets(monthCode: string, branchId?: string): Promise<import('../../features/hr/types').MonthlyTimesheetItem[]>;
  approveMonthlyTimesheet(monthCode: string, branchId: string, approvedBy: string): Promise<void>;
  importAttendanceCsv(branchId: string, date: string, lines: Array<{ employeeCode: string; checkIn: string; checkOut: string }>): Promise<{ importedCount: number }>;

  // Leaves
  getLeaveBalances(employeeId?: string): Promise<import('../../features/hr/types').LeaveBalance[]>;
  getLeaveRequests(params?: { branchId?: string; status?: string; employeeId?: string }): Promise<import('../../features/hr/types').LeaveRequest[]>;
  submitLeaveRequest(data: Partial<import('../../features/hr/types').LeaveRequest>): Promise<import('../../features/hr/types').LeaveRequest>;
  decideLeaveRequest(id: string, decision: 'approved' | 'rejected', level: 'manager' | 'hr', deciderName: string, note?: string): Promise<import('../../features/hr/types').LeaveRequest>;
  getPublicHolidays(year?: number): Promise<import('../../features/hr/types').PublicHoliday[]>;

  // Payroll
  getPayrollPeriods(): Promise<import('../../features/hr/types').PayrollPeriod[]>;
  getPayrollPeriodById(id: string): Promise<{ period: import('../../features/hr/types').PayrollPeriod; items: import('../../features/hr/types').PayrollItem[] } | null>;
  calculatePayrollRun(periodId: string, calculatedBy: string): Promise<{ period: import('../../features/hr/types').PayrollPeriod; items: import('../../features/hr/types').PayrollItem[] }>;
  approvePayrollRun(periodId: string, approvedBy: string): Promise<import('../../features/hr/types').PayrollPeriod>;
  finalizePayrollRun(periodId: string, finalizedBy: string): Promise<import('../../features/hr/types').PayrollPeriod>;
  applyPayrollAdjustment(payrollItemId: string, amountQapik: import('../../shared/utils/money').Qapik, reason: string, appliedBy: string): Promise<import('../../features/hr/types').PayrollItem>;

  // Audit
  logAuditEntry(entry: Omit<import('../../features/hr/types').HrAuditLogEntry, 'id' | 'timestamp'>): Promise<import('../../features/hr/types').HrAuditLogEntry>;
  getAuditLogs(): Promise<import('../../features/hr/types').HrAuditLogEntry[]>;
}

export interface MarketingRepository {
  getCampaigns(params?: { status?: string; branchId?: string }): Promise<import('../../features/marketing/types').Campaign[]>;
  getCampaignById(id: string): Promise<import('../../features/marketing/types').Campaign | null>;
  createCampaign(payload: Partial<import('../../features/marketing/types').Campaign>): Promise<import('../../features/marketing/types').Campaign>;
  updateCampaign(id: string, payload: Partial<import('../../features/marketing/types').Campaign>): Promise<import('../../features/marketing/types').Campaign>;
  updateCampaignStatus(id: string, status: import('../../features/marketing/types').CampaignStatus, reason?: string): Promise<import('../../features/marketing/types').Campaign>;
  
  getPromotionRules(params?: { activeOnly?: boolean }): Promise<import('../../features/marketing/types').PromotionRule[]>;
  createPromotionRule(payload: Partial<import('../../features/marketing/types').PromotionRule>): Promise<import('../../features/marketing/types').PromotionRule>;
  updatePromotionRule(id: string, payload: Partial<import('../../features/marketing/types').PromotionRule>): Promise<import('../../features/marketing/types').PromotionRule>;
  updateRulePriorities(orderedIds: string[]): Promise<import('../../features/marketing/types').PromotionRule[]>;
  
  getPromoCodes(): Promise<import('../../features/marketing/types').PromoCode[]>;
  createPromoCode(payload: Partial<import('../../features/marketing/types').PromoCode>): Promise<import('../../features/marketing/types').PromoCode>;
  generateBulkPromoCodes(prefix: string, count: number, template: Partial<import('../../features/marketing/types').PromoCode>): Promise<import('../../features/marketing/types').PromoCode[]>;
  getRedemptions(code?: string): Promise<import('../../features/marketing/types').PromoCodeRedemption[]>;
  
  getCampaignPerformance(campaignId: string): Promise<import('../../features/marketing/types').CampaignPerformance>;
  
  getCommunicationTemplates(): Promise<import('../../features/marketing/types').CommunicationTemplate[]>;
  createCommunicationTemplate(payload: Partial<import('../../features/marketing/types').CommunicationTemplate>): Promise<import('../../features/marketing/types').CommunicationTemplate>;
  getCommunicationCampaigns(): Promise<import('../../features/marketing/types').CommunicationCampaign[]>;
  createCommunicationCampaign(payload: Partial<import('../../features/marketing/types').CommunicationCampaign>): Promise<import('../../features/marketing/types').CommunicationCampaign>;
}

export interface CrmRepository {
  getCustomers(params?: { search?: string; tier?: string; segmentId?: string; branchId?: string }): Promise<import('../../features/crm/types').Customer[]>;
  getCustomerById(id: string): Promise<import('../../features/crm/types').Customer | null>;
  createCustomer(payload: Partial<import('../../features/crm/types').Customer>): Promise<import('../../features/crm/types').Customer>;
  updateCustomer(id: string, payload: Partial<import('../../features/crm/types').Customer>): Promise<import('../../features/crm/types').Customer>;
  mergeCustomers(sourceId: string, targetId: string, reason: string, actor: string): Promise<import('../../features/crm/types').Customer>;
  
  getCustomerPurchases(customerId: string): Promise<import('../../features/crm/types').CustomerPurchaseHistoryItem[]>;
  getCustomerReturns(customerId: string): Promise<import('../../features/crm/types').CustomerReturnHistoryItem[]>;
  getPointsLedger(customerId: string): Promise<import('../../features/crm/types').PointsLedgerEntry[]>;
  adjustCustomerPoints(customerId: string, delta: number, reason: string, actor: string): Promise<import('../../features/crm/types').PointsLedgerEntry>;
  updateCustomerConsent(customerId: string, consent: Partial<import('../../features/crm/types').CustomerConsent>, source: string): Promise<import('../../features/crm/types').Customer>;
  requestCustomerAnonymization(customerId: string, reason: string, actor: string): Promise<{ success: boolean; message: string }>;
  
  getCustomerSegments(): Promise<import('../../features/crm/types').CustomerSegment[]>;
  createCustomerSegment(payload: Partial<import('../../features/crm/types').CustomerSegment>): Promise<import('../../features/crm/types').CustomerSegment>;
  updateCustomerSegment(id: string, payload: Partial<import('../../features/crm/types').CustomerSegment>): Promise<import('../../features/crm/types').CustomerSegment>;
  
  getLoyaltyConfig(): Promise<import('../../features/crm/types').LoyaltyProgramConfig>;
  updateLoyaltyConfig(payload: Partial<import('../../features/crm/types').LoyaltyProgramConfig>): Promise<import('../../features/crm/types').LoyaltyProgramConfig>;
  getCustomerAuditLogs(customerId: string): Promise<import('../../features/crm/types').CustomerAuditLogEntry[]>;
}

export interface ReportsRepository {
  getReportsCatalog(): Promise<import('../../features/reports/types').ReportDefinition[]>;
  getReportById(reportId: string): Promise<import('../../features/reports/types').ReportDefinition | null>;
  executeReport(reportId: string, filters: import('../../features/reports/types').ReportFilterState): Promise<import('../../features/reports/types').ReportQueryResult>;
  executeCustomReport(config: import('../../features/reports/types').CustomReportConfig, filters: import('../../features/reports/types').ReportFilterState): Promise<import('../../features/reports/types').ReportQueryResult>;
  startAsyncReportGeneration(reportId: string, filters: import('../../features/reports/types').ReportFilterState): Promise<{ jobId: string; estimatedSeconds: number }>;
  checkAsyncReportStatus(jobId: string): Promise<{ jobId: string; status: 'queued' | 'processing' | 'completed' | 'failed'; progressPercent: number; downloadUrl?: string; error?: string }>;
  exportReport(reportId: string, filters: import('../../features/reports/types').ReportFilterState, format: 'csv' | 'xlsx' | 'pdf'): Promise<{ dataUri: string; filename: string }>;
  getScheduledReports(): Promise<import('../../features/reports/types').ScheduledReportDelivery[]>;
  createScheduledReport(payload: Partial<import('../../features/reports/types').ScheduledReportDelivery>): Promise<import('../../features/reports/types').ScheduledReportDelivery>;
  updateScheduledReport(id: string, payload: Partial<import('../../features/reports/types').ScheduledReportDelivery>): Promise<import('../../features/reports/types').ScheduledReportDelivery>;
  deleteScheduledReport(id: string): Promise<boolean>;
}

export interface BiRepository {
  getExecutivePerformance(params?: { branchIds?: string[]; dateFrom?: string; dateTo?: string }): Promise<import('../../features/bi/types').ExecutiveBiData>;
  getInventoryIntelligence(params?: { branchIds?: string[]; slowMovingThresholdDays?: number }): Promise<import('../../features/bi/types').InventoryIntelligenceData>;
  getCustomerAnalytics(params?: { branchIds?: string[]; dateFrom?: string; dateTo?: string }): Promise<import('../../features/bi/types').CustomerAnalyticsData>;
  getProfitabilityData(params?: { branchIds?: string[]; dateFrom?: string; dateTo?: string }): Promise<import('../../features/bi/types').ProfitabilityData>;
  getAnomalies(params?: { branchIds?: string[] }): Promise<import('../../features/bi/types').AnomalyItem[]>;
  getChartAnnotations(): Promise<import('../../features/bi/types').ChartAnnotation[]>;
  addChartAnnotation(annotation: Omit<import('../../features/bi/types').ChartAnnotation, 'id'>): Promise<import('../../features/bi/types').ChartAnnotation>;
}

export type { SystemRepository } from './mock/mockSystemAdapter';
export type { SecurityAuditRepository } from './mock/mockSecurityAuditAdapter';
export type { NotificationsRepository } from './mock/mockNotificationsAdapter';

