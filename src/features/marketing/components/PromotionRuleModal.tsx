import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { PromotionRule, PromotionRuleType } from '../types';
import { promotionRuleSchema, PromotionRuleFormData } from '../schemas/marketingSchemas';
import { aznToQapik } from '../../../shared/utils/money';
import { AlertTriangle } from 'lucide-react';

interface PromotionRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (ruleData: Partial<PromotionRule>) => Promise<void>;
  initialData?: PromotionRule;
}

export const PromotionRuleModal: React.FC<PromotionRuleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<PromotionRuleFormData>({
    name: initialData?.name || '',
    ruleType: initialData?.ruleType || 'percentage',
    priorityRank: initialData?.priorityRank || 1,
    canStack: initialData?.canStack ?? false,
    isExclusive: initialData?.isExclusive ?? false,
    startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
    endDate:
      initialData?.endDate ||
      new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().split('T')[0],
    targetBranchIds: initialData?.targetBranchIds || ['*'],
    minCartAmountAzn: initialData?.minCartAmountQapik ? initialData.minCartAmountQapik / 100 : 0,
    maxDiscountAmountAzn: initialData?.maxDiscountAmountQapik
      ? initialData.maxDiscountAmountQapik / 100
      : undefined,
    discountPercent: initialData?.discountPercent || 20,
    discountAmountAzn: initialData?.discountAmountQapik ? initialData.discountAmountQapik / 100 : 15,
    bogoBuyQty: initialData?.bogoBuyQty || 1,
    bogoGetQty: initialData?.bogoGetQty || 1,
    bogoDiscountPercent: initialData?.bogoDiscountPercent || 50,
    eligibleProductIds: initialData?.eligibleProductIds || [],
    eligibleCategoryIds: initialData?.eligibleCategoryIds || [],
    eligibleBrandIds: initialData?.eligibleBrandIds || [],
    excludedProductIds: initialData?.excludedProductIds || [],
    description: initialData?.description || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parse = promotionRuleSchema.safeParse(formData);
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
      await onSubmit({
        name: formData.name,
        ruleType: formData.ruleType as PromotionRuleType,
        priorityRank: formData.priorityRank,
        canStack: formData.canStack,
        isExclusive: formData.isExclusive,
        startDate: formData.startDate,
        endDate: formData.endDate,
        targetBranchIds: formData.targetBranchIds,
        minCartAmountQapik: formData.minCartAmountAzn ? aznToQapik(formData.minCartAmountAzn) : undefined,
        maxDiscountAmountQapik: formData.maxDiscountAmountAzn
          ? aznToQapik(formData.maxDiscountAmountAzn)
          : undefined,
        discountPercent: formData.discountPercent,
        discountAmountQapik: formData.discountAmountAzn
          ? aznToQapik(formData.discountAmountAzn)
          : undefined,
        bogoBuyQty: formData.bogoBuyQty,
        bogoGetQty: formData.bogoGetQty,
        bogoDiscountPercent: formData.bogoDiscountPercent,
        eligibleProductIds: formData.eligibleProductIds,
        eligibleCategoryIds: formData.eligibleCategoryIds,
        eligibleBrandIds: formData.eligibleBrandIds,
        excludedProductIds: formData.excludedProductIds,
        description: formData.description,
        isActive: true,
      });
      onClose();
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : 'Xəta baş verdi' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Endirim Qaydasına Düzəliş' : 'Yeni Endirim Qaydası'}
      description="POS və onlayn satış üçün dinamik qiymət və aksiya qaydası təyini."
      maxWidth="lg"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saxlanılır...' : 'Yadda Saxla'}
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

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Qaydanın Adı *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Məs: 2-ci məhsula 50% BOGO endirimi"
            className="w-full text-sm rounded-md border border-input bg-background p-2"
          />
          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Qayda Növü *</label>
            <select
              value={formData.ruleType}
              onChange={(e) =>
                setFormData({ ...formData, ruleType: e.target.value as PromotionRuleType })
              }
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            >
              <option value="percentage">Faiz Endirimi (%)</option>
              <option value="fixed_amount">Sabit Məbləğ Endirimi (AZN)</option>
              <option value="bogo">BOGO (Birini Al, 2-ciyə Güzəşt)</option>
              <option value="quantity_tier">Miqdar Pillələri (Həcmə görə)</option>
              <option value="bundle">Dəst / Paket Qiyməti (Bundle)</option>
              <option value="loyalty_discount">Loyallıq Dərəcəsi Endirimi</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Prioritet Dərəcəsi (1 = Ən Yüksək) *
            </label>
            <input
              type="number"
              min="1"
              value={formData.priorityRank}
              onChange={(e) =>
                setFormData({ ...formData, priorityRank: parseInt(e.target.value) || 1 })
              }
              className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
            />
            {errors.priorityRank && (
              <p className="text-xs text-destructive mt-1">{errors.priorityRank}</p>
            )}
          </div>
        </div>

        {/* Dynamic fields based on type */}
        {formData.ruleType === 'percentage' && (
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Endirim Faizi (%) *
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={formData.discountPercent || ''}
              onChange={(e) =>
                setFormData({ ...formData, discountPercent: parseFloat(e.target.value) || 0 })
              }
              className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
            />
          </div>
        )}

        {formData.ruleType === 'fixed_amount' && (
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Endirim Məbləği (AZN) *
            </label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={formData.discountAmountAzn || ''}
              onChange={(e) =>
                setFormData({ ...formData, discountAmountAzn: parseFloat(e.target.value) || 0 })
              }
              className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
            />
          </div>
        )}

        {formData.ruleType === 'bogo' && (
          <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-lg">
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">Alış Sayı (X)</label>
              <input
                type="number"
                min="1"
                value={formData.bogoBuyQty || 1}
                onChange={(e) =>
                  setFormData({ ...formData, bogoBuyQty: parseInt(e.target.value) || 1 })
                }
                className="w-full text-xs rounded border border-input bg-background p-1.5 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                Güzəştli Say (Y)
              </label>
              <input
                type="number"
                min="1"
                value={formData.bogoGetQty || 1}
                onChange={(e) =>
                  setFormData({ ...formData, bogoGetQty: parseInt(e.target.value) || 1 })
                }
                className="w-full text-xs rounded border border-input bg-background p-1.5 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                Güzəşt Faizi (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.bogoDiscountPercent || 50}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bogoDiscountPercent: parseFloat(e.target.value) || 50,
                  })
                }
                className="w-full text-xs rounded border border-input bg-background p-1.5 font-mono"
              />
            </div>
          </div>
        )}

        {/* Stacking and Exclusivity */}
        <div className="p-3 bg-muted/30 rounded-lg space-y-2 border border-border">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={formData.canStack}
              onChange={(e) => setFormData({ ...formData, canStack: e.target.checked })}
              className="rounded"
            />
            <span className="font-medium text-foreground">
              Digər aksiyalarla üst-üstə tətbiqə icazə ver (Stackable)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={formData.isExclusive}
              onChange={(e) => setFormData({ ...formData, isExclusive: e.target.checked })}
              className="rounded"
            />
            <span className="font-medium text-foreground text-destructive">
              Eksklüziv qayda (Tətbiq edildikdə digər bütün endirimləri dayandırır)
            </span>
          </label>
        </div>

        {/* Date Limits and Minimum Spend */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Başlanğıc Tarixi
            </label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Bitmə Tarixi</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Min. Səbət Məbləği (AZN)
            </label>
            <input
              type="number"
              min="0"
              value={formData.minCartAmountAzn || 0}
              onChange={(e) =>
                setFormData({ ...formData, minCartAmountAzn: parseFloat(e.target.value) || 0 })
              }
              className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Maks. Endirim Limiti (AZN)
            </label>
            <input
              type="number"
              min="0"
              placeholder="Limitsiz"
              value={formData.maxDiscountAmountAzn || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxDiscountAmountAzn: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
              className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};
