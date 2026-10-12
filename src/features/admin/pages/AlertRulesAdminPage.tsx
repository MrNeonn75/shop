import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { AlertRule, AlertTriggerType } from '../types/notifications';
import { notificationsRepository } from '../../../shared/adapters';
import { ROLE_LABELS, UserRole } from '../../../shared/utils/permissions';
import { validateAlertRule } from '../utils/alertRuleEngine';
import {
  Plus,
  Send,
  Edit2,
  Trash2,
  Building2,
  RefreshCw,
  Clock,
} from 'lucide-react';

const TRIGGER_TYPES: { id: AlertTriggerType; label: string; unit: string }[] = [
  { id: 'low_stock', label: 'Kritik Minimum Stok Həddi', unit: 'ədəd' },
  { id: 'overdue_payment', label: 'Təchizatçı Ödəniş Gecikməsi', unit: 'gün' },
  { id: 'po_delay', label: 'Satınalma Sifarişinin Gecikməsi', unit: 'gün' },
  { id: 'transfer_transit_delayed', label: 'Tranzit Transfer Gecikməsi', unit: 'saat' },
  { id: 'register_variance', label: 'Kassa Fərqi (Kəsir / Artıq)', unit: '₼' },
  { id: 'large_refund', label: 'Böyük Məbləğli Qaytarma Çeki', unit: '₼' },
  { id: 'failed_integration', label: 'İnteqrasiya / Sinxronizasiya Xətası', unit: 'cəhd' },
  { id: 'backup_failure', label: 'Ehtiyat Nüsxə (Backup) Uğursuzluğu', unit: 'saat' },
  { id: 'document_expiry', label: 'Sənəd / Müqavilə Bitmə Xəbərdarlığı', unit: 'gün' },
];

export const AlertRulesAdminPage: React.FC = () => {
  const { toast } = useToast();

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Edit / Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<AlertRule> | null>(null);

  const fetchRules = async () => {
    setIsLoading(true);
    try {
      const data = await notificationsRepository.getAlertRules();
      setRules(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Qaydaları yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleOpenCreate = () => {
    setEditingRule({
      id: `rule-${Date.now()}`,
      name: '',
      triggerType: 'low_stock',
      thresholdValue: 5,
      thresholdUnit: 'ədəd',
      recipientRoles: ['branch_manager', 'warehouse_keeper'],
      recipientBranchIds: ['all'],
      escalationMinutes: 60,
      isEnabled: true,
      testSendStatus: 'Konfiqurasiya olunmayıb',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: AlertRule) => {
    setEditingRule({ ...rule });
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    const validation = validateAlertRule(editingRule as AlertRule);
    if (!validation.isValid) {
      toast({
        type: 'error',
        title: 'Qayda natamamdır',
        message: validation.errors.join('; '),
      });
      return;
    }

    try {
      const saved = editingRule.id && rules.some((r) => r.id === editingRule.id)
        ? await notificationsRepository.updateAlertRule(editingRule.id, editingRule)
        : await notificationsRepository.createAlertRule(editingRule);
      setRules((prev) => {
        const idx = prev.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });

      toast({
        type: 'success',
        title: 'Qayda yadda saxlanıldı',
        message: `"${saved.name}" xəbərdarlıq mexanizmi uğurla quraşdırıldı.`,
      });

      setIsModalOpen(false);
      setEditingRule(null);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Qaydanı yadda saxlamaq mümkün olmadı.',
      });
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await notificationsRepository.deleteAlertRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast({
        type: 'success',
        title: 'Qayda silindi',
        message: 'Xəbərdarlıq qaydası ləğv edildi.',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Qaydanı silmək mümkün olmadı.',
      });
    }
  };

  const handleTestSend = async (id: string) => {
    try {
      const res = await notificationsRepository.testSendAlertRule(id);
      toast({
        type: res.success ? 'success' : 'warning',
        title: 'Test Göndərişi',
        message: res.message,
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Test icra olunarkən xəta baş verdi.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Xəbərdarlıq Qaydaları' },
        ]}
      />

      <PageHeader
        title="Xəbərdarlıq və Həyəcan Qaydaları (Alert Rule Builder)"
        description="Kritik əməliyyat hədləri, eskalasiya müddətləri və avtomatik bildiriş tətikləyicilərinin konfiqurasiyası."
        badge={
          <Badge variant="neutral" size="sm">
            {rules.length} Qayda Aktivdir
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRules}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Yenilə
            </Button>
            <Button variant="default" size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Yeni Qayda Yarat
            </Button>
          </div>
        }
      />

      {/* Rules Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">Qayda Adı & Tətikləyici</th>
                <th className="py-3 px-4">Kritik Hədd (Threshold)</th>
                <th className="py-3 px-4">Məlumatlandırılan Rollar</th>
                <th className="py-3 px-4">Filial Əhatəsi</th>
                <th className="py-3 px-4">Eskalasiya</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Əməliyyatlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <strong className="text-foreground block">{rule.name}</strong>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {TRIGGER_TYPES.find((t) => t.id === rule.triggerType)?.label || rule.triggerType}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-foreground">
                    {rule.thresholdValue} {rule.thresholdUnit}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {rule.recipientRoles.map((r) => (
                        <span
                          key={r}
                          className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground"
                        >
                          {ROLE_LABELS[r as UserRole] || r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span>
                        {rule.recipientBranchIds.includes('all')
                          ? 'Bütün Filiallar'
                          : `${rule.recipientBranchIds.length} Filial`}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground font-mono">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{rule.escalationMinutes} dəq</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={rule.isEnabled ? 'success' : 'neutral'} size="sm">
                      {rule.isEnabled ? 'Aktiv' : 'Deaktiv'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestSend(rule.id)}
                        className="h-7 text-xs flex items-center gap-1"
                        title="Təhlükəsiz test sınağı keçir"
                      >
                        <Send className="h-3 w-3" />
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(rule)}
                        className="h-7 w-7 p-0"
                        title="Redaktə et"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="h-7 w-7 p-0 text-danger hover:text-danger"
                        title="Sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRule?.id ? 'Xəbərdarlıq Qaydasını Tənzimlə' : 'Yeni Xəbərdarlıq Qaydası'}
        size="md"
      >
        {editingRule && (
          <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Qaydanın Adı</label>
              <input
                type="text"
                value={editingRule.name || ''}
                onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                placeholder="məs: Kritik Qalıq Xəbərdarlığı"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Tətikləyici Hadisə</label>
                <select
                  value={editingRule.triggerType}
                  onChange={(e) => {
                    const found = TRIGGER_TYPES.find((t) => t.id === e.target.value);
                    setEditingRule({
                      ...editingRule,
                      triggerType: e.target.value as AlertTriggerType,
                      thresholdUnit: found ? found.unit : editingRule.thresholdUnit,
                    });
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">
                  Hədd Qiyməti ({editingRule.thresholdUnit})
                </label>
                <input
                  type="number"
                  value={editingRule.thresholdValue ?? 0}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      thresholdValue: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Eskalasiya Gecikməsi (dəqiqə)</label>
              <input
                type="number"
                min="0"
                value={editingRule.escalationMinutes ?? 60}
                onChange={(e) =>
                  setEditingRule({
                    ...editingRule,
                    escalationMinutes: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <span className="text-[10px] text-muted-foreground block">
                Məsələ cavablandırılmadıqda növbəti rəhbər səviyyəsinə ötürülmə vaxtı.
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isRuleEnabled"
                checked={editingRule.isEnabled}
                onChange={(e) =>
                  setEditingRule({ ...editingRule, isEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="isRuleEnabled" className="font-medium text-foreground cursor-pointer">
                Qayda aktivdir və dərhal tətbiq olunsun
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
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
    </div>
  );
};
