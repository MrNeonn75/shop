import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/useToast';
import {
  MOCK_ADMIN_WAREHOUSES,
  MOCK_ADMIN_BRANCHES,
  AdminWarehouse,
} from '../../../shared/adapters/mock/adminMockData';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export const WarehousesAdminPage: React.FC = () => {
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>(MOCK_ADMIN_WAREHOUSES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<Partial<AdminWarehouse> | null>(null);
  const [whToDelete, setWhToDelete] = useState<AdminWarehouse | null>(null);

  const getWarehouseTypeBadge = (type: AdminWarehouse['type']) => {
    switch (type) {
      case 'central':
        return <Badge variant="default" size="sm">Mərkəzi Anbar</Badge>;
      case 'branch':
        return <Badge variant="neutral" size="sm">Filial Anbarı</Badge>;
      case 'in-transit':
        return <Badge variant="warning" size="sm">Tranzit / Yolda</Badge>;
    }
  };

  const handleOpenCreate = () => {
    setEditingWh({
      id: `wh-${Date.now()}`,
      code: `WH-${warehouses.length + 1}`,
      name: '',
      type: 'branch',
      branchId: MOCK_ADMIN_BRANCHES[0].id,
      branchName: MOCK_ADMIN_BRANCHES[0].name,
      capacitySqM: 100,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (wh: AdminWarehouse) => {
    setEditingWh({ ...wh });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWh || !editingWh.name || !editingWh.code) {
      toast({
        type: 'error',
        title: 'Məlumat natamamdır',
        message: 'Anbar kodu və adı mütləq daxil edilməlidir.',
      });
      return;
    }

    const branch = MOCK_ADMIN_BRANCHES.find((b) => b.id === editingWh.branchId);
    const updatedWh: AdminWarehouse = {
      ...(editingWh as AdminWarehouse),
      branchName: branch ? branch.name : 'Mərkəz',
    };

    setWarehouses((prev) => {
      const idx = prev.findIndex((w) => w.id === updatedWh.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedWh;
        return next;
      }
      return [...prev, updatedWh];
    });

    toast({
      type: 'success',
      title: 'Anbar yadda saxlanıldı',
      message: `"${updatedWh.name}" anbarı uğurla yeniləndi.`,
    });
    setIsModalOpen(false);
    setEditingWh(null);
  };

  const handleDelete = () => {
    if (!whToDelete) return;
    setWarehouses((prev) => prev.filter((w) => w.id !== whToDelete.id));
    toast({
      type: 'success',
      title: 'Anbar silindi',
      message: `"${whToDelete.name}" anbarı silindi.`,
    });
    setWhToDelete(null);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Anbarlar' },
        ]}
      />

      <PageHeader
        title="Anbarlar və Saxlama Nöqtələri"
        description="Mərkəzi loqistika, filial anbarları və transfer tranzit anbarlarının idarə olunması."
        badge={
          <Badge variant="neutral" size="sm">
            {warehouses.length} Anbar Nöqtəsi
          </Badge>
        }
        actions={
          <Button variant="default" size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Anbar Yarat
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {warehouses.map((wh) => (
          <Card key={wh.id} className="relative overflow-hidden">
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-[11px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {wh.code}
                  </span>
                  <h3 className="text-sm font-bold text-foreground mt-1">
                    {wh.name}
                  </h3>
                </div>
                {getWarehouseTypeBadge(wh.type)}
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground border-y border-border py-2.5">
                <div className="flex items-center justify-between">
                  <span>Bağlı olduğu filial:</span>
                  <strong className="text-foreground">{wh.branchName}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Saxlama sahəsi:</span>
                  <strong className="text-foreground">
                    {wh.capacitySqM > 0 ? `${wh.capacitySqM} m²` : 'Tranzit (Dinamik)'}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <span className={wh.isActive ? 'text-success font-medium' : 'text-muted-foreground font-medium'}>
                    {wh.isActive ? 'Aktiv' : 'Qeyri-aktiv'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(wh)}
                  className="h-8 px-2 text-xs"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  Redaktə
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWhToDelete(wh)}
                  className="h-8 px-2 text-xs text-danger hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit / Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingWh?.id ? 'Anbarı Redaktə Et' : 'Yeni Anbar Qeydiyyatı'}
        size="md"
      >
        {editingWh && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Anbar Kodu</label>
                <input
                  type="text"
                  value={editingWh.code || ''}
                  onChange={(e) => setEditingWh({ ...editingWh, code: e.target.value })}
                  placeholder="məs: WH-28M"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Anbar Adı</label>
                <input
                  type="text"
                  value={editingWh.name || ''}
                  onChange={(e) => setEditingWh({ ...editingWh, name: e.target.value })}
                  placeholder="məs: 28 May Filialının Alt Anbarı"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Anbar Növü</label>
                <select
                  value={editingWh.type || 'branch'}
                  onChange={(e) =>
                    setEditingWh({ ...editingWh, type: e.target.value as AdminWarehouse['type'] })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="central">Mərkəzi Anbar</option>
                  <option value="branch">Filial Anbarı</option>
                  <option value="in-transit">Yolda / Tranzit Anbarı</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Əlaqəli Filial</label>
                <select
                  value={editingWh.branchId || ''}
                  onChange={(e) => setEditingWh({ ...editingWh, branchId: e.target.value })}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Sahə (m²)</label>
                <input
                  type="number"
                  min="0"
                  value={editingWh.capacitySqM || 0}
                  onChange={(e) =>
                    setEditingWh({ ...editingWh, capacitySqM: Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="isWhActive"
                  checked={editingWh.isActive}
                  onChange={(e) => setEditingWh({ ...editingWh, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="isWhActive" className="text-xs font-medium text-foreground cursor-pointer">
                  Anbar aktivdir
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

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(whToDelete)}
        onClose={() => setWhToDelete(null)}
        onConfirm={handleDelete}
        title="Anbarı silmək istəyirsiniz?"
        description={`"${whToDelete?.name}" anbarının silinməsi bu anbarda mövcud olan qalıqların başqa anbara köçürülməsini tələb edə bilər.`}
        confirmText="Sil"
        cancelText="İmtina"
        variant="danger"
      />
    </div>
  );
};
