import React, { useState, useMemo } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  ALL_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_LABELS,
} from '../../../shared/utils/permissions';
import { MOCK_ADMIN_USERS } from '../../../shared/adapters/mock/adminMockData';
import {
  Copy,
  Save,
  Search,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface CustomRoleItem {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

export const RolesPermissionsPage: React.FC = () => {
  const { toast } = useToast();

  // Initialize roles from defaults
  const [roles, setRoles] = useState<CustomRoleItem[]>([
    {
      id: 'r-1',
      key: 'superadmin',
      name: ROLE_LABELS.superadmin,
      description: 'Sistem üzrə tam qeyri-məhdud idarəetmə hüququ.',
      permissions: ROLE_DEFAULT_PERMISSIONS.superadmin,
      isSystem: true,
    },
    {
      id: 'r-2',
      key: 'general_manager',
      name: ROLE_LABELS.general_manager,
      description: 'Bütün filialların satış, anbar, maliyyə və BI hesabatları.',
      permissions: ROLE_DEFAULT_PERMISSIONS.general_manager,
      isSystem: true,
    },
    {
      id: 'r-3',
      key: 'branch_manager',
      name: ROLE_LABELS.branch_manager,
      description: 'Filial əməliyyatları, kassa və yerli heyət idarəetməsi.',
      permissions: ROLE_DEFAULT_PERMISSIONS.branch_manager,
      isSystem: true,
    },
    {
      id: 'r-4',
      key: 'cashier',
      name: ROLE_LABELS.cashier,
      description: 'POS kassa terminalı, satış və qaytarılma çekləri.',
      permissions: ROLE_DEFAULT_PERMISSIONS.cashier,
      isSystem: true,
    },
    {
      id: 'r-5',
      key: 'warehouse_keeper',
      name: ROLE_LABELS.warehouse_keeper,
      description: 'Anbar qalıqları, sayım və daxili transferlər.',
      permissions: ROLE_DEFAULT_PERMISSIONS.warehouse_keeper,
      isSystem: true,
    },
    {
      id: 'r-6',
      key: 'accountant',
      name: ROLE_LABELS.accountant,
      description: 'Xərclər, baş kitab, vergi və maliyyə hesabatları.',
      permissions: ROLE_DEFAULT_PERMISSIONS.accountant,
      isSystem: true,
    },
  ]);

  const [activeRoleId, setActiveRoleId] = useState<string>('r-3'); // Default to Branch Manager
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Edited permissions buffer for active role
  const activeRole = roles.find((r) => r.id === activeRoleId) || roles[0];
  const [currentPermissions, setCurrentPermissions] = useState<string[]>(activeRole.permissions);

  // Sync buffer when switching active role
  const handleSelectRole = (role: CustomRoleItem) => {
    setActiveRoleId(role.id);
    setCurrentPermissions(role.permissions);
  };

  // Diff before save modal
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Active users count for this role
  const activeUserCount = MOCK_ADMIN_USERS.filter((u) => u.role === activeRole.key).length;

  // Calculate changes diff
  const addedPermissions = useMemo(() => {
    return currentPermissions.filter((p) => !activeRole.permissions.includes(p));
  }, [currentPermissions, activeRole]);

  const removedPermissions = useMemo(() => {
    return activeRole.permissions.filter((p) => !currentPermissions.includes(p));
  }, [currentPermissions, activeRole]);

  const hasChanges = addedPermissions.length > 0 || removedPermissions.length > 0;

  // Filter permissions
  const filteredPermissions = useMemo(() => {
    return ALL_PERMISSIONS.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCat =
        selectedCategory === 'all' || p.category === selectedCategory;

      return matchSearch && matchCat;
    });
  }, [searchQuery, selectedCategory]);

  const togglePermission = (code: string) => {
    if (activeRole.key === 'superadmin') {
      toast({
        type: 'info',
        title: 'Superadmin hüquqları sabitdir',
        message: 'Sistem admini rolunun hüquqları bütün icazələri əhatə edir (*).',
      });
      return;
    }

    setCurrentPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const handleCloneRole = () => {
    const newId = `r-${Date.now()}`;
    const newRole: CustomRoleItem = {
      id: newId,
      key: `${activeRole.key}_copy`,
      name: `${activeRole.name} (Kopya)`,
      description: `${activeRole.name} rolunun bazasında yaradılmış fərdi icazə paketi.`,
      permissions: [...currentPermissions],
      isSystem: false,
    };

    setRoles((prev) => [...prev, newRole]);
    setActiveRoleId(newId);
    setCurrentPermissions(newRole.permissions);

    toast({
      type: 'success',
      title: 'Rol kopyalandı',
      message: `"${newRole.name}" rolu uğurla yaradıldı və redaktəyə açıldı.`,
    });
  };

  const handleConfirmSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === activeRoleId ? { ...r, permissions: currentPermissions } : r
        )
      );
      setIsSaving(false);
      setIsDiffModalOpen(false);

      toast({
        type: 'success',
        title: 'İcazələr yadda saxlanıldı',
        message: `"${activeRole.name}" rolunun icazə matrisi uğurla yeniləndi (${addedPermissions.length} əlavə, ${removedPermissions.length} ləğv).`,
      });
    }, 500);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Rollar və İcazələr' },
        ]}
      />

      <PageHeader
        title="Rollar və İcazələr Matrisi (RBAC)"
        description="Sistem rolları, granular hüquqlar (module.resource.action) və təhlükəsizlik səlahiyyətləri."
        badge={
          <Badge variant="neutral" size="sm">
            {roles.length} Rol • {ALL_PERMISSIONS.length} İcazə
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCloneRole}>
              <Copy className="h-4 w-4 mr-2" />
              Rolu Kopyala (Clone)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsDiffModalOpen(true)}
              disabled={!hasChanges}
            >
              <Save className="h-4 w-4 mr-2" />
              Dəyişiklikləri Yadda Saxla
            </Button>
          </div>
        }
      />

      {/* Role Selection & Active Role Info */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left Column: Roles List */}
        <div className="space-y-2 lg:col-span-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Mövcud Rollar
          </span>
          <div className="space-y-1.5">
            {roles.map((r) => {
              const isSelected = r.id === activeRoleId;
              const userCount = MOCK_ADMIN_USERS.filter((u) => u.role === r.key).length;

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRole(r)}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs flex flex-col gap-1 ${
                    isSelected
                      ? 'border-foreground bg-foreground text-background shadow-sm'
                      : 'border-border bg-card hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm truncate">{r.name}</span>
                    {r.isSystem && (
                      <Badge
                        variant={isSelected ? 'default' : 'neutral'}
                        size="sm"
                        className="text-[9px] px-1 py-0"
                      >
                        Sistem
                      </Badge>
                    )}
                  </div>
                  <span
                    className={`text-[11px] truncate ${
                      isSelected ? 'text-background/80' : 'text-muted-foreground'
                    }`}
                  >
                    {r.description}
                  </span>
                  <div
                    className={`text-[10px] mt-1 pt-1 border-t flex items-center justify-between ${
                      isSelected ? 'border-background/20 text-background/80' : 'border-border text-muted-foreground'
                    }`}
                  >
                    <span>İcazə sayı: {r.permissions.includes('*') ? 'Tam (*)' : r.permissions.length}</span>
                    <span>{userCount} İstifadəçi</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Permission Matrix Editor */}
        <div className="space-y-4 lg:col-span-3">
          {/* Warning Banner if Role has Active Users */}
          {activeUserCount > 0 && (
            <div className="flex items-start gap-3 p-3.5 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">
                  Aktiv istifadəçi xəbərdarlığı:
                </strong>
                Bu rola hazırda <strong className="text-foreground">{activeUserCount} aktiv istifadəçi</strong> təyin olunub. Buradakı hər hansı icazə dəyişikliyi həmin əməkdaşların sistemdəki səlahiyyətlərinə dərhal tətbiq olunacaq.
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <Card>
            <CardContent className="p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="İcazə adı və ya kodu ilə axtar..."
                  className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'Hamısı' },
                  { id: 'operations', label: 'Əməliyyatlar' },
                  { id: 'inventory', label: 'Məhsul və Anbar' },
                  { id: 'finance', label: 'Maliyyə' },
                  { id: 'people', label: 'İnsan və CRM' },
                  { id: 'admin', label: 'Sistem' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
                      selectedCategory === cat.id
                        ? 'bg-foreground text-background font-semibold'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Permissions Matrix Grid */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Seçilmiş Rol: <strong className="underline">{activeRole.name}</strong>
              </span>
              <span className="text-muted-foreground">
                {currentPermissions.includes('*')
                  ? 'Bütün hüquqlara sahibdir (*)'
                  : `${currentPermissions.length} / ${ALL_PERMISSIONS.length} icazə aktivdir`}
              </span>
            </div>

            <div className="divide-y divide-border">
              {filteredPermissions.map((perm) => {
                const isChecked =
                  currentPermissions.includes('*') ||
                  currentPermissions.includes(perm.code);

                return (
                  <div
                    key={perm.code}
                    onClick={() => togglePermission(perm.code)}
                    className={`p-3 text-xs flex items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors ${
                      isChecked ? 'bg-muted/20' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 pr-4">
                      <div className="pt-0.5">
                        {isChecked ? (
                          <div className="h-4 w-4 rounded bg-foreground text-background flex items-center justify-center">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded border border-border bg-background" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {perm.name}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                            {perm.code}
                          </span>
                          {perm.isSensitive && (
                            <Badge variant="warning" size="sm" className="text-[9px] px-1 py-0">
                              Həssas
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {perm.description}
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant={isChecked ? 'default' : 'neutral'}
                      size="sm"
                      className="text-[10px] shrink-0"
                    >
                      {isChecked ? 'İcazə Verilib' : 'Qadağandır'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Pre-save Diff Modal */}
      <Modal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        title="Dəyişikliklərin İcazə Fərqi (Pre-Save Diff)"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{activeRole.name}</strong> rolu üzrə tətbiq olunacaq icazə dəyişikliklərinə baxış:
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Added Permissions */}
            <div className="p-3 rounded-lg border border-success/30 bg-success/5 space-y-2">
              <div className="flex items-center justify-between font-semibold text-success">
                <span>Əlavə Edilən İcazələr</span>
                <span>+{addedPermissions.length}</span>
              </div>
              {addedPermissions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">Yoxdur</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {addedPermissions.map((code) => (
                    <li key={code} className="text-[11px] font-mono text-foreground">
                      + {code}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Removed Permissions */}
            <div className="p-3 rounded-lg border border-danger/30 bg-danger/5 space-y-2">
              <div className="flex items-center justify-between font-semibold text-danger">
                <span>Ləğv Edilən İcazələr</span>
                <span>-{removedPermissions.length}</span>
              </div>
              {removedPermissions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">Yoxdur</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {removedPermissions.map((code) => (
                    <li key={code} className="text-[11px] font-mono text-foreground">
                      - {code}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDiffModalOpen(false)}
            >
              İmtina
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleConfirmSave}
              isLoading={isSaving}
            >
              Təsdiqlə və Yadda Saxla
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
