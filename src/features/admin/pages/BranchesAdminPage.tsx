import React, { useState, useMemo } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/useToast';
import { MOCK_ADMIN_BRANCHES, AdminBranch } from '../../../shared/adapters/mock/adminMockData';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Clock,
  MapPin,
  Phone,
  User,
} from 'lucide-react';

export const BranchesAdminPage: React.FC = () => {
  const { toast } = useToast();
  const [branches, setBranches] = useState<AdminBranch[]>(MOCK_ADMIN_BRANCHES);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Edit / Create Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Partial<AdminBranch> | null>(null);

  // Deletion / Deactivation state with reason
  const [branchToDelete, setBranchToDelete] = useState<AdminBranch | null>(null);
  const [deletionReason, setDeletionReason] = useState('');

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const matchesSearch =
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.address.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? b.isActive
          : !b.isActive;

      return matchesSearch && matchesStatus;
    });
  }, [branches, searchQuery, statusFilter]);

  const handleOpenCreate = () => {
    setEditingBranch({
      id: `branch-${Date.now()}`,
      code: `BH-${branches.length + 1}`,
      name: '',
      address: '',
      phone: '+994 ',
      managerName: '',
      workingHoursWeekday: '10:00 - 22:00',
      workingHoursWeekend: '10:00 - 23:00',
      cashRegistersCount: 1,
      warehousesCount: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (branch: AdminBranch) => {
    setEditingBranch({ ...branch });
    setIsModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch || !editingBranch.name || !editingBranch.code) {
      toast({
        type: 'error',
        title: 'Məlumat natamamdır',
        message: 'Filial kodu və adı mütləq doldurulmalıdır.',
      });
      return;
    }

    setBranches((prev) => {
      const index = prev.findIndex((b) => b.id === editingBranch.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = editingBranch as AdminBranch;
        return next;
      }
      return [...prev, editingBranch as AdminBranch];
    });

    toast({
      type: 'success',
      title: 'Filial yadda saxlanıldı',
      message: `"${editingBranch.name}" filialı uğurla yeniləndi.`,
    });
    setIsModalOpen(false);
    setEditingBranch(null);
  };

  const handleConfirmDelete = () => {
    if (!branchToDelete) return;
    setBranches((prev) => prev.filter((b) => b.id !== branchToDelete.id));
    toast({
      type: 'success',
      title: 'Filial silindi',
      message: `"${branchToDelete.name}" filialı sistemdən silindi. Səbəb: ${deletionReason || 'Qeyd edilməyib'}`,
    });
    setBranchToDelete(null);
    setDeletionReason('');
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Filiallar' },
        ]}
      />

      <PageHeader
        title="Filiallar və Kassa İdarəetməsi"
        description="Pərakəndə satış nöqtələrinin siyahısı, iş qrafiki, ünvanları, kassaları və statusu."
        badge={
          <Badge variant="neutral" size="sm">
            {branches.length} Filial
          </Badge>
        }
        actions={
          <Button variant="default" size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Filial Əlavə Et
          </Button>
        }
      />

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filial adı, kodu və ya ünvan ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-muted-foreground">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Hamısı</option>
              <option value="active">Yalnız Aktiv</option>
              <option value="inactive">Qeyri-aktiv</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Branches Table / Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredBranches.map((branch) => (
          <Card key={branch.id} className="relative overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {branch.code}
                    </span>
                    <h3 className="text-base font-bold text-foreground">
                      {branch.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{branch.address}</span>
                  </div>
                </div>

                {branch.isActive ? (
                  <Badge variant="success" size="sm">
                    Aktiv
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="sm">
                    Qeyri-aktiv
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-y border-border py-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>Menecer: <strong className="text-foreground">{branch.managerName}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{branch.phone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>İş günləri: <strong className="text-foreground">{branch.workingHoursWeekday}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Həftəsonu: <strong className="text-foreground">{branch.workingHoursWeekend}</strong></span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>Kassalar: <strong className="text-foreground">{branch.cashRegistersCount} ədəd</strong></span>
                  <span>Anbarlar: <strong className="text-foreground">{branch.warehousesCount} ədəd</strong></span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(branch)}
                    className="h-8 px-2 text-xs"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Düzəliş
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBranchToDelete(branch)}
                    className="h-8 px-2 text-xs text-danger hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit / Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBranch?.id ? 'Filial Məlumatlarını Redaktə Et' : 'Yeni Filial Qeydiyyatı'}
        size="md"
      >
        {editingBranch && (
          <form onSubmit={handleSaveBranch} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Filial Kodu</label>
                <input
                  type="text"
                  value={editingBranch.code || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, code: e.target.value })
                  }
                  placeholder="məs: BH-28M"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Filial Adı</label>
                <input
                  type="text"
                  value={editingBranch.name || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, name: e.target.value })
                  }
                  placeholder="məs: 28 May Flaman Filialı"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Ünvan</label>
              <input
                type="text"
                value={editingBranch.address || ''}
                onChange={(e) =>
                  setEditingBranch({ ...editingBranch, address: e.target.value })
                }
                placeholder="Rəsmi yerləşmə ünvanı"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Filial Meneceri</label>
                <input
                  type="text"
                  value={editingBranch.managerName || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, managerName: e.target.value })
                  }
                  placeholder="Ad və Soyad"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Əlaqə Nömrəsi</label>
                <input
                  type="text"
                  value={editingBranch.phone || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, phone: e.target.value })
                  }
                  placeholder="+994 12 ..."
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">İş Saatları (B.e - Cümə)</label>
                <input
                  type="text"
                  value={editingBranch.workingHoursWeekday || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, workingHoursWeekday: e.target.value })
                  }
                  placeholder="10:00 - 22:00"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">İş Saatları (Şənbə - Bazar)</label>
                <input
                  type="text"
                  value={editingBranch.workingHoursWeekend || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, workingHoursWeekend: e.target.value })
                  }
                  placeholder="10:00 - 23:00"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Kassa Sayı</label>
                <input
                  type="number"
                  min="1"
                  value={editingBranch.cashRegistersCount || 1}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, cashRegistersCount: Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="isActiveBranch"
                  checked={editingBranch.isActive}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, isActive: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="isActiveBranch" className="text-xs font-medium text-foreground cursor-pointer">
                  Filial aktivdir və satışa açıqdır
                </label>
              </div>
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

      {/* Delete Confirmation with Mandatory Reason */}
      <ConfirmDialog
        isOpen={Boolean(branchToDelete)}
        onClose={() => setBranchToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Filialı silmək və ya qapatmaq istəyirsiniz?"
        description={`"${branchToDelete?.name}" filialının silinməsi kassa və anbar əməliyyatlarını dayandıracaq. Bu əməliyyat üçün zəruri səbəb daxil edin:`}
        confirmText="Təsdiqlə və Sil"
        cancelText="İmtina"
        variant="danger"
      >
        <div className="mt-3 space-y-1">
          <label className="text-xs font-semibold text-foreground">Silinmə / Bağlanma Səbəbi (Mütləqdir)</label>
          <textarea
            value={deletionReason}
            onChange={(e) => setDeletionReason(e.target.value)}
            placeholder="məs: Təmir işləri səbəbindən filial müvəqqəti bağlanır..."
            rows={2}
            className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
};
