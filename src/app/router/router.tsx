import React, { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { ProtectedRoute } from '../../components/layout/ProtectedRoute';
import { PageSkeleton } from '../../components/ui/PageSkeleton';

const lazyPage = <T extends Record<string, unknown>>(
  importer: () => Promise<T>,
  exportName: keyof T
) =>
  lazy(async () => {
    const mod = await importer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { default: mod[exportName] as unknown as React.ComponentType<any> };
  });

// Auth Pages
const LoginPage = lazyPage(() => import('../../features/auth/pages/LoginPage'), 'LoginPage');
const ForgotPasswordPage = lazyPage(() => import('../../features/auth/pages/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyPage(() => import('../../features/auth/pages/ResetPasswordPage'), 'ResetPasswordPage');
const ActiveSessionsPage = lazyPage(() => import('../../features/auth/pages/ActiveSessionsPage'), 'ActiveSessionsPage');

// Foundation Pages
const DashboardPage = lazyPage(() => import('../../features/dashboard/pages/DashboardPage'), 'DashboardPage');
const BranchesPage = lazyPage(() => import('../../features/branches/pages/BranchesPage'), 'BranchesPage');
const UiShowcasePage = lazyPage(() => import('../../features/dev-ui/pages/UiShowcasePage'), 'UiShowcasePage');

// Catalog Module Pages
const ProductListPage = lazyPage(() => import('../../features/catalog/pages/ProductListPage'), 'ProductListPage');
const ProductFormPage = lazyPage(() => import('../../features/catalog/pages/ProductFormPage'), 'ProductFormPage');
const CategoriesPage = lazyPage(() => import('../../features/catalog/pages/CategoriesPage'), 'CategoriesPage');
const BrandsPage = lazyPage(() => import('../../features/catalog/pages/BrandsPage'), 'BrandsPage');
const ImportWizardPage = lazyPage(() => import('../../features/catalog/pages/ImportWizardPage'), 'ImportWizardPage');
const BarcodeLabelsPage = lazyPage(() => import('../../features/catalog/pages/BarcodeLabelsPage'), 'BarcodeLabelsPage');

// Inventory Module Pages
const StockOverviewPage = lazyPage(() => import('../../features/inventory/pages/StockOverviewPage'), 'StockOverviewPage');
const StockLedgerPage = lazyPage(() => import('../../features/inventory/pages/StockLedgerPage'), 'StockLedgerPage');
const StockDocumentsPage = lazyPage(() => import('../../features/inventory/pages/StockDocumentsPage'), 'StockDocumentsPage');
const InventoryCountPage = lazyPage(() => import('../../features/inventory/pages/InventoryCountPage'), 'InventoryCountPage');
const OpeningBalanceImportPage = lazyPage(() => import('../../features/inventory/pages/OpeningBalanceImportPage'), 'OpeningBalanceImportPage');
const WarehousesPage = lazyPage(() => import('../../features/inventory/pages/WarehousesPage'), 'WarehousesPage');
const StockAlertsPage = lazyPage(() => import('../../features/inventory/pages/StockAlertsPage'), 'StockAlertsPage');

// Transfers Module Pages
const TransfersListPage = lazyPage(() => import('../../features/transfers/pages/TransfersListPage'), 'TransfersListPage');
const TransferCreatePage = lazyPage(() => import('../../features/transfers/pages/TransferCreatePage'), 'TransferCreatePage');
const TransferDetailPage = lazyPage(() => import('../../features/transfers/pages/TransferDetailPage'), 'TransferDetailPage');

// Administration Module Pages
const CompanyProfilePage = lazyPage(() => import('../../features/admin/pages/CompanyProfilePage'), 'CompanyProfilePage');
const BranchesAdminPage = lazyPage(() => import('../../features/admin/pages/BranchesAdminPage'), 'BranchesAdminPage');
const WarehousesAdminPage = lazyPage(() => import('../../features/admin/pages/WarehousesAdminPage'), 'WarehousesAdminPage');
const UsersAdminPage = lazyPage(() => import('../../features/admin/pages/UsersAdminPage'), 'UsersAdminPage');
const RolesPermissionsPage = lazyPage(() => import('../../features/admin/pages/RolesPermissionsPage'), 'RolesPermissionsPage');
const DocumentNumberingPage = lazyPage(() => import('../../features/admin/pages/DocumentNumberingPage'), 'DocumentNumberingPage');
const TaxSettingsPage = lazyPage(() => import('../../features/admin/pages/TaxSettingsPage'), 'TaxSettingsPage');
const IntegrationsPage = lazyPage(() => import('../../features/admin/pages/IntegrationsPage'), 'IntegrationsPage');
const SystemHealthPage = lazyPage(() => import('../../features/admin/pages/SystemHealthPage'), 'SystemHealthPage');
const AuditLogPage = lazyPage(() => import('../../features/admin/pages/AuditLogPage'), 'AuditLogPage');
const UserAccessReviewPage = lazyPage(() => import('../../features/admin/pages/UserAccessReviewPage'), 'UserAccessReviewPage');
const SecurityEventsPage = lazyPage(() => import('../../features/admin/pages/SecurityEventsPage'), 'SecurityEventsPage');
const SecuritySettingsPage = lazyPage(() => import('../../features/admin/pages/SecuritySettingsPage'), 'SecuritySettingsPage');
const SuspiciousActivityPage = lazyPage(() => import('../../features/admin/pages/SuspiciousActivityPage'), 'SuspiciousActivityPage');
const DataProtectionPage = lazyPage(() => import('../../features/admin/pages/DataProtectionPage'), 'DataProtectionPage');
const NotificationsCenterPage = lazyPage(() => import('../../features/admin/pages/NotificationsCenterPage'), 'NotificationsCenterPage');
const NotificationPreferencesPage = lazyPage(() => import('../../features/admin/pages/NotificationPreferencesPage'), 'NotificationPreferencesPage');
const AlertRulesAdminPage = lazyPage(() => import('../../features/admin/pages/AlertRulesAdminPage'), 'AlertRulesAdminPage');
const ApprovalsInboxPage = lazyPage(() => import('../../features/admin/pages/ApprovalsInboxPage'), 'ApprovalsInboxPage');
const SystemSettingsPage = lazyPage(() => import('../../features/admin/pages/SystemSettingsPage'), 'SystemSettingsPage');

// POS Module Page
const PosTerminalPage = lazyPage(() => import('../../features/pos/pages/PosTerminalPage'), 'PosTerminalPage');

// Supplier & Purchasing Module Pages
const SuppliersListPage = lazyPage(() => import('../../features/suppliers/pages/SuppliersListPage'), 'SuppliersListPage');
const SupplierDetailPage = lazyPage(() => import('../../features/suppliers/pages/SupplierDetailPage'), 'SupplierDetailPage');
const PurchaseRequestsPage = lazyPage(() => import('../../features/purchasing/pages/PurchaseRequestsPage'), 'PurchaseRequestsPage');
const PurchaseRequestFormPage = lazyPage(() => import('../../features/purchasing/pages/PurchaseRequestFormPage'), 'PurchaseRequestFormPage');
const PurchaseOrdersPage = lazyPage(() => import('../../features/purchasing/pages/PurchaseOrdersPage'), 'PurchaseOrdersPage');
const PurchaseOrderFormPage = lazyPage(() => import('../../features/purchasing/pages/PurchaseOrderFormPage'), 'PurchaseOrderFormPage');
const PurchaseOrderDetailPage = lazyPage(() => import('../../features/purchasing/pages/PurchaseOrderDetailPage'), 'PurchaseOrderDetailPage');
const GoodsReceiptPage = lazyPage(() => import('../../features/purchasing/pages/GoodsReceiptPage'), 'GoodsReceiptPage');
const GoodsReceiptFormPage = lazyPage(() => import('../../features/purchasing/pages/GoodsReceiptFormPage'), 'GoodsReceiptFormPage');
const GoodsReceiptDetailPage = lazyPage(() => import('../../features/purchasing/pages/GoodsReceiptDetailPage'), 'GoodsReceiptDetailPage');
const SupplierInvoicesPage = lazyPage(() => import('../../features/purchasing/pages/SupplierInvoicesPage'), 'SupplierInvoicesPage');
const SupplierPaymentsPage = lazyPage(() => import('../../features/purchasing/pages/SupplierPaymentsPage'), 'SupplierPaymentsPage');
const PurchasingReportsPage = lazyPage(() => import('../../features/purchasing/pages/PurchasingReportsPage'), 'PurchasingReportsPage');

// Finance Module Pages
const FinanceOverviewPage = lazyPage(() => import('../../features/finance/pages/FinanceOverviewPage'), 'FinanceOverviewPage');
const CashBankAccountsPage = lazyPage(() => import('../../features/finance/pages/CashBankAccountsPage'), 'CashBankAccountsPage');
const ReconciliationPage = lazyPage(() => import('../../features/finance/pages/ReconciliationPage'), 'ReconciliationPage');
const ExpensesPage = lazyPage(() => import('../../features/finance/pages/ExpensesPage'), 'ExpensesPage');
const PayablesReceivablesPage = lazyPage(() => import('../../features/finance/pages/PayablesReceivablesPage'), 'PayablesReceivablesPage');
const BudgetsPage = lazyPage(() => import('../../features/finance/pages/BudgetsPage'), 'BudgetsPage');
const FinancialReportsPage = lazyPage(() => import('../../features/finance/pages/FinancialReportsPage'), 'FinancialReportsPage');
const AccountingBoundaryPage = lazyPage(() => import('../../features/finance/pages/AccountingBoundaryPage'), 'AccountingBoundaryPage');
const FinanceApprovalsPage = lazyPage(() => import('../../features/finance/pages/FinanceApprovalsPage'), 'FinanceApprovalsPage');

// HR Module Pages
const EmployeesPage = lazyPage(() => import('../../features/hr/pages/EmployeesPage'), 'EmployeesPage');
const EmployeeDetailPage = lazyPage(() => import('../../features/hr/pages/EmployeeDetailPage'), 'EmployeeDetailPage');
const SchedulesPage = lazyPage(() => import('../../features/hr/pages/SchedulesPage'), 'SchedulesPage');
const AttendancePage = lazyPage(() => import('../../features/hr/pages/AttendancePage'), 'AttendancePage');
const LeavePage = lazyPage(() => import('../../features/hr/pages/LeavePage'), 'LeavePage');
const PayrollPage = lazyPage(() => import('../../features/hr/pages/PayrollPage'), 'PayrollPage');
const HrReportsPage = lazyPage(() => import('../../features/hr/pages/HrReportsPage'), 'HrReportsPage');
const HrPrivacyPage = lazyPage(() => import('../../features/hr/pages/HrPrivacyPage'), 'HrPrivacyPage');

// Marketing Module Pages
const CampaignsPage = lazyPage(() => import('../../features/marketing/pages/CampaignsPage'), 'CampaignsPage');
const PromotionsPage = lazyPage(() => import('../../features/marketing/pages/PromotionsPage'), 'PromotionsPage');
const PromoCodesPage = lazyPage(() => import('../../features/marketing/pages/PromoCodesPage'), 'PromoCodesPage');
const CampaignPerformancePage = lazyPage(() => import('../../features/marketing/pages/CampaignPerformancePage'), 'CampaignPerformancePage');
const MarketingApprovalsPage = lazyPage(() => import('../../features/marketing/pages/MarketingApprovalsPage'), 'MarketingApprovalsPage');
const CommunicationsPage = lazyPage(() => import('../../features/marketing/pages/CommunicationsPage'), 'CommunicationsPage');

// CRM Module Pages
const CustomersPage = lazyPage(() => import('../../features/crm/pages/CustomersPage'), 'CustomersPage');
const CustomerDetailPage = lazyPage(() => import('../../features/crm/pages/CustomerDetailPage'), 'CustomerDetailPage');
const SegmentsPage = lazyPage(() => import('../../features/crm/pages/SegmentsPage'), 'SegmentsPage');
const LoyaltyProgramPage = lazyPage(() => import('../../features/crm/pages/LoyaltyProgramPage'), 'LoyaltyProgramPage');

// Reports & BI Module Pages
const ReportsCatalogPage = lazyPage(() => import('../../features/reports/pages/ReportsCatalogPage'), 'ReportsCatalogPage');
const ReportViewerPage = lazyPage(() => import('../../features/reports/pages/ReportViewerPage'), 'ReportViewerPage');
const ReportBuilderPage = lazyPage(() => import('../../features/reports/pages/ReportBuilderPage'), 'ReportBuilderPage');
const ScheduledReportsPage = lazyPage(() => import('../../features/reports/pages/ScheduledReportsPage'), 'ScheduledReportsPage');
const ExecutiveDashboardPage = lazyPage(() => import('../../features/bi/pages/ExecutiveDashboardPage'), 'ExecutiveDashboardPage');
const InventoryIntelligencePage = lazyPage(() => import('../../features/bi/pages/InventoryIntelligencePage'), 'InventoryIntelligencePage');
const CustomerAnalyticsPage = lazyPage(() => import('../../features/bi/pages/CustomerAnalyticsPage'), 'CustomerAnalyticsPage');
const ProfitabilityPage = lazyPage(() => import('../../features/bi/pages/ProfitabilityPage'), 'ProfitabilityPage');
const AnomaliesPage = lazyPage(() => import('../../features/bi/pages/AnomaliesPage'), 'AnomaliesPage');

// Business Modules Placeholders
const ModulePlaceholderPage = lazyPage(() => import('../../features/modules/pages/ModulePlaceholderPage'), 'ModulePlaceholderPage');

// Feedback Pages
const NotFoundPage = lazyPage(() => import('../../components/feedback/NotFoundPage'), 'NotFoundPage');
const ForbiddenPage = lazyPage(() => import('../../components/feedback/ForbiddenPage'), 'ForbiddenPage');
const ServerErrorPage = lazyPage(() => import('../../components/feedback/ServerErrorPage'), 'ServerErrorPage');

export const router = createBrowserRouter([
  // Public Auth Routes
  {
    path: '/auth/login',
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/auth/forgot-password',
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <ForgotPasswordPage />
      </Suspense>
    ),
  },
  {
    path: '/auth/reset-password',
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <ResetPasswordPage />
      </Suspense>
    ),
  },

  // Dedicated Full-Screen POS Terminal Route
  {
    path: '/pos',
    element: (
      <ProtectedRoute requiredPermission="pos.terminal.access">
        <Suspense fallback={<PageSkeleton />}>
          <PosTerminalPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },

  // Protected App Shell Routes
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },

      // Operations (Əməliyyatlar)
      {
        path: 'sales',
        element: (
          <ProtectedRoute requiredPermission="sales.orders.view">
            <ModulePlaceholderPage
              moduleName="Satış və Qaytarılma"
              category="Əməliyyatlar"
              description="Bütün satış sifarişlərinin arxivi, müştəri qaytarmaları və fiskal qəbzlər."
              requiredPermission="sales.orders.view"
              kpis={[
                { label: 'Ümumi Satış Sənədləri', value: '1,248' },
                { label: 'Qaytarılma Nisbəti', value: '1.2%' },
                { label: 'Orta Çek Məbləği', value: '84.50 ₼' },
              ]}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: 'transfers',
        element: (
          <ProtectedRoute requiredPermission="inventory.transfer.view">
            <TransfersListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'transfers/new',
        element: (
          <ProtectedRoute requiredPermission="inventory.transfer.create">
            <TransferCreatePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'transfers/:id',
        element: (
          <ProtectedRoute requiredPermission="inventory.transfer.view">
            <TransferDetailPage />
          </ProtectedRoute>
        ),
      },

      // Product & Inventory (Məhsul və Anbar)
      {
        path: 'products',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.view">
            <ProductListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.view">
            <ProductListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/new',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.create">
            <ProductFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/:id',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.view">
            <ProductFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/categories',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.view">
            <CategoriesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/brands',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.view">
            <BrandsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/import',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.create">
            <ImportWizardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/labels',
        element: (
          <ProtectedRoute requiredPermission="products.catalog.view">
            <BarcodeLabelsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory',
        element: (
          <ProtectedRoute requiredPermission="inventory.stock.view">
            <StockOverviewPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/ledger',
        element: (
          <ProtectedRoute requiredPermission="inventory.stock.view">
            <StockLedgerPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/documents',
        element: (
          <ProtectedRoute requiredPermission="inventory.stock.view">
            <StockDocumentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/count',
        element: (
          <ProtectedRoute requiredPermission="inventory.stock.adjust">
            <InventoryCountPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/opening-balance',
        element: (
          <ProtectedRoute requiredPermission="inventory.stock.adjust">
            <OpeningBalanceImportPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/warehouses',
        element: (
          <ProtectedRoute requiredPermission="inventory.stock.view">
            <WarehousesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/alerts',
        element: (
          <ProtectedRoute requiredPermission="inventory.stock.view">
            <StockAlertsPage />
          </ProtectedRoute>
        ),
      },
      // Purchasing & Suppliers Module Routes
      {
        path: 'procurement',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <PurchaseOrdersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/requests',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <PurchaseRequestsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/requests/new',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.create">
            <PurchaseRequestFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/orders',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <PurchaseOrdersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/orders/new',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.create">
            <PurchaseOrderFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/orders/:id',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <PurchaseOrderDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/goods-receipts',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <GoodsReceiptPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/goods-receipts/new',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.create">
            <GoodsReceiptFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/goods-receipts/:id',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <GoodsReceiptDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/invoices',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <SupplierInvoicesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/payments',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <SupplierPaymentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'purchasing/reports',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <PurchasingReportsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'suppliers',
        element: (
          <ProtectedRoute requiredPermission="procurement.suppliers.view">
            <SuppliersListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'suppliers/:id',
        element: (
          <ProtectedRoute requiredPermission="procurement.suppliers.view">
            <SupplierDetailPage />
          </ProtectedRoute>
        ),
      },

      // Finance (Maliyyə)
      {
        path: 'finance',
        element: (
          <ProtectedRoute requiredPermission="finance.ledger.view">
            <FinanceOverviewPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/accounts',
        element: (
          <ProtectedRoute requiredPermission="finance.cash.view">
            <CashBankAccountsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/reconciliation',
        element: (
          <ProtectedRoute requiredPermission="finance.reconcile">
            <ReconciliationPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/expenses',
        element: (
          <ProtectedRoute requiredPermission="finance.expense.view">
            <ExpensesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/payables-receivables',
        element: (
          <ProtectedRoute requiredPermission="finance.ledger.view">
            <PayablesReceivablesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/budgets',
        element: (
          <ProtectedRoute requiredPermission="finance.budget.manage">
            <BudgetsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/reports',
        element: (
          <ProtectedRoute requiredPermission="finance.report.view">
            <FinancialReportsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/accounting-boundary',
        element: (
          <ProtectedRoute requiredPermission="finance.ledger.view">
            <AccountingBoundaryPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'finance/approvals',
        element: (
          <ProtectedRoute requiredPermission="finance.expense.approve">
            <FinanceApprovalsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <ProtectedRoute requiredPermission="reports.standard.view">
            <ModulePlaceholderPage
              moduleName="Standart Hesabatlar"
              category="Maliyyə"
              description="Satış dövriyyəsi, filial müqayisəsi, anbar hərəkəti və gəlir-xərc hesabatları."
              requiredPermission="reports.standard.view"
              kpis={[
                { label: 'Mövcud Şablonlar', value: '14 hesabat' },
                { label: 'Son İxrac', value: 'Bugün, 11:45' },
                { label: 'Avtomatlaşdırılmış Hesabat', value: 'Həftəlik (Aktiv)' },
              ]}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: 'analytics',
        element: (
          <ProtectedRoute requiredPermission="reports.bi.view">
            <ModulePlaceholderPage
              moduleName="BI Analitika"
              category="Maliyyə"
              description="Vizual qrafiklər, trend analizləri və filial rentabelliyi göstəriciləri."
              requiredPermission="reports.bi.view"
              kpis={[
                { label: 'Rentabellik (ROI)', value: '28.4%' },
                { label: 'Ən Çox Satan Brend', value: 'Massimo Dutti' },
                { label: 'Pik Satış Saatları', value: '17:00 - 20:00' },
              ]}
            />
          </ProtectedRoute>
        ),
      },

      // People & CRM (İnsan və Müştəri)
      {
        path: 'hr',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <EmployeesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/employees',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <EmployeesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/employees/:id',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <EmployeeDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/schedules',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <SchedulesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/attendance',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <AttendancePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/leave',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <LeavePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/payroll',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <PayrollPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/reports',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <HrReportsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/privacy',
        element: (
          <ProtectedRoute requiredPermission="hr.employees.view">
            <HrPrivacyPage />
          </ProtectedRoute>
        ),
      },
      // CRM & Loyalty Module
      {
        path: 'crm',
        element: (
          <ProtectedRoute requiredPermission="crm.customers.view">
            <CustomersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'crm/customers',
        element: (
          <ProtectedRoute requiredPermission="crm.customers.view">
            <CustomersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'crm/customers/:id',
        element: (
          <ProtectedRoute requiredPermission="crm.customers.view">
            <CustomerDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'crm/segments',
        element: (
          <ProtectedRoute requiredPermission="crm.customers.view">
            <SegmentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'crm/loyalty',
        element: (
          <ProtectedRoute requiredPermission="crm.customers.view">
            <LoyaltyProgramPage />
          </ProtectedRoute>
        ),
      },

      // Marketing Module
      {
        path: 'marketing',
        element: (
          <ProtectedRoute requiredPermission="marketing.campaigns.view">
            <CampaignsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'marketing/campaigns',
        element: (
          <ProtectedRoute requiredPermission="marketing.campaigns.view">
            <CampaignsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'marketing/promotions',
        element: (
          <ProtectedRoute requiredPermission="marketing.discounts.manage">
            <PromotionsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'marketing/promo-codes',
        element: (
          <ProtectedRoute requiredPermission="marketing.campaigns.view">
            <PromoCodesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'marketing/performance',
        element: (
          <ProtectedRoute requiredPermission="marketing.campaigns.view">
            <CampaignPerformancePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'marketing/approvals',
        element: (
          <ProtectedRoute requiredPermission="marketing.approvals.manage">
            <MarketingApprovalsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'marketing/communications',
        element: (
          <ProtectedRoute requiredPermission="marketing.communications.send">
            <CommunicationsPage />
          </ProtectedRoute>
        ),
      },

      // Reports Module (Hesabatlar Mərkəzi)
      {
        path: 'reports',
        element: (
          <ProtectedRoute requiredPermission="reports.standard.view">
            <ReportsCatalogPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports/view/:reportId',
        element: (
          <ProtectedRoute requiredPermission="reports.standard.view">
            <ReportViewerPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports/builder',
        element: (
          <ProtectedRoute requiredPermission="reports.custom.create">
            <ReportBuilderPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports/scheduled',
        element: (
          <ProtectedRoute requiredPermission="reports.schedule.manage">
            <ScheduledReportsPage />
          </ProtectedRoute>
        ),
      },

      // BI & Analytics Module (Biznes İntellekti)
      {
        path: 'analytics',
        element: (
          <ProtectedRoute requiredPermission="reports.bi.view">
            <ExecutiveDashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'analytics/inventory',
        element: (
          <ProtectedRoute requiredPermission="reports.bi.view">
            <InventoryIntelligencePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'analytics/customers',
        element: (
          <ProtectedRoute requiredPermission="reports.bi.view">
            <CustomerAnalyticsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'analytics/profitability',
        element: (
          <ProtectedRoute requiredPermission="reports.bi.view">
            <ProfitabilityPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'analytics/anomalies',
        element: (
          <ProtectedRoute requiredPermission="reports.bi.view">
            <AnomaliesPage />
          </ProtectedRoute>
        ),
      },

      // System & Administration (Sistem və Administrasiya)
      {
        path: 'admin/company',
        element: (
          <ProtectedRoute requiredPermission="admin.company.manage">
            <CompanyProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/branches',
        element: (
          <ProtectedRoute requiredPermission="admin.branches.view">
            <BranchesAdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/warehouses',
        element: (
          <ProtectedRoute requiredPermission="admin.warehouses.view">
            <WarehousesAdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <ProtectedRoute requiredPermission="admin.users.view">
            <UsersAdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/roles',
        element: (
          <ProtectedRoute requiredPermission="admin.roles.view">
            <RolesPermissionsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/numbering',
        element: (
          <ProtectedRoute requiredPermission="admin.document_numbering.manage">
            <DocumentNumberingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/tax',
        element: (
          <ProtectedRoute requiredPermission="admin.tax.manage">
            <TaxSettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/integrations',
        element: (
          <ProtectedRoute requiredPermission="admin.integrations.manage">
            <IntegrationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/system-health',
        element: (
          <ProtectedRoute requiredPermission="admin.system_health.view">
            <SystemHealthPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/audit',
        element: (
          <ProtectedRoute requiredPermission="admin.audit.view">
            <AuditLogPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/access-review',
        element: (
          <ProtectedRoute requiredPermission="admin.access_review.manage">
            <UserAccessReviewPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/security-events',
        element: (
          <ProtectedRoute requiredPermission="admin.security.view">
            <SecurityEventsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/security-settings',
        element: (
          <ProtectedRoute requiredPermission="admin.security.manage">
            <SecuritySettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/suspicious-activity',
        element: (
          <ProtectedRoute requiredPermission="admin.security.view">
            <SuspiciousActivityPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/data-protection',
        element: (
          <ProtectedRoute requiredPermission="admin.security.manage">
            <DataProtectionPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/alert-rules',
        element: (
          <ProtectedRoute requiredPermission="notifications.rules.manage">
            <AlertRulesAdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/settings',
        element: (
          <ProtectedRoute requiredPermission="settings.system.manage">
            <SystemSettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'notifications',
        element: <NotificationsCenterPage />,
      },
      {
        path: 'notifications/preferences',
        element: <NotificationPreferencesPage />,
      },
      {
        path: 'approvals',
        element: (
          <ProtectedRoute requiredPermission="approvals.inbox.view">
            <ApprovalsInboxPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/sessions',
        element: <ActiveSessionsPage />,
      },

      // Legacy Branches Page
      {
        path: 'branches',
        element: (
          <ProtectedRoute requiredPermission="admin.branches.view">
            <BranchesPage />
          </ProtectedRoute>
        ),
      },

      // Developer UI Showcase
      {
        path: 'dev/ui',
        element: <UiShowcasePage />,
      },

      // Errors & Feedback
      {
        path: '403',
        element: <ForbiddenPage />,
      },
      {
        path: '500',
        element: <ServerErrorPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
