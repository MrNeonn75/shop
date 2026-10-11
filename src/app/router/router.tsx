import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { ProtectedRoute } from '../../components/layout/ProtectedRoute';

// Auth Pages
import { LoginPage } from '../../features/auth/pages/LoginPage';
import { ForgotPasswordPage } from '../../features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../../features/auth/pages/ResetPasswordPage';
import { ActiveSessionsPage } from '../../features/auth/pages/ActiveSessionsPage';

// Foundation Pages
import { DashboardPage } from '../../features/dashboard/pages/DashboardPage';
import { BranchesPage } from '../../features/branches/pages/BranchesPage';
import { UiShowcasePage } from '../../features/dev-ui/pages/UiShowcasePage';

// Catalog Module Pages
import { ProductListPage } from '../../features/catalog/pages/ProductListPage';
import { ProductFormPage } from '../../features/catalog/pages/ProductFormPage';
import { CategoriesPage } from '../../features/catalog/pages/CategoriesPage';
import { BrandsPage } from '../../features/catalog/pages/BrandsPage';
import { ImportWizardPage } from '../../features/catalog/pages/ImportWizardPage';
import { BarcodeLabelsPage } from '../../features/catalog/pages/BarcodeLabelsPage';

// Administration Module Pages
import { CompanyProfilePage } from '../../features/admin/pages/CompanyProfilePage';
import { BranchesAdminPage } from '../../features/admin/pages/BranchesAdminPage';
import { WarehousesAdminPage } from '../../features/admin/pages/WarehousesAdminPage';
import { UsersAdminPage } from '../../features/admin/pages/UsersAdminPage';
import { RolesPermissionsPage } from '../../features/admin/pages/RolesPermissionsPage';
import { DocumentNumberingPage } from '../../features/admin/pages/DocumentNumberingPage';
import { TaxSettingsPage } from '../../features/admin/pages/TaxSettingsPage';
import { IntegrationsPage } from '../../features/admin/pages/IntegrationsPage';
import { SystemHealthPage } from '../../features/admin/pages/SystemHealthPage';
import { AuditLogPage } from '../../features/admin/pages/AuditLogPage';

// Business Modules Placeholders
import { ModulePlaceholderPage } from '../../features/modules/pages/ModulePlaceholderPage';

// Feedback Pages
import { NotFoundPage } from '../../components/feedback/NotFoundPage';
import { ForbiddenPage } from '../../components/feedback/ForbiddenPage';
import { ServerErrorPage } from '../../components/feedback/ServerErrorPage';

export const router = createBrowserRouter([
  // Public Auth Routes
  {
    path: '/auth/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/auth/reset-password',
    element: <ResetPasswordPage />,
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
        path: 'pos',
        element: (
          <ProtectedRoute requiredPermission="pos.terminal.access">
            <ModulePlaceholderPage
              moduleName="POS Kassa Terminalı"
              category="Əməliyyatlar"
              description="Barkod skaneri, sensorlu interfeys, fiskal çek çapı və çoxfiliallı kassa idarəetməsi."
              requiredPermission="pos.terminal.access"
              kpis={[
                { label: 'Gündəlik Çek Sayı', value: '142 çek' },
                { label: 'Kassa Dövriyyəsi', value: '5,840.00 ₼' },
                { label: 'Aktiv Kassa', value: 'Kassa 1 (Onlayn)' },
              ]}
            />
          </ProtectedRoute>
        ),
      },
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
            <ModulePlaceholderPage
              moduleName="Filiallararası Transferlər"
              category="Əməliyyatlar"
              description="Filiallar və anbarlar arasında malların yerdəyişməsi, təsdiqi və qəbulu."
              requiredPermission="inventory.transfer.view"
              kpis={[
                { label: 'Gözləmədəki Transferlər', value: '4 sorğu' },
                { label: 'Yolda Olan Mallar', value: '86 ədəd' },
                { label: 'Bu Ay Çatdırılan', value: '412 ədəd' },
              ]}
            />
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
            <ModulePlaceholderPage
              moduleName="Anbar və Vitrin Qalıqları"
              category="Məhsul və Anbar"
              description="Filiallar üzrə real-vaxt stok vəziyyəti, kritik limitlər və inventarizasiya sayımı."
              requiredPermission="inventory.stock.view"
              kpis={[
                { label: 'Cəmi Stok Vahidləri', value: '3,840 ədəd' },
                { label: 'Kritik Qalıqlar', value: '18 SKU' },
                {
                  label: 'Ümumi Maya Dəyəri',
                  value: '84,500.00 ₼',
                  isSensitive: true,
                  permission: 'products.cost_price.view',
                },
              ]}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: 'procurement',
        element: (
          <ProtectedRoute requiredPermission="procurement.orders.view">
            <ModulePlaceholderPage
              moduleName="Satınalma Sifarişləri"
              category="Məhsul və Anbar"
              description="Xarici və yerli təchizatçılardan sifarişlər, gömrük və qaimə qəbulları."
              requiredPermission="procurement.orders.view"
              kpis={[
                { label: 'Aktiv Satınalmalar', value: '6 qaimə' },
                { label: 'Gözlənilən Çatdırılma', value: '3 gün' },
                {
                  label: 'Sifariş Həcmi (Maya)',
                  value: '32,100.00 ₼',
                  isSensitive: true,
                  permission: 'procurement.supplier_price.view',
                },
              ]}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: 'suppliers',
        element: (
          <ProtectedRoute requiredPermission="procurement.suppliers.view">
            <ModulePlaceholderPage
              moduleName="Təchizatçılar"
              category="Məhsul və Anbar"
              description="Tərəfdaş brendlər, müqavilələr və təchizatçı borc-alacaq qalıqları."
              requiredPermission="procurement.suppliers.view"
              kpis={[
                { label: 'Qeydiyyatdakı Təchizatçılar', value: '28 şirkət' },
                { label: 'Aktiv Müqavilələr', value: '19' },
                { label: 'Gecikmiş Ödənişlər', value: '0.00 ₼' },
              ]}
            />
          </ProtectedRoute>
        ),
      },

      // Finance (Maliyyə)
      {
        path: 'finance',
        element: (
          <ProtectedRoute requiredPermission="finance.ledger.view">
            <ModulePlaceholderPage
              moduleName="Maliyyə və Kassa"
              category="Maliyyə"
              description="Baş kitab, kassa qalıqları, gündəlik xərclər və bank hesabları."
              requiredPermission="finance.ledger.view"
              kpis={[
                { label: 'Kassa Qalığı (Cəmi)', value: '18,420.50 ₼' },
                { label: 'Bank Hesabı', value: '45,800.00 ₼' },
                { label: 'Cari Ay Xərcləri', value: '6,210.00 ₼' },
              ]}
            />
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
            <ModulePlaceholderPage
              moduleName="Əməkdaşlar və HR"
              category="İnsan və Müştəri"
              description="Ştat cədvəli, iş qrafikləri və əməkdaşların performans qeydiyyatı."
              requiredPermission="hr.employees.view"
              kpis={[
                { label: 'Ümumi Ştat', value: '34 əməkdaş' },
                { label: 'Növbədə Olanlar', value: '16 nəfər' },
                {
                  label: 'Aylıq Əməkhaqqı Fondu',
                  value: '28,400.00 ₼',
                  isSensitive: true,
                  permission: 'hr.salary.view',
                },
              ]}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: 'crm',
        element: (
          <ProtectedRoute requiredPermission="crm.customers.view">
            <ModulePlaceholderPage
              moduleName="Müştəri Bazası (CRM)"
              category="İnsan və Müştəri"
              description="Loyallıq proqramı, bonus kartları, müştəri alış tarixçəsi və seqmentasiya."
              requiredPermission="crm.customers.view"
              kpis={[
                { label: 'Qeydiyyatdakı Müştərilər', value: '4,890 nəfər' },
                { label: 'Aktiv Loyallıq Kartları', value: '3,120' },
                { label: 'Təkrar Alış Nisbəti', value: '64%' },
              ]}
            />
          </ProtectedRoute>
        ),
      },
      {
        path: 'marketing',
        element: (
          <ProtectedRoute requiredPermission="marketing.campaigns.view">
            <ModulePlaceholderPage
              moduleName="Marketinq və Kampaniyalar"
              category="İnsan və Müştəri"
              description="Mövsümi endirimlər, promokodlar və SMS bildiriş kampaniyaları."
              requiredPermission="marketing.campaigns.view"
              kpis={[
                { label: 'Aktiv Aksiyalar', value: '3 kampaniya' },
                { label: 'Tətbiq Edilən Endirim Həcmi', value: '4,150.00 ₼' },
                { label: 'SMS Çatdırılma Faizi', value: '98.6%' },
              ]}
            />
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
