import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Shirt,
  Receipt,
  User,
  Settings,
  Building2,
  Shield,
  FileText,
  BarChart2,
  X,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { MOCK_PRODUCTS } from '../../shared/adapters/mock/mockData';
import { formatMoney } from '../../shared/utils/formatters';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchItem {
  id: string;
  type: 'product' | 'receipt' | 'customer' | 'page';
  title: string;
  subtitle: string;
  path: string;
  badge: string;
  icon: React.ReactNode;
}

// Quick navigation shortcuts
const PAGE_ITEMS: SearchItem[] = [
  {
    id: 'p-1',
    type: 'page',
    title: 'Məhsul Kataloqu',
    subtitle: 'Kataloq, qiymətlər, kateqoriyalar və barkodlar',
    path: '/catalog',
    badge: 'Səhifə',
    icon: <Shirt className="h-4 w-4" />,
  },
  {
    id: 'p-1-cat',
    type: 'page',
    title: 'Kateqoriyalar Ağacı',
    subtitle: 'Kataloq iyerarxiyası və təsnifat ağacı',
    path: '/catalog/categories',
    badge: 'Səhifə',
    icon: <Shirt className="h-4 w-4" />,
  },
  {
    id: 'p-1-brd',
    type: 'page',
    title: 'Brendlər',
    subtitle: 'Brend qeydiyyatı, kodları və loqoları',
    path: '/catalog/brands',
    badge: 'Səhifə',
    icon: <Shirt className="h-4 w-4" />,
  },
  {
    id: 'p-1-lbl',
    type: 'page',
    title: 'Barkod və Qiymət Çapı',
    subtitle: 'Termal printerlər və A4 etiket dizayneri',
    path: '/catalog/labels',
    badge: 'Səhifə',
    icon: <Shirt className="h-4 w-4" />,
  },
  {
    id: 'p-1-imp',
    type: 'page',
    title: 'Kataloqun Kütləvi İdxalı',
    subtitle: 'CSV / Excel formatında məhsul idxalı',
    path: '/catalog/import',
    badge: 'Səhifə',
    icon: <Shirt className="h-4 w-4" />,
  },
  {
    id: 'p-2',
    type: 'page',
    title: 'Filiallar və Kassa',
    subtitle: 'Filial ünvanları, iş qrafiki və kassalar',
    path: '/admin/branches',
    badge: 'Səhifə',
    icon: <Building2 className="h-4 w-4" />,
  },
  {
    id: 'p-3',
    type: 'page',
    title: 'İstifadəçilər və İcazələr',
    subtitle: 'İstifadəçi hesabları və filial təyinatları',
    path: '/admin/users',
    badge: 'Səhifə',
    icon: <User className="h-4 w-4" />,
  },
  {
    id: 'p-4',
    type: 'page',
    title: 'Rollar və İcazələr Matrisi',
    subtitle: 'Səlahiyyətlər, icazə matrisi və rollar',
    path: '/admin/roles',
    badge: 'Səhifə',
    icon: <Shield className="h-4 w-4" />,
  },
  {
    id: 'p-5',
    type: 'page',
    title: 'Vergi Parametrləri',
    subtitle: 'ƏDV və sadələşdirilmiş vergi dərəcələri',
    path: '/admin/tax',
    badge: 'Səhifə',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    id: 'p-6',
    type: 'page',
    title: 'Audit Jurnalı',
    subtitle: 'Sistem hadisələri və dəyişiklik tarixçəsi',
    path: '/admin/audit',
    badge: 'Səhifə',
    icon: <BarChart2 className="h-4 w-4" />,
  },
  {
    id: 'p-7',
    type: 'page',
    title: 'Şirkət Profili',
    subtitle: 'VÖEN, rekvizitlər və əsas parametrlər',
    path: '/admin/company',
    badge: 'Səhifə',
    icon: <Settings className="h-4 w-4" />,
  },
];

// Mock Receipts
const RECEIPT_ITEMS: SearchItem[] = [
  {
    id: 'r-1',
    type: 'receipt',
    title: 'Çek #CK-28M-2026-00104',
    subtitle: 'Məbləğ: 149.90 ₼ • Müştəri: Rauf M. • Kassa 1',
    path: '/sales',
    badge: 'Satış Çeki',
    icon: <Receipt className="h-4 w-4" />,
  },
  {
    id: 'r-2',
    type: 'receipt',
    title: 'Çek #CK-GM-2026-00089',
    subtitle: 'Məbləğ: 85.00 ₼ • Müştəri: Nərgiz A. • Kassa 2',
    path: '/sales',
    badge: 'Satış Çeki',
    icon: <Receipt className="h-4 w-4" />,
  },
];

// Mock Customers
const CUSTOMER_ITEMS: SearchItem[] = [
  {
    id: 'c-1',
    type: 'customer',
    title: 'Leyla Əliyeva',
    subtitle: '+994 50 211 44 55 • Loyallıq: Gold (420 bal)',
    path: '/crm',
    badge: 'Müştəri',
    icon: <User className="h-4 w-4" />,
  },
  {
    id: 'c-2',
    type: 'customer',
    title: 'Elmir Məmmədov',
    subtitle: '+994 55 789 12 34 • Loyallıq: Silver (180 bal)',
    path: '/crm',
    badge: 'Müştəri',
    icon: <User className="h-4 w-4" />,
  },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...PAGE_ITEMS.slice(0, 5), ...RECEIPT_ITEMS, ...CUSTOMER_ITEMS];
    }

    // Filter products
    const matchedProducts: SearchItem[] = MOCK_PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q)
    )
      .slice(0, 6)
      .map((p) => ({
        id: `prod-${p.id}`,
        type: 'product',
        title: `${p.name} (${p.brand})`,
        subtitle: `SKU: ${p.sku} • Barkod: ${p.barcode} • Qiymət: ${formatMoney(p.priceQapik)}`,
        path: '/products',
        badge: 'Məhsul',
        icon: <Shirt className="h-4 w-4" />,
      }));

    // Filter receipts
    const matchedReceipts = RECEIPT_ITEMS.filter(
      (r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
    );

    // Filter customers
    const matchedCustomers = CUSTOMER_ITEMS.filter(
      (c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );

    // Filter pages
    const matchedPages = PAGE_ITEMS.filter(
      (p) => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q)
    );

    return [...matchedProducts, ...matchedReceipts, ...matchedCustomers, ...matchedPages];
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = (item: SearchItem) => {
    navigate(item.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="md"
      className="p-0 overflow-hidden"
    >
      <div className="flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-border bg-muted/20">
          <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Məhsul (ad, SKU, barkod), çek, müştəri və ya modul axtar..."
            autoFocus
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[420px]">
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Axtarışınıza uyğun heç bir nəticə tapılmadı.
            </div>
          ) : (
            results.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors text-xs ${
                  selectedIndex === idx
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`p-1.5 rounded-md shrink-0 ${
                      selectedIndex === idx
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <Badge variant="neutral" size="sm" className="text-[10px]">
                    {item.badge}
                  </Badge>
                  {selectedIndex === idx && (
                    <ArrowRight className="h-3.5 w-3.5 text-foreground animate-in slide-in-from-left-1" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>↑↓ Keçid</span>
            <span>↵ Seçim</span>
            <span>ESC Çıxış</span>
          </div>
          <span>BRAND HOUSE Qlobal Axtarış</span>
        </div>
      </div>
    </Modal>
  );
};
