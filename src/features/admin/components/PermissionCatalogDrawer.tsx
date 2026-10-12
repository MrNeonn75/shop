import React, { useState, useMemo } from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { ALL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, UserRole, ROLE_LABELS } from '../../../shared/utils/permissions';
import { PermissionCatalogItem, RiskLevel } from '../types/permissionsAdvanced';
import { Search, ShieldAlert } from 'lucide-react';

interface PermissionCatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermissionCatalogDrawer: React.FC<PermissionCatalogDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  // Build catalog items from ALL_PERMISSIONS
  const catalogItems: PermissionCatalogItem[] = useMemo(() => {
    return ALL_PERMISSIONS.map((perm) => {
      const parts = perm.code.split('.');
      const module = parts[0] || 'system';
      const resource = parts[1] || 'general';
      const action = parts.slice(2).join('.') || 'access';

      // Roles holding this permission
      const rolesHolding: UserRole[] = (Object.keys(ROLE_DEFAULT_PERMISSIONS) as UserRole[]).filter(
        (role) => {
          const perms = ROLE_DEFAULT_PERMISSIONS[role];
          return perms.includes('*') || perms.includes(perm.code);
        }
      );

      // Evaluate risk level and rationale
      let riskLevel: RiskLevel = 'low';
      let riskRationale: string | undefined;

      if (
        perm.code.includes('salary') ||
        perm.code.includes('payroll') ||
        perm.code.includes('cost_price') ||
        perm.code.includes('supplier_price')
      ) {
        riskLevel = 'critical';
        riskRationale = 'Maliyyə və fərdi gəlir məxfiliyi (Maaş və Maya Dəyəri).';
      } else if (
        perm.code.includes('price.override') ||
        perm.code.includes('roles.manage') ||
        perm.code.includes('security.manage') ||
        perm.code.includes('pin.manage') ||
        perm.code.includes('delete.request')
      ) {
        riskLevel = 'critical';
        riskRationale = 'Sistem təhlükəsizliyi, qiymət dəyişikliyi və ya GDPR silinmə tələbi.';
      } else if (
        perm.code.includes('stock.adjust') ||
        perm.code.includes('refund.process') ||
        perm.code.includes('sale.cancel') ||
        perm.code.includes('discount.apply') ||
        perm.isSensitive
      ) {
        riskLevel = 'high';
        riskRationale = 'Fiziki mal qalıqlarının silinməsi və ya kassa vəsaiti çıxarışı.';
      } else if (perm.category === 'admin' || perm.category === 'finance') {
        riskLevel = 'medium';
      }

      return {
        id: perm.code,
        code: perm.code,
        module,
        resource,
        action,
        azName: perm.name,
        azDescription: perm.description,
        category: perm.category,
        isSensitive: !!perm.isSensitive,
        riskLevel,
        riskRationale,
        rolesHolding,
      };
    });
  }, []);

  // Distinct modules for filter
  const modulesList = useMemo(() => {
    const mods = new Set(catalogItems.map((c) => c.module));
    return Array.from(mods).sort();
  }, [catalogItems]);

  const filteredItems = useMemo(() => {
    return catalogItems.filter((item) => {
      if (sensitiveOnly && !item.isSensitive && item.riskLevel !== 'critical' && item.riskLevel !== 'high') {
        return false;
      }
      if (selectedModule !== 'all' && item.module !== selectedModule) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.code.toLowerCase().includes(q) ||
          item.azName.toLowerCase().includes(q) ||
          item.azDescription.toLowerCase().includes(q) ||
          item.module.toLowerCase().includes(q) ||
          item.resource.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [catalogItems, searchQuery, selectedModule, sensitiveOnly]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="İcazələr Kataloqu və Risk Təsnifatı (Permission Catalog)"
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Sistemdə mövcud olan bütün hüquqların <strong>Modul → Resurs → Əməliyyat</strong> iyerarxiyası,
          Azərbaycan dilində açıqlaması, risk dərəcələri və hansı rollara təyin olunduğu cədvəli.
        </p>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-muted/40 p-3 rounded-lg border border-border">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kod və ya təsvir ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">Bütün Modullar ({modulesList.length})</option>
              {modulesList.map((m) => (
                <option key={m} value={m}>
                  Modul: {m}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setSensitiveOnly(!sensitiveOnly)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                sensitiveOnly
                  ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Yalnız Həssas</span>
            </button>
          </div>
        </div>

        {/* Permission List Table */}
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          <div className="bg-muted/60 px-3 py-2 text-[11px] font-semibold text-muted-foreground grid grid-cols-12 gap-2">
            <div className="col-span-4">İcazə Kodu & İyerarxiya</div>
            <div className="col-span-4">Adı və Təsviri</div>
            <div className="col-span-2 text-center">Risk Dərəcəsi</div>
            <div className="col-span-2 text-right">Təyin Olunmuş Rollar</div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/60">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Axtarışa uyğun icazə tapılmadı.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.code}
                  className="px-3 py-2.5 text-xs grid grid-cols-12 gap-2 hover:bg-muted/30 transition-colors items-start"
                >
                  <div className="col-span-4 space-y-1">
                    <span className="font-mono text-[11px] font-semibold text-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border inline-block">
                      {item.code}
                    </span>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="capitalize font-medium">{item.module}</span>
                      <span>→</span>
                      <span>{item.resource}</span>
                      <span>→</span>
                      <span className="text-bh-accent">{item.action}</span>
                    </div>
                  </div>

                  <div className="col-span-4 space-y-0.5">
                    <p className="font-semibold text-foreground text-xs">{item.azName}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {item.azDescription}
                    </p>
                    {item.riskRationale && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                        ⚠️ {item.riskRationale}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 flex flex-col items-center justify-center gap-1">
                    {item.riskLevel === 'critical' ? (
                      <Badge variant="danger" size="sm" className="text-[10px]">
                        KRİTİK
                      </Badge>
                    ) : item.riskLevel === 'high' ? (
                      <Badge variant="warning" size="sm" className="text-[10px]">
                        YÜKSƏK
                      </Badge>
                    ) : item.riskLevel === 'medium' ? (
                      <Badge variant="neutral" size="sm" className="text-[10px]">
                        ORTA
                      </Badge>
                    ) : (
                      <Badge variant="outline" size="sm" className="text-[10px]">
                        STANDART
                      </Badge>
                    )}
                    {item.isSensitive && (
                      <span className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">
                        HƏSSAS
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 flex flex-wrap gap-1 justify-end">
                    {item.rolesHolding.map((role: UserRole) => (
                      <span
                        key={role}
                        className="text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border text-foreground font-medium"
                        title={ROLE_LABELS[role]}
                      >
                        {role === 'superadmin' ? 'Root' : (ROLE_LABELS[role] || role).slice(0, 10)}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
