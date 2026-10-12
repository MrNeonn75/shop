import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/useToast';
import { TemporaryAccessGrant, AccessDelegation } from '../types/permissionsAdvanced';
import { UserRole, ROLE_LABELS } from '../../../shared/utils/permissions';
import { Clock, UserCheck } from 'lucide-react';

interface TemporaryAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: Array<{ id: string; name: string; role: UserRole; branchId: string; branchName: string }>;
  onGrantTemporaryAccess?: (grant: Omit<TemporaryAccessGrant, 'id' | 'status'>) => Promise<void>;
  onDelegateApprovals?: (delegation: Omit<AccessDelegation, 'id' | 'isActive'>) => Promise<void>;
  onSuccess?: () => void;
}

export const TemporaryAccessModal: React.FC<TemporaryAccessModalProps> = ({
  isOpen,
  onClose,
  users,
  onGrantTemporaryAccess,
  onDelegateApprovals,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'temp_grant' | 'delegation'>('temp_grant');

  // Temp Grant Form State
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');
  const [grantedRoleOrPerm, setGrantedRoleOrPerm] = useState('inventory.stock.adjust');
  const [scopeBranchId, setScopeBranchId] = useState(users[0]?.branchId || 'branch-1');
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 16);
  });
  const [grantReason, setGrantReason] = useState('');

  // Delegation Form State
  const [delegatorId, setDelegatorId] = useState(users[1]?.id || users[0]?.id || '');
  const [substituteId, setSubstituteId] = useState(users[2]?.id || users[0]?.id || '');
  const [delegationStart, setDelegationStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [delegationEnd, setDelegationEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [delegationReason, setDelegationReason] = useState('Məzuniyyət dövründə təsdiqləmə səlahiyyətinin ötürülməsi');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = users.find((u) => u.id === selectedUserId);
    if (!targetUser) return;

    if (!grantReason || grantReason.trim().length < 5) {
      toast({
        type: 'error',
        title: 'Səbəb tələb olunur',
        message: 'Müvəqqəti icazə üçün rəsmi əsaslandırma daxil edilməlidir.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (onGrantTemporaryAccess) {
        await onGrantTemporaryAccess({
          userId: targetUser.id,
          userName: targetUser.name,
          permissionOrRole: grantedRoleOrPerm,
          scopeBranchId,
          scopeBranchName: targetUser.branchName,
          startsAt: new Date().toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
          reason: grantReason,
          approverId: 'admin-curr',
          approverName: 'Kamran Əliyev (Sistem Admini)',
        });
      }
      onSuccess?.();

      toast({
        type: 'success',
        title: 'Müvəqqəti icazə verildi',
        message: `${targetUser.name} üçün təyin olunmuş müvəqqəti icazə qüvvəyə mindi.`,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Müvəqqəti icazə qeyd edilə bilmədi.';
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelegationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (delegatorId === substituteId) {
      toast({
        type: 'error',
        title: 'Yanlış əvəzedici',
        message: 'Əvəzedici şəxs əsas təsdiqləyicidən fərqli istifadəçi olmalıdır.',
      });
      return;
    }

    const delegator = users.find((u) => u.id === delegatorId);
    const substitute = users.find((u) => u.id === substituteId);
    if (!delegator || !substitute) return;

    setIsSubmitting(true);
    try {
      if (onDelegateApprovals) {
        await onDelegateApprovals({
          delegatorId: delegator.id,
          delegatorName: delegator.name,
          substituteId: substitute.id,
          substituteName: substitute.name,
          role: delegator.role,
          startDate: delegationStart,
          endDate: delegationEnd,
          reason: delegationReason,
        });
      }
      onSuccess?.();

      toast({
        type: 'success',
        title: 'Səlahiyyət nümayəndəliyi qeyd olundu',
        message: `${delegator.name} tərəfindən təsdiq hüququ ${substitute.name}-ə həvalə edildi.`,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nümayəndəlik qeyd edilə bilmədi.';
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Müvəqqəti Giriş və Səlahiyyət Nümayəndəliyi (Delegation)"
      size="lg"
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab('temp_grant')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === 'temp_grant'
                ? 'border-bh-black dark:border-bh-white text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Müvəqqəti İcazə Təyini (Temporary Grant)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('delegation')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === 'delegation'
                ? 'border-bh-black dark:border-bh-white text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>Təsdiqləyici Əvəzləməsi (Məzuniyyət Nümayəndəliyi)</span>
          </button>
        </div>

        {tab === 'temp_grant' ? (
          <form onSubmit={handleGrantSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  İstifadəçi
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABELS[u.role]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Müvəqqəti Verilən İcazə və ya Rol
                </label>
                <select
                  value={grantedRoleOrPerm}
                  onChange={(e) => setGrantedRoleOrPerm(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="inventory.stock.adjust">inventory.stock.adjust (Sayım düzəlişi)</option>
                  <option value="sales.refund.process">sales.refund.process (Qaytarılma icrası)</option>
                  <option value="pos.discount.apply">pos.discount.apply (Xüsusi endirim)</option>
                  <option value="procurement.orders.create">procurement.orders.create (Satınalma sifarişi)</option>
                  <option value="finance.expense.create">finance.expense.create (Xərc daxiletmə)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Qüvvədən Düşmə Tarixi və Saatı
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Filial Əhatəsi (Scope)
                </label>
                <select
                  value={scopeBranchId}
                  onChange={(e) => setScopeBranchId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="branch-1">28 May Flaman Filialı</option>
                  <option value="branch-2">Gənclik Mall Filialı</option>
                  <option value="branch-3">Dəniz Mall Filialı</option>
                  <option value="*">Bütün Filiallar (Şəbəkə)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Təyinat Səbəbi / Əsaslandırma <span className="text-destructive">*</span>
              </label>
              <textarea
                rows={2}
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="məs: Baş menecerin tapşırığı ilə rüblük sayım komissiyasında iştirak üçün müvəqqəti hüquq"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Ləğv Et
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={isSubmitting}>
                Müvəqqəti İcazəni Təsdiqlə
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleDelegationSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Əsas Təsdiqləyici (Məzuniyyətə gedən)
                </label>
                <select
                  value={delegatorId}
                  onChange={(e) => setDelegatorId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABELS[u.role]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Əvəzedici Nümayəndə (Təsdiq edəcək şəxs)
                </label>
                <select
                  value={substituteId}
                  onChange={(e) => setSubstituteId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABELS[u.role]})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Başlama Tarixi
                </label>
                <input
                  type="date"
                  value={delegationStart}
                  onChange={(e) => setDelegationStart(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Bitmə Tarixi
                </label>
                <input
                  type="date"
                  value={delegationEnd}
                  onChange={(e) => setDelegationEnd(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Nümayəndəlik Əmri və ya Səbəb
              </label>
              <textarea
                rows={2}
                value={delegationReason}
                onChange={(e) => setDelegationReason(e.target.value)}
                placeholder="məs: İllik məzuniyyət dövründə xərc və transfer təsdiqi səlahiyyətinin müavinə həvalə edilməsi"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Ləğv Et
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={isSubmitting}>
                Nümayəndəliyi Təsdiq Et
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
