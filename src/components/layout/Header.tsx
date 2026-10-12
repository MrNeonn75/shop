import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../../shared/stores/themeStore';
import { useSessionStore } from '../../shared/stores/sessionStore';
import { useUiStore } from '../../shared/stores/uiStore';
import { usePermission } from '../../shared/hooks/usePermission';
import {
  Moon,
  Sun,
  Menu,
  Building2,
  Search,
  Globe,
} from 'lucide-react';
import { UserNav } from './UserNav';
import { BrandLogo } from '../ui/BrandLogo';
import { Badge } from '../ui/Badge';
import { CommandPalette } from './CommandPalette';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { MOCK_BRANCHES } from '../../shared/adapters/mock/mockData';
import { NotificationBellDropdown } from '../../features/admin/components/NotificationBellDropdown';

export const Header: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { activeBranchId, setActiveBranchId } = useSessionStore();
  const { toggleSidebar } = useUiStore();
  const { user, canAccessAllBranches } = usePermission();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter branches user has access to
  const availableBranches = MOCK_BRANCHES.filter((branch) => {
    if (!user) return false;
    if (canAccessAllBranches) return true;
    return user.allowedBranchIds.includes(branch.id) || user.allowedBranchIds.includes('*');
  });

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-background/95 px-4 md:px-6 backdrop-blur-md">
        {/* Left Side: Toggle menu + Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Menyu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <BrandLogo size="md" className="hidden sm:inline-flex" />

          {/* Environment Badge in Non-Production / Demo */}
          {import.meta.env.VITE_DATA_SOURCE !== 'http' ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              title="Sistem nümayiş (Demo) rejimində işləyir. Bütün göstəricilər nümayiş məqsədlidir."
            >
              DEMO REJİMİ
            </span>
          ) : !import.meta.env.PROD ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
              title="Test və sınaq mühiti (Staging)"
            >
              STAGING
            </span>
          ) : null}

          {/* Global Search Button Trigger (Ctrl+K) */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors ml-2"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Axtarış...</span>
            <kbd className="inline-flex items-center rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground shadow-xs">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Right Side: Branch Switcher, Notifications, Language, Theme, UserNav */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Branch Switcher Dropdown */}
          <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1.5 rounded-md border border-border">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={activeBranchId}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer max-w-[150px] sm:max-w-none truncate"
              aria-label="Cari filial seçimi"
            >
              {canAccessAllBranches && (
                <option value="all">
                  🌐 Bütün filiallar (Konsolidə)
                </option>
              )}
              {availableBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Mobile Trigger */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Qlobal axtarış"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Real-time Notifications Bell Dropdown */}
          <NotificationBellDropdown />

          {/* Language Selector Dropdown (AZ active, EN & RU disabled "Tezliklə") */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Dil seçimi"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>AZ</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-xs">İnterfeys Dili</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs font-semibold justify-between bg-muted/50">
                <span>Azərbaycan (az)</span>
                <span className="text-bh-accent font-bold">✓</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="text-xs justify-between opacity-50 cursor-not-allowed">
                <span>English (en)</span>
                <Badge variant="neutral" size="sm" className="text-[9px]">
                  Tezliklə
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="text-xs justify-between opacity-50 cursor-not-allowed">
                <span>Русский (ru)</span>
                <Badge variant="neutral" size="sm" className="text-[9px]">
                  Tezliklə
                </Badge>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            aria-label={resolvedTheme === 'dark' ? 'İşıqlı rejimə keç' : 'Qaranlıq rejimə keç'}
            title={resolvedTheme === 'dark' ? 'İşıqlı rejim' : 'Qaranlıq rejim'}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5 text-warning transition-transform" />
            ) : (
              <Moon className="h-5 w-5 transition-transform" />
            )}
          </button>

          <div className="h-5 w-px bg-border mx-0.5 sm:mx-1" />

          {/* User Profile & Avatar Dropdown */}
          <UserNav />
        </div>
      </header>

      {/* Global Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </>
  );
};
