import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/useToast';
import {
  MOCK_ADMIN_USERS,
  MOCK_ADMIN_BRANCHES,
  AdminUser,
} from '../../../shared/adapters/mock/adminMockData';
import { ROLE_LABELS, UserRole } from '../../../shared/utils/permissions';
import { formatDateTime } from '../../../shared/utils/formatters';
import { calculateUserInactivity } from '../utils/effectivePermissionsEngine';
import { ManagerPinModal } from '../components/ManagerPinModal';
import { TemporaryAccessModal } from '../components/TemporaryAccessModal';
import {
  UserPlus,
  Search,
  Edit2,
  KeyRound,
  UserCheck,
  UserX,
  Building2,
  Clock,
  ShieldCheck,
  Lock,
  AlertTriangle,
} from 'lucide-react';

export const UsersAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>(MOCK_ADMIN_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<AdminUser> | null>(null);
  const [userToSuspend, setUserToSuspend] = useState<AdminUser | null>(null);

  // Manager PIN & Temp Access State
  const [pinModalUser, setPinModalUser] = useState<AdminUser | null>(null);
  const [isTempAccessOpen, setIsTempAccessOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchBranch = branchFilter === 'all' || u.branchId === branchFilter;
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? u.isActive
          : !u.isActive;

      return matchSearch && matchRole && matchBranch && matchStatus;
    });
  }, [users, searchQuery, roleFilter, branchFilter, statusFilter]);

  const handleOpenCreate = () => {
    setEditingUser({
      id: `usr-${Date.now()}`,
      name: '',
      email: '',
      username: '',
      role: 'cashier',
      roleName: ROLE_LABELS.cashier,
      branchId: MOCK_ADMIN_BRANCHES[0].id,
      branchName: MOCK_ADMIN_BRANCHES[0].name,
      allowedBranchIds: [MOCK_ADMIN_BRANCHES[0].id],
      isActive: true,
      phone: '+994 ',
      lastLoginAt: new Date().toISOString(),
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AdminUser) => {
    setEditingUser({ ...user });
    setIsModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editingUser.name || !editingUser.username || !editingUser.email) {
      toast({
        type: 'error',
        title: 'Məlumat natamamdır',
        message: 'Ad, istifadəçi adı və email mütləq daxil edilməlidir.',
      });
      return;
    }

    const branch = MOCK_ADMIN_BRANCHES.find((b) => b.id === editingUser.branchId);
    const updatedUser: AdminUser = {
      ...(editingUser as AdminUser),
      roleName: ROLE_LABELS[editingUser.role as UserRole] || 'İstifadəçi',
      branchName: branch ? branch.name : 'Baş Ofis',
    };

    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === updatedUser.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedUser;
        return next;
      }
      return [...prev, updatedUser];
    });

    toast({
      type: 'success',
      title: 'İstifadəçi yadda saxlanıldı',
      message: `"${updatedUser.name}" hesabı uğurla yeniləndi.`,
    });
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleForcePasswordReset = (user: AdminUser) => {
    toast({
      type: 'info',
      title: 'Şifrə sıfırlama tələbi göndərildi',
      message: `"${user.name}" növbəti dəfə sistemə daxil olarkən məcburi şifrə dəyişməli olacaq. Təlimat linki ${user.email} ünvanına yönləndirildi.`,
    });
  };

  const handleToggleSuspend = () => {
    if (!userToSuspend) return;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userToSuspend.id ? { ...u, isActive: !u.isActive } : u
      )
    );
    toast({
      type: 'success',
      title: userToSuspend.isActive ? 'İstifadəçi bloklandı' : 'İstifadəçi aktivləşdirildi',
      message: `"${userToSuspend.name}" hesabının statusu dəyişdirildi.`,
    });
    setUserToSuspend(null);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'İstifadəçilər' },
        ]}
      />

      <PageHeader
        title="İstifadəçilər və Giriş Hesabları"
        description="Sistemə daxil olan əməkdaşlar, onların təyin olunduğu rollar, filial səlahiyyətləri və təhlükəsizlik statusu."
        badge={
          <Badge variant="neutral" size="sm">
            {users.length} İstifadəçi
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/access-review')}
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Giriş Təftişi (Review)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTempAccessOpen(true)}
            >
              <Clock className="h-4 w-4 mr-1.5" />
              Müvəqqəti Giriş & Nümayəndəlik
            </Button>
            <Button variant="default" size="sm" onClick={handleOpenCreate}>
              <UserPlus className="h-4 w-4 mr-1.5" />
              Yeni İstifadəçi
            </Button>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ad, username və ya email ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Rollar</option>
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Filiallar</option>
              {MOCK_ADMIN_BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Statuslar</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Bloklanmış</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">İstifadəçi</th>
                <th className="py-3 px-4">Rol</th>
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4">Son Giriş</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Əməliyyatlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bh-accent text-bh-accent-foreground font-bold text-xs shrink-0">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{u.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          @{u.username} • {u.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="neutral" size="sm" className="font-semibold">
                      {u.roleName}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span>{u.branchName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                    <div className="flex flex-col">
                      <span>{formatDateTime(u.lastLoginAt)}</span>
                      {calculateUserInactivity(u.lastLoginAt).isInactive30d && (
                        <span className="text-[10px] text-amber-500 font-sans flex items-center gap-1 font-medium mt-0.5">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {calculateUserInactivity(u.lastLoginAt).inactivityDays} gün aktiv deyil
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {u.isActive ? (
                      <Badge variant="success" size="sm">
                        Aktiv
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="sm">
                        Bloklanıb
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPinModalUser(u)}
                        className="h-8 w-8 p-0"
                        title="POS Menecer PIN Kodunu Tənzimlə"
                      >
                        <Lock className="h-3.5 w-3.5 text-bh-accent hover:text-bh-accent-hover" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleForcePasswordReset(u)}
                        className="h-8 w-8 p-0"
                        title="Məcburi şifrə yeniləmə tələbi göndər"
                      >
                        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(u)}
                        className="h-8 w-8 p-0"
                        title="Redaktə et"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUserToSuspend(u)}
                        className={`h-8 w-8 p-0 ${
                          u.isActive ? 'text-danger hover:text-danger' : 'text-success hover:text-success'
                        }`}
                        title={u.isActive ? 'Hesabı blokla' : 'Hesabı aktivləşdir'}
                      >
                        {u.isActive ? (
                          <UserX className="h-3.5 w-3.5" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser?.id ? 'İstifadəçi Məlumatlarını Redaktə Et' : 'Yeni İstifadəçi Hesabı Aç'}
        size="md"
      >
        {editingUser && (
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Tam Ad və Soyad</label>
                <input
                  type="text"
                  value={editingUser.name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  placeholder="məs: Əli Hüseynov"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">İstifadəçi Adı (Login)</label>
                <input
                  type="text"
                  value={editingUser.username || ''}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, username: e.target.value })
                  }
                  placeholder="məs: ali.huseynov"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">E-poçt Ünvanı</label>
                <input
                  type="email"
                  value={editingUser.email || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  placeholder="ali@brendhouse.az"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Telefon</label>
                <input
                  type="text"
                  value={editingUser.phone || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  placeholder="+994 50 ..."
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Sistem Rolu</label>
                <select
                  value={editingUser.role || 'cashier'}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      role: e.target.value as UserRole,
                      roleName: ROLE_LABELS[e.target.value as UserRole],
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Object.entries(ROLE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Əsas Filial Təyinatı</label>
                <select
                  value={editingUser.branchId || ''}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      branchId: e.target.value,
                      allowedBranchIds: [e.target.value],
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MOCK_ADMIN_BRANCHES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isUserActive"
                checked={editingUser.isActive}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, isActive: e.target.checked })
                }
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="isUserActive" className="text-xs font-medium text-foreground cursor-pointer">
                Hesab aktivdir və sistemə daxil ola bilər
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
              >
                İmtina
              </Button>
              <Button type="submit" variant="default" size="sm">
                Yadda Saxla
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Suspend / Reactivate Dialog */}
      <ConfirmDialog
        isOpen={Boolean(userToSuspend)}
        onClose={() => setUserToSuspend(null)}
        onConfirm={handleToggleSuspend}
        title={
          userToSuspend?.isActive
            ? 'İstifadəçi hesabını bloklamaq istəyirsiniz?'
            : 'İstifadəçi hesabını aktivləşdirmək istəyirsiniz?'
        }
        description={
          userToSuspend?.isActive
            ? `"${userToSuspend?.name}" (@${userToSuspend?.username}) bloklandıqda cari açıq sessiyaları sonlandırılacaq və sistemə daxil ola bilməyəcək.`
            : `"${userToSuspend?.name}" (@${userToSuspend?.username}) yenidən sistemə daxil ola biləcək.`
        }
        confirmText={userToSuspend?.isActive ? 'Blokla' : 'Aktivləşdir'}
        cancelText="İmtina"
        variant={userToSuspend?.isActive ? 'danger' : 'default'}
      />

      {/* Manager PIN Modal */}
      {pinModalUser && (
        <ManagerPinModal
          isOpen={Boolean(pinModalUser)}
          onClose={() => setPinModalUser(null)}
          user={pinModalUser}
          onSuccess={() => {
            toast({
              type: 'success',
              title: 'PIN Uğurla Tənzimləndi',
              message: `${pinModalUser.name} üçün POS menecer PIN kodu yadda saxlanıldı.`,
            });
          }}
        />
      )}

      {/* Temporary Access & Delegation Modal */}
      <TemporaryAccessModal
        isOpen={isTempAccessOpen}
        onClose={() => setIsTempAccessOpen(false)}
        users={users}
        onSuccess={() => {
          toast({
            type: 'success',
            title: 'Müvəqqəti Giriş Qeydə Alındı',
            message: 'Müvəqqəti səlahiyyət və ya nümayəndəlik təyinatı uğurla təsdiqləndi.',
          });
        }}
      />
    </div>
  );
};
