import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Customer } from '../types';
import { usePermission } from '../../../shared/hooks/usePermission';
import { Download, ShieldAlert, AlertTriangle, FileText } from 'lucide-react';

interface CustomerDataExportAnonymizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  onAnonymizeRequest: (reason: string) => Promise<void>;
}

export const CustomerDataExportAnonymizeModal: React.FC<CustomerDataExportAnonymizeModalProps> = ({
  isOpen,
  onClose,
  customer,
  onAnonymizeRequest,
}) => {
  const { can } = usePermission();
  const canRequestDelete = can('crm.delete.request');

  const [activeTab, setActiveTab] = useState<'export' | 'anonymize'>('export');
  const [anonymizeReason, setAnonymizeReason] = useState(
    'Fərdi məlumatların qorunması (GDPR/AR Qanunvericiliyi) çərçivəsində müştəri müraciəti'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(customer, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `customer_${customer.customerCode}_export.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleAnonymize = async () => {
    if (!anonymizeReason.trim()) {
      setError('Anonimləşdirmə üçün əsaslandırma səbəbi qeyd olunmalıdır');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAnonymizeRequest(anonymizeReason);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta baş verdi';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Məlumat Subyekti Alətləri (Fərdi Məlumatların Qorunması)"
      description={`${customer.firstName} ${customer.lastName} (${customer.customerCode}) üzrə məlumat ixracı və hüquqi silinmə proseduru.`}
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Bağla
          </Button>
          {activeTab === 'export' ? (
            <Button size="sm" onClick={handleExportJson}>
              <Download className="h-4 w-4 mr-1.5" />
              JSON İxrac Et
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAnonymize}
              disabled={isSubmitting || !canRequestDelete}
            >
              <ShieldAlert className="h-4 w-4 mr-1.5" />
              {isSubmitting ? 'İcra olunur...' : 'Anonimləşdirməni Təsdiqlə'}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {/* Tab switch */}
        <div className="flex rounded-md border border-border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'export'
                ? 'bg-background shadow-xs text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            Məlumatların İxracı (Portability)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('anonymize')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'anonymize'
                ? 'bg-background shadow-xs text-destructive font-semibold'
                : 'text-muted-foreground'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Silinmə / Anonimləşdirmə Sorğusu
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {activeTab === 'export' ? (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-2">
              <h5 className="font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" />
                Müştərinin Tam Rəqəmsal Profili
              </h5>
              <p className="text-muted-foreground leading-relaxed">
                Müştərinin tələbi ilə onun bütün şəxsi qeydiyyat məlumatları, fərdi razılıq tarixçəsi (Consent log), loyallıq bal hərəkətləri və alış arxivinin maşınoxunan JSON formatında surətini endirə bilərsiniz.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-border bg-background space-y-1 text-muted-foreground font-mono text-[11px]">
              <div>ID: {customer.id}</div>
              <div>Kod: {customer.customerCode}</div>
              <div>Telefon: {customer.phone}</div>
              <div>Bal: {customer.pointsBalance}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            {/* Legal Retention Notice */}
            <div className="p-3.5 rounded-lg border border-warning/40 bg-warning/10 space-y-2 text-foreground">
              <div className="flex items-center gap-1.5 font-semibold text-warning-foreground">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                Azərbaycan Respublikası Qanunvericiliyi və 5 İllik Saxlama Siyasəti (Retention Policy)
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Azərbaycan Respublikası Vergi Məcəlləsi və "Mühasibat uçotu haqqında" Qanuna əsasən, həyata keçirilmiş maliyyə və kassa əməliyyatları (fiskal çeklər, qaimələr) ən azı <span className="font-bold text-foreground">5 il</span> müddətində sistemdə saxlanılmalıdır.
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Bu səbəbdən müştərinin maliyyə qeydləri silinmir, lakin şəxsi PII məlumatları (ad, soyad, telefon, email, doğum tarixi) dərhal <span className="font-bold text-foreground">anonimləşdirilir</span> və marketinq kommunikasiyası birdəfəlik dayandırılır.
              </p>
            </div>

            {!canRequestDelete ? (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
                Bu əməliyyatı icra etmək üçün 'crm.delete.request' icazəsinə malik olmalısınız.
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Anonimləşdirmə Səbəbi (Audit üçün) *
                </label>
                <textarea
                  rows={2}
                  value={anonymizeReason}
                  onChange={(e) => setAnonymizeReason(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background p-2"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
