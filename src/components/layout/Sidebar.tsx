import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  ArrowLeftRight,
  Shirt,
  Boxes,
  Truck,
  Building,
  DollarSign,
  FileBarChart,
  LineChart,
  Users2,
  HeartHandshake,
  Megaphone,
  Briefcase,
  Store,
  Warehouse,
  UserCog,
  ShieldCheck,
  Hash,
  Percent,
  Cpu,
  Activity,
  History,
  Sparkles,
  Info,
  FolderTree,
  Tag,
  Barcode,
  FileText,
} from 'lucide-react';
import { useUiStore } from '../../shared/stores/uiStore';
import { usePermission } from '../../shared/hooks/usePermission';
import { cn } from '../../shared/utils/cn';
import { Badge } from '../ui/Badge';
import { BrandLogo } from '../ui/BrandLogo';

interface NavModuleItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  permission?: string;
  badge?: string;
}

interface NavGroup {
  groupName: string;
  items: NavModuleItem[];
}

export const Sidebar: React.FC = () => {
  const { isSidebarCollapsed } = useUiStore();
  const { can } = usePermission();

  const groups: NavGroup[] = [
    {
      groupName: 'Əməliyyatlar',
      items: [
        {
          to: '/pos',
          label: 'POS Terminal',
          icon: <ShoppingCart className="h-4 w-4 shrink-0" />,
          permission: 'pos.terminal.access',
        },
        {
          to: '/sales',
          label: 'Satış və Qaytarılma',
          icon: <Receipt className="h-4 w-4 shrink-0" />,
          permission: 'sales.orders.view',
        },
        {
          to: '/transfers',
          label: 'Filial Transferləri',
          icon: <ArrowLeftRight className="h-4 w-4 shrink-0" />,
          permission: 'inventory.transfer.view',
        },
      ],
    },
    {
      groupName: 'Məhsul və Anbar',
      items: [
        {
          to: '/catalog',
          label: 'Məhsul Kataloqu',
          icon: <Shirt className="h-4 w-4 shrink-0" />,
          permission: 'products.catalog.view',
        },
        {
          to: '/catalog/categories',
          label: 'Kateqoriyalar',
          icon: <FolderTree className="h-4 w-4 shrink-0" />,
          permission: 'products.catalog.view',
        },
        {
          to: '/catalog/brands',
          label: 'Brendlər',
          icon: <Tag className="h-4 w-4 shrink-0" />,
          permission: 'products.catalog.view',
        },
        {
          to: '/catalog/labels',
          label: 'Barkod Çapı',
          icon: <Barcode className="h-4 w-4 shrink-0" />,
          permission: 'products.catalog.view',
        },
        {
          to: '/inventory',
          label: 'Anbar Qalıqları',
          icon: <Boxes className="h-4 w-4 shrink-0" />,
          permission: 'inventory.stock.view',
        },
        {
          to: '/inventory/ledger',
          label: 'Hərəkət Jurnalı',
          icon: <History className="h-4 w-4 shrink-0" />,
          permission: 'inventory.stock.view',
        },
        {
          to: '/inventory/documents',
          label: 'Anbar Sənədləri',
          icon: <FileText className="h-4 w-4 shrink-0" />,
          permission: 'inventory.stock.view',
        },
        {
          to: '/procurement',
          label: 'Satınalma Sifarişləri',
          icon: <Truck className="h-4 w-4 shrink-0" />,
          permission: 'procurement.orders.view',
        },
        {
          to: '/suppliers',
          label: 'Təchizatçılar',
          icon: <Building className="h-4 w-4 shrink-0" />,
          permission: 'procurement.suppliers.view',
        },
      ],
    },
    {
      groupName: 'Maliyyə',
      items: [
        {
          to: '/finance',
          label: 'Maliyyə və Kassa',
          icon: <DollarSign className="h-4 w-4 shrink-0" />,
          permission: 'finance.ledger.view',
        },
        {
          to: '/reports',
          label: 'Standart Hesabatlar',
          icon: <FileBarChart className="h-4 w-4 shrink-0" />,
          permission: 'reports.standard.view',
        },
        {
          to: '/analytics',
          label: 'BI Analitika',
          icon: <LineChart className="h-4 w-4 shrink-0" />,
          permission: 'reports.bi.view',
        },
      ],
    },
    {
      groupName: 'İnsan və Müştəri',
      items: [
        {
          to: '/hr',
          label: 'Əməkdaşlar (HR)',
          icon: <Users2 className="h-4 w-4 shrink-0" />,
          permission: 'hr.employees.view',
        },
        {
          to: '/crm',
          label: 'Müştəri Bazası (CRM)',
          icon: <HeartHandshake className="h-4 w-4 shrink-0" />,
          permission: 'crm.customers.view',
        },
        {
          to: '/marketing',
          label: 'Marketinq və Kampaniyalar',
          icon: <Megaphone className="h-4 w-4 shrink-0" />,
          permission: 'marketing.campaigns.view',
        },
      ],
    },
    {
      groupName: 'Sistem və Administrasiya',
      items: [
        {
          to: '/admin/company',
          label: 'Şirkət Profili',
          icon: <Briefcase className="h-4 w-4 shrink-0" />,
          permission: 'admin.company.manage',
        },
        {
          to: '/admin/branches',
          label: 'Filiallar',
          icon: <Store className="h-4 w-4 shrink-0" />,
          permission: 'admin.branches.view',
        },
        {
          to: '/admin/warehouses',
          label: 'Anbarlar',
          icon: <Warehouse className="h-4 w-4 shrink-0" />,
          permission: 'admin.warehouses.view',
        },
        {
          to: '/admin/users',
          label: 'İstifadəçilər',
          icon: <UserCog className="h-4 w-4 shrink-0" />,
          permission: 'admin.users.view',
        },
        {
          to: '/admin/roles',
          label: 'Rollar və İcazələr',
          icon: <ShieldCheck className="h-4 w-4 shrink-0" />,
          permission: 'admin.roles.view',
        },
        {
          to: '/admin/numbering',
          label: 'Sənəd Nömrələnməsi',
          icon: <Hash className="h-4 w-4 shrink-0" />,
          permission: 'admin.document_numbering.manage',
        },
        {
          to: '/admin/tax',
          label: 'Vergi Parametrləri',
          icon: <Percent className="h-4 w-4 shrink-0" />,
          permission: 'admin.tax.manage',
        },
        {
          to: '/admin/integrations',
          label: 'İnteqrasiyalar',
          icon: <Cpu className="h-4 w-4 shrink-0" />,
          permission: 'admin.integrations.manage',
        },
        {
          to: '/admin/system-health',
          label: 'Sistem Sağlamlığı',
          icon: <Activity className="h-4 w-4 shrink-0" />,
          permission: 'admin.system_health.view',
        },
        {
          to: '/admin/audit',
          label: 'Audit Jurnalı',
          icon: <History className="h-4 w-4 shrink-0" />,
          permission: 'admin.audit.view',
        },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-border bg-card transition-all duration-300 select-none z-20 h-screen',
        isSidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center px-4 border-b border-border justify-between">
        {!isSidebarCollapsed ? (
          <BrandLogo size="sm" showWordmark={true} />
        ) : (
          <BrandLogo size="sm" showWordmark={false} className="mx-auto" />
        )}
      </div>

      {/* Navigation Section */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Dashboard Link (Always available) */}
        <div>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-bh-black text-bh-white dark:bg-bh-white dark:text-bh-black font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                isSidebarCollapsed && 'justify-center px-2'
              )
            }
            title={isSidebarCollapsed ? 'İdarəetmə Paneli' : undefined}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            {!isSidebarCollapsed && <span className="flex-1 truncate">İdarəetmə Paneli</span>}
          </NavLink>
        </div>

        {/* 5 Grouped Categories */}
        {groups.map((group) => {
          // Filter items user can access
          const visibleItems = group.items.filter(
            (item) => !item.permission || can(item.permission)
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.groupName} className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {group.groupName}
                </div>
              )}

              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-bh-black text-bh-white dark:bg-bh-white dark:text-bh-black font-semibold shadow-xs'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      isSidebarCollapsed && 'justify-center px-2'
                    )
                  }
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!isSidebarCollapsed && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                  {!isSidebarCollapsed && item.badge && (
                    <Badge variant="neutral" size="sm" className="ml-auto text-[9px] px-1 py-0">
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}

        {/* Developer UI Showcase Link */}
        <div className="pt-2 border-t border-border">
          <NavLink
            to="/dev/ui"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-bh-black text-bh-white dark:bg-bh-white dark:text-bh-black font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                isSidebarCollapsed && 'justify-center px-2'
              )
            }
            title={isSidebarCollapsed ? 'UI Vitrini (Komponentlər)' : undefined}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-bh-accent" />
            {!isSidebarCollapsed && (
              <>
                <span className="flex-1 truncate">UI Vitrini</span>
                <Badge variant="neutral" size="sm" className="ml-auto text-[9px] px-1 py-0">
                  DEV
                </Badge>
              </>
            )}
          </NavLink>
        </div>
      </div>

      {/* Demo Notice Box */}
      {!isSidebarCollapsed && (
        <div className="p-2.5 m-3 rounded-lg border border-border bg-muted/40 text-[11px] space-y-1 shrink-0">
          <div className="flex items-center gap-1.5 text-foreground font-semibold">
            <Info className="h-3 w-3 text-bh-accent shrink-0" />
            <span>BRAND HOUSE ERP</span>
          </div>
          <p className="text-muted-foreground text-[10px] leading-tight">
            20 Modul • Çoxfiliallı idarəetmə
          </p>
        </div>
      )}
    </aside>
  );
};
