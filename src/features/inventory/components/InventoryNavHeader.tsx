import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../../shared/utils/cn';
import {
  Boxes,
  History,
  FileText,
  ClipboardCheck,
  FileSpreadsheet,
  Warehouse,
  BellRing,
} from 'lucide-react';

export const InventoryNavHeader: React.FC = () => {
  const tabs = [
    { to: '/inventory', label: 'Cari Qalıqlar', icon: <Boxes className="h-4 w-4" />, end: true },
    { to: '/inventory/ledger', label: 'Hərəkət Jurnalı', icon: <History className="h-4 w-4" /> },
    { to: '/inventory/documents', label: 'Anbar Sənədləri', icon: <FileText className="h-4 w-4" /> },
    { to: '/inventory/count', label: 'Sayım (İnventarizasiya)', icon: <ClipboardCheck className="h-4 w-4" /> },
    { to: '/inventory/opening-balance', label: 'İlkin Qalıq İdxalı', icon: <FileSpreadsheet className="h-4 w-4" /> },
    { to: '/inventory/warehouses', label: 'Anbarlar', icon: <Warehouse className="h-4 w-4" /> },
    { to: '/inventory/alerts', label: 'Limitlər və Siqnallar', icon: <BellRing className="h-4 w-4" /> },
  ];

  return (
    <div className="flex items-center overflow-x-auto border-b border-border bg-card px-4 py-2 gap-1.5 scrollbar-thin">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )
          }
        >
          {tab.icon}
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </div>
  );
};
