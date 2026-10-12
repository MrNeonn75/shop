import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { PromoCode, PromotionRule } from '../types';
import { promoCodeSchema, PromoCodeFormData } from '../schemas/marketingSchemas';
import { AlertTriangle, Hash, Sparkles } from 'lucide-react';

interface PromoCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  promotionRules: PromotionRule[];
  onCreateSingle: (data: Partial<PromoCode>) => Promise<void>;
  onGenerateBulk: (prefix: string, count: number, template: Partial<PromoCode>) => Promise<void>;
}

export const PromoCodeModal: React.FC<PromoCodeModalProps> = ({
  isOpen,
  onClose,
  promotionRules,
  onCreateSingle,
  onGenerateBulk,
}) => {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Single form data
  const [formData, setFormData] = useState<PromoCodeFormData>({
    code: '',
    promotionRuleId: promotionRules[0]?.id || 'pr-1',
    discountDescription: 'Bahar geyimlərinə 20% xüsusi endirim',
    totalUsageLimit: 100,
    perCustomerLimit: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    targetBranchIds: ['*'],
    targetSegmentIds: ['*'],
  });

  // Bulk parameters
  const [bulkPrefix, setBulkPrefix] = useState<string>('BH2026');
  const [bulkCount, setBulkCount] = useState<number>(20);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (mode === 'single') {
      const parse = promoCodeSchema.safeParse(formData);
      if (!parse.success) {
        const errs: Record<string, string> = {};
        parse.error.issues.forEach((iss) => {
          errs[iss.path[0] as string] = iss.message;
        });
        setErrors(errs);
        return;
      }

      setIsSubmitting(true);
      try {
        await onCreateSingle({
          code: formData.code.toUpperCase(),
          promotionRuleId: formData.promotionRuleId,
          discountDescription: formData.discountDescription,
          totalUsageLimit: formData.totalUsageLimit,
          perCustomerLimit: formData.perCustomerLimit,
          startDate: formData.startDate,
          endDate: formData.endDate,
          targetBranchIds: formData.targetBranchIds,
          targetSegmentIds: formData.targetSegmentIds,
        });
        onClose();
      } catch (err: unknown) {
        setErrors({ form: err instanceof Error ? err.message : 'Xəta baş verdi' });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Bulk generation
      if (!bulkPrefix.trim()) {
        setErrors({ bulkPrefix: 'Prefiks qeyd edilməlidir' });
        return;
      }
      if (bulkCount < 1 || bulkCount > 1000) {
        setErrors({ bulkCount: 'Say 1 ilə 1000 arasında olmalıdır' });
        return;
      }

      setIsSubmitting(true);
      try {
        await onGenerateBulk(bulkPrefix.toUpperCase(), bulkCount, {
          promotionRuleId: formData.promotionRuleId,
          discountDescription: formData.discountDescription,
          totalUsageLimit: 1,
          perCustomerLimit: 1,
          startDate: formData.startDate,
          endDate: formData.endDate,
          targetBranchIds: formData.targetBranchIds,
          targetSegmentIds: formData.targetSegmentIds,
        });
        onClose();
      } catch (err: unknown) {
        setErrors({ form: err instanceof Error ? err.message : 'Xəta baş verdi' });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Promokod Yarat / Kütləvi Generasiya"
      description="Tək fərdi promokod və ya unikal kütləvi kupon seriyası hazırlayın."
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Hazırlanır...' : mode === 'single' ? 'Promokodu Yarat' : 'Kütləvi Generasiya Et'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {errors.form && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errors.form}
          </div>
        )}

        {/* Mode Selector */}
        <div className="flex rounded-md border border-border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
              mode === 'single' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Hash className="h-3.5 w-3.5" />
            Tək Promokod
          </button>
          <button
            type="button"
            onClick={() => setMode('bulk')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
              mode === 'bulk' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Kütləvi Generasiya (Bulk)
          </button>
        </div>

        {mode === 'single' ? (
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Promokod Mətni *
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="Məs: NOVRUZ2026"
              className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono uppercase tracking-wider"
            />
            {errors.code && <p className="text-xs text-destructive mt-1">{errors.code}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Kupon Prefiksi *
              </label>
              <input
                type="text"
                value={bulkPrefix}
                onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())}
                placeholder="Məs: BH2026"
                className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono uppercase"
              />
              {errors.bulkPrefix && (
                <p className="text-xs text-destructive mt-1">{errors.bulkPrefix}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Generasiya Sayı *
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={bulkCount}
                onChange={(e) => setBulkCount(parseInt(e.target.value) || 1)}
                className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
              />
              {errors.bulkCount && (
                <p className="text-xs text-destructive mt-1">{errors.bulkCount}</p>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            Əlaqəli Endirim Qaydası *
          </label>
          <select
            value={formData.promotionRuleId}
            onChange={(e) => setFormData({ ...formData, promotionRuleId: e.target.value })}
            className="w-full text-sm rounded-md border border-input bg-background p-2"
          >
            {promotionRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (Prioritet #{r.priorityRank})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            Endirimin Təsviri (Müştəriyə görünən) *
          </label>
          <input
            type="text"
            value={formData.discountDescription}
            onChange={(e) => setFormData({ ...formData, discountDescription: e.target.value })}
            className="w-full text-sm rounded-md border border-input bg-background p-2"
          />
        </div>

        {mode === 'single' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Ümumi İstifadə Limiti *
              </label>
              <input
                type="number"
                min="1"
                value={formData.totalUsageLimit}
                onChange={(e) =>
                  setFormData({ ...formData, totalUsageLimit: parseInt(e.target.value) || 1 })
                }
                className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Müştəri Başına Limit *
              </label>
              <input
                type="number"
                min="1"
                value={formData.perCustomerLimit}
                onChange={(e) =>
                  setFormData({ ...formData, perCustomerLimit: parseInt(e.target.value) || 1 })
                }
                className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Etibarlılıq Başlanğıcı
            </label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Etibarlılıq Sonu
            </label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

