import React, { useState, useMemo } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { customerQuickCreateSchema, CustomerQuickCreateFormData } from '../schemas/crmSchemas';
import { Customer } from '../types';
import { findPotentialDuplicates } from '../utils/segmentEvaluator';
import { AlertTriangle, UserCheck, ShieldCheck, Info } from 'lucide-react';

interface CustomerQuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCustomers: Customer[];
  onSubmit: (data: Partial<Customer>) => Promise<void>;
}

export const CustomerQuickCreateModal: React.FC<CustomerQuickCreateModalProps> = ({
  isOpen,
  onClose,
  existingCustomers,
  onSubmit,
}) => {
  const [formData, setFormData] = useState<CustomerQuickCreateFormData>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    birthDate: '',
    primaryBranchId: 'branch-1',
    smsMarketing: true,
    emailMarketing: false,
    whatsappMarketing: true,
    dataProcessing: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live duplicate detection
  const potentialDuplicates = useMemo(() => {
    if (!formData.phone || formData.phone.length < 5) return [];
    return findPotentialDuplicates({ phone: formData.phone, email: formData.email }, existingCustomers);
  }, [formData.phone, formData.email, existingCustomers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parse = customerQuickCreateSchema.safeParse(formData);
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
      const now = new Date().toISOString();
      await onSubmit({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        email: formData.email?.trim() || undefined,
        birthDate: formData.birthDate || undefined,
        primaryBranchId: formData.primaryBranchId,
        consent: {
          smsMarketing: formData.smsMarketing,
          emailMarketing: formData.emailMarketing,
          whatsappMarketing: formData.whatsappMarketing,
          dataProcessing: formData.dataProcessing,
          consentUpdatedAt: now,
          history: [
            {
              channel: 'data_processing',
              granted: formData.dataProcessing,
              timestamp: now,
              source: 'pos_quick_create',
            },
            {
              channel: 'sms',
              granted: formData.smsMarketing,
              timestamp: now,
              source: 'pos_quick_create',
            },
            {
              channel: 'whatsapp',
              granted: formData.whatsappMarketing,
              timestamp: now,
              source: 'pos_quick_create',
            },
            {
              channel: 'email',
              granted: formData.emailMarketing,
              timestamp: now,
              source: 'pos_quick_create',
            },
          ],
        },
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta baş verdi';
      setErrors({ form: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sürətli Müştəri Qeydiyyatı"
      description="Yalnız zəruri minimal məlumatlar və fərdi razılıqlar toplanır."
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            <UserCheck className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'Qeyd olunur...' : 'Müştərini Əlavə Et'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {errors.form && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errors.form}
          </div>
        )}

        {/* Live Duplicate Warning */}
        {potentialDuplicates.length > 0 && (
          <div className="p-3 rounded-lg bg-warning/15 border border-warning/40 text-xs text-foreground space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-warning-foreground">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              Oxşar nömrəli müştəri sistemdə artıq mövcuddur!
            </div>
            <p className="text-muted-foreground text-[11px]">
              Tapılan qeyd: {potentialDuplicates[0].firstName} {potentialDuplicates[0].lastName} (
              {potentialDuplicates[0].phone}, Kod: {potentialDuplicates[0].customerCode}). Dublikat yaratmamaq üçün mövcud müştəri kartını istifadə edin.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Ad *</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="Məs: Anar"
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
            {errors.firstName && (
              <p className="text-xs text-destructive mt-1">{errors.firstName}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Soyad *</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="Məs: Qasımov"
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
            {errors.lastName && (
              <p className="text-xs text-destructive mt-1">{errors.lastName}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Telefon Nömrəsi *
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+994501234567"
              className="w-full text-sm rounded-md border border-input bg-background p-2 font-mono"
            />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Qeydiyyat Filialı
            </label>
            <select
              value={formData.primaryBranchId}
              onChange={(e) => setFormData({ ...formData, primaryBranchId: e.target.value })}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            >
              <option value="branch-1">Mall 28 Filialı</option>
              <option value="branch-2">Gənclik Mall Filialı</option>
              <option value="branch-3">Dəniz Mall Filialı</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              E-mail (İstəyə görə)
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="musteri@example.com"
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Doğum Tarixi (İstəyə görə)
            </label>
            <input
              type="date"
              value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
          </div>
        </div>

        {/* Consent Section & Purpose Text */}
        <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Məlumatların Emalı və Marketinq Razılıqları (Consent)
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.dataProcessing}
                onChange={(e) => setFormData({ ...formData, dataProcessing: e.target.checked })}
                className="mt-0.5 rounded"
              />
              <span className="text-foreground">
                <span className="font-semibold text-primary">*</span> Fərdi məlumatların qorunması qaydalarına uyğun olaraq loyallıq xidmətləri üçün emalına razılıq verirəm.
              </span>
            </label>
            {errors.dataProcessing && (
              <p className="text-xs text-destructive pl-5">{errors.dataProcessing}</p>
            )}

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.smsMarketing}
                onChange={(e) => setFormData({ ...formData, smsMarketing: e.target.checked })}
                className="mt-0.5 rounded"
              />
              <span className="text-foreground">
                SMS bildirişləri və fərdi aksiya xəbərdarlıqları almağa razıyam.
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.whatsappMarketing}
                onChange={(e) => setFormData({ ...formData, whatsappMarketing: e.target.checked })}
                className="mt-0.5 rounded"
              />
              <span className="text-foreground">
                WhatsApp Business vasitəsilə endirim və kassa çekləri almağa razıyam.
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.emailMarketing}
                onChange={(e) => setFormData({ ...formData, emailMarketing: e.target.checked })}
                className="mt-0.5 rounded"
              />
              <span className="text-foreground">
                E-mail bülleteni və mövsümi kolleksiya kataloqlarına abunə oluram.
              </span>
            </label>
          </div>

          <div className="pt-2 border-t border-border/60 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
            <span>
              Məqsəd: Məlumatlar yalnız Brand House loyallıq bonusları və alış tarixçəsinin idarə edilməsi məqsədilə toplanır. Qanunsuz üçüncü tərəflərə ötürülmür.
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
};

