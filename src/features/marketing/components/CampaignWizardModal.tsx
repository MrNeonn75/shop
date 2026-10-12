import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { campaignSchema, CampaignFormData } from '../schemas/marketingSchemas';
import { Campaign, CampaignObjective, CampaignType } from '../types';
import { aznToQapik } from '../../../shared/utils/money';
import { AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';

interface CampaignWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (campaignData: Partial<Campaign>) => Promise<void>;
  initialData?: Campaign;
}

export const CampaignWizardModal: React.FC<CampaignWizardModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<CampaignFormData>({
    name: initialData?.name || '',
    objective: initialData?.objective || 'sales_volume',
    type: initialData?.type || 'seasonal',
    startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
    endDate: initialData?.endDate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    budgetAzn: initialData ? initialData.budgetQapik / 100 : 5000,
    targetBranchIds: initialData?.targetBranchIds || ['*'],
    targetSegmentIds: initialData?.targetSegmentIds || ['*'],
    eligibleBrandIds: initialData?.eligibleBrandIds || [],
    eligibleCategoryIds: initialData?.eligibleCategoryIds || [],
    eligibleProductIds: initialData?.eligibleProductIds || [],
    excludedProductIds: initialData?.excludedProductIds || [],
    description: initialData?.description || '',
  });


  const handleNext = () => {
    if (step === 1) {
      if (!formData.name.trim()) {
        setErrors({ name: 'Kampaniyanın adı daxil edilməlidir' });
        return;
      }
      setErrors({});
      setStep(2);
    } else if (step === 2) {
      if (new Date(formData.startDate) > new Date(formData.endDate)) {
        setErrors({ endDate: 'Başlanğıc tarixi bitmə tarixindən sonra ola bilməz' });
        return;
      }
      if (formData.budgetAzn < 0) {
        setErrors({ budgetAzn: 'Büdcə mənfi ola bilməz' });
        return;
      }
      setErrors({});
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handlePrev = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    const parse = campaignSchema.safeParse(formData);
    if (!parse.success) {
      const errs: Record<string, string> = {};
      parse.error.issues.forEach((issue) => {
        errs[issue.path[0] as string] = issue.message;
      });
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: formData.name,
        objective: formData.objective as CampaignObjective,
        type: formData.type as CampaignType,
        startDate: formData.startDate,
        endDate: formData.endDate,
        budgetQapik: aznToQapik(formData.budgetAzn),
        targetBranchIds: formData.targetBranchIds,
        targetSegmentIds: formData.targetSegmentIds,
        eligibleBrandIds: formData.eligibleBrandIds,
        eligibleCategoryIds: formData.eligibleCategoryIds,
        eligibleProductIds: formData.eligibleProductIds,
        excludedProductIds: formData.excludedProductIds,
        description: formData.description,
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
      title={
        <div className="flex items-center gap-2">
          <span>{initialData ? 'Kampaniyaya Düzəliş Et' : 'Yeni Marketinq Kampaniyası'}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-normal">
            Addım {step} / 4
          </span>
        </div>
      }
      description="Brend və filiallar üzrə marketinq kampaniyasının planlaşdırılması və təsdiqə göndərilməsi."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={handlePrev} disabled={isSubmitting}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Geri
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
              Ləğv et
            </Button>
            {step < 4 ? (
              <Button size="sm" onClick={handleNext}>
                İrəli
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Saxlanılır...' : 'Təsdiqə Göndər'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {errors.form && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errors.form}
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Kampaniyanın Adı *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Məs: Yaz-Yay 2026 Kolleksiya Açılışı"
                className="w-full text-sm rounded-md border border-input bg-background p-2"
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Kampaniya Məqsədi
                </label>
                <select
                  value={formData.objective}
                  onChange={(e) =>
                    setFormData({ ...formData, objective: e.target.value as CampaignObjective })
                  }
                  className="w-full text-sm rounded-md border border-input bg-background p-2"
                >
                  <option value="sales_volume">Satış Həcminin Artırılması</option>
                  <option value="new_collection">Yeni Kolleksiya Təqdimatı</option>
                  <option value="clearance">Mövsüm Sonu Likvidasiya</option>
                  <option value="brand_awareness">Brend Tanınması</option>
                  <option value="traffic">Mağaza Ziyarətçilərinin Artırılması</option>
                  <option value="loyalty_engagement">Loyallıq Cəlb Edilməsi</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Kampaniya Növü
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as CampaignType })}
                  className="w-full text-sm rounded-md border border-input bg-background p-2"
                >
                  <option value="seasonal">Mövsümi Aksiya</option>
                  <option value="brand">Brend Üzrə Aksiya</option>
                  <option value="category">Kateqoriya Üzrə Aksiya</option>
                  <option value="promo_code">Promokod Kampaniyası</option>
                  <option value="branch_specific">Xüsusi Filial Aksiyası</option>
                  <option value="loyalty">Loyallıq Təklifi</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Təsvir və Qeydlər
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Kampaniyanın hədəfləri, marketinq kanalları və xüsusi şərtləri..."
                className="w-full text-sm rounded-md border border-input bg-background p-2"
              />
            </div>
          </div>
        )}

        {/* Step 2: Dates and Budget */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Başlanğıc Tarixi *
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full text-sm rounded-md border border-input bg-background p-2"
                />
                {errors.startDate && (
                  <p className="text-xs text-destructive mt-1">{errors.startDate}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Bitmə Tarixi *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full text-sm rounded-md border border-input bg-background p-2"
                />
                {errors.endDate && (
                  <p className="text-xs text-destructive mt-1">{errors.endDate}</p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Kampaniya Büdcəsi (AZN) *
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={formData.budgetAzn}
                onChange={(e) =>
                  setFormData({ ...formData, budgetAzn: parseFloat(e.target.value) || 0 })
                }
                className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Marketinq xərcləri (reklam, çap, SMS təminatı və bannerlər) üçün ayrılan limit.
              </p>
              {errors.budgetAzn && (
                <p className="text-xs text-destructive mt-1">{errors.budgetAzn}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Target Branches and Segments */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-2">
                Hədəf Filiallar
              </label>
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="branchScope"
                    checked={formData.targetBranchIds.includes('*')}
                    onChange={() => setFormData({ ...formData, targetBranchIds: ['*'] })}
                  />
                  <span>Bütün filiallar (Şəbəkə üzrə ümumi)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="branchScope"
                    checked={!formData.targetBranchIds.includes('*')}
                    onChange={() =>
                      setFormData({ ...formData, targetBranchIds: ['branch-1', 'branch-2'] })
                    }
                  />
                  <span>Yalnız seçilmiş filiallar</span>
                </label>
              </div>

              {!formData.targetBranchIds.includes('*') && (
                <div className="mt-3 pl-4 border-l-2 border-primary/30 space-y-1.5 text-xs">
                  {['branch-1', 'branch-2', 'branch-3'].map((bId) => {
                    const names: Record<string, string> = {
                      'branch-1': 'Mall 28 Filialı',
                      'branch-2': 'Gənclik Mall Filialı',
                      'branch-3': 'Dəniz Mall Filialı',
                    };
                    const isChecked = formData.targetBranchIds.includes(bId);
                    return (
                      <label key={bId} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                targetBranchIds: [...formData.targetBranchIds, bId],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                targetBranchIds: formData.targetBranchIds.filter(
                                  (id) => id !== bId
                                ),
                              });
                            }
                          }}
                        />
                        <span>{names[bId]}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-2">
                Hədəf Müştəri Seqmentləri
              </label>
              <select
                value={formData.targetSegmentIds[0] || '*'}
                onChange={(e) =>
                  setFormData({ ...formData, targetSegmentIds: [e.target.value] })
                }
                className="w-full text-sm rounded-md border border-input bg-background p-2"
              >
                <option value="*">Bütün Müştərilər</option>
                <option value="seg-1">Aktiv Alıcılar (Son 90 gün)</option>
                <option value="seg-2">SMS Razılığı Olanlar</option>
                <option value="seg-3">VIP Loyallıq (Qızıl & Platin)</option>
              </select>
            </div>
          </div>
        )}

        {/* Step 4: Product Eligibility & Review */}
        {step === 4 && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-muted/40 rounded-lg space-y-2">
              <h5 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Kampaniyanın Yekun Xülasəsi
              </h5>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                <div>
                  <span className="font-medium text-foreground">Ad:</span> {formData.name}
                </div>
                <div>
                  <span className="font-medium text-foreground">Büdcə:</span> {formData.budgetAzn.toFixed(2)} ₼
                </div>
                <div>
                  <span className="font-medium text-foreground">Tarix:</span> {formData.startDate} — {formData.endDate}
                </div>
                <div>
                  <span className="font-medium text-foreground">Filiallar:</span>{' '}
                  {formData.targetBranchIds.includes('*') ? 'Bütün filiallar' : `${formData.targetBranchIds.length} filial`}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                İstisna Edilən SKU / Məhsullar (İstəyə görə)
              </label>
              <input
                type="text"
                placeholder="Vergüllə ayrılmış SKU kodları (Məs: SKU-001, SKU-002)"
                value={formData.excludedProductIds.join(', ')}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    excludedProductIds: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full text-xs rounded-md border border-input bg-background p-2"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Aksiyaya daxil edilməyən xüsusi kolleksiya və ya premium məhsullar.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              * Təsdiqə göndərildikdən sonra kampaniya rəhbərlik tərəfindən nəzərdən keçiriləcək və statusu 'Pending Approval' olacaq.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
