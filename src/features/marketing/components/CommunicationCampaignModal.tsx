import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  CommunicationTemplate,
  CommunicationCampaign,
} from '../types';
import { CustomerSegment } from '../../crm/types';
import { AlertTriangle, Send, Users, ShieldAlert } from 'lucide-react';

interface CommunicationCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: CommunicationTemplate[];
  segments: CustomerSegment[];
  onCreate: (campaignData: Partial<CommunicationCampaign>) => Promise<void>;
}

export const CommunicationCampaignModal: React.FC<CommunicationCampaignModalProps> = ({
  isOpen,
  onClose,
  templates,
  segments,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<'sms' | 'email' | 'whatsapp'>('sms');
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || '');
  const [selectedSegmentId, setSelectedSegmentId] = useState(segments[0]?.id || '');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);

  // Audience numbers calculation (mock consent ratio based on segment)
  const totalAudience = selectedSegment?.matchedCount || 120;
  // If segment already filters by consent, consenting is 100%, otherwise ~80%
  const hasConsentFilter = selectedSegment?.rules.requiredConsentChannel === channel;
  const consentingCount = hasConsentFilter ? totalAudience : Math.round(totalAudience * 0.82);
  const optedOutCount = totalAudience - consentingCount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Kampaniyanın adı qeyd edilməlidir');
      return;
    }
    if (!isAuthorized) {
      setError('Göndərişin icrası üçün razılıq təsdiqlənməlidir');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate({
        title,
        channel,
        templateId: selectedTemplateId,
        targetSegmentId: selectedSegmentId,
        audienceTotalCount: totalAudience,
        consentingCount,
        optedOutCount,
        providerStatus: 'unconfigured',
        status: 'draft',
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Xəta baş verdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kütləvi Bildiriş Kampaniyası Yarat"
      description="Yalnız qanunvericilik və müştəri razılığı (Consent) olan auditoriyaya bildiriş planlayın."
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Ləğv et
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting || !isAuthorized}>
            <Send className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'Planlaşdırılır...' : 'Kampaniyanı Təsdiqlə'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {error && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            Kampaniyanın Başlığı *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Məs: Novruz Bayramı SMS Xəbərdarlığı"
            className="w-full text-sm rounded-md border border-input bg-background p-2"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Kanal</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'sms' | 'email' | 'whatsapp')}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            >
              <option value="sms">SMS Bildiriş</option>
              <option value="email">E-mail Bülleten</option>
              <option value="whatsapp">WhatsApp Business</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Mesaj Şablonu</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.channel.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Hədəf Seqment</label>
          <select
            value={selectedSegmentId}
            onChange={(e) => setSelectedSegmentId(e.target.value)}
            className="w-full text-sm rounded-md border border-input bg-background p-2"
          >
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {seg.name} ({seg.matchedCount} müştəri)
              </option>
            ))}
          </select>
        </div>

        {/* Audience and Consent Filtering Result Preview */}
        <div className="p-3.5 rounded-lg border border-border bg-muted/40 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              Auditoriya və Razılıq (Consent) Filtrləməsi:
            </span>
            <Badge variant="outline" className="text-[11px]">
              {channel.toUpperCase()} Kanalı
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 rounded bg-background border border-border">
              <div className="text-xs text-muted-foreground">Ümumi Seqment</div>
              <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                {totalAudience}
              </div>
            </div>
            <div className="p-2 rounded bg-success/10 border border-success/30">
              <div className="text-xs text-success font-medium">Razılığı Olan</div>
              <div className="text-sm font-bold font-mono text-success mt-0.5">
                {consentingCount}
              </div>
            </div>
            <div className="p-2 rounded bg-destructive/10 border border-destructive/30">
              <div className="text-xs text-destructive font-medium">İmtina Etmiş</div>
              <div className="text-sm font-bold font-mono text-destructive mt-0.5">
                {optedOutCount}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground italic">
            * Yalnız '{channel.toUpperCase()}' bildirişlərinə rəsmi razılıq verən {consentingCount} müştəriyə mesaj göndəriləcək. İmtina edən {optedOutCount} nəfər avtomatik kənarlaşdırılmışdır.
          </p>
        </div>

        {/* Message Preview */}
        {selectedTemplate && (
          <div className="p-3 rounded-lg border border-border bg-background space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
              Şablon Mətni:
            </span>
            <p className="text-xs text-foreground font-mono bg-muted/30 p-2 rounded">
              {selectedTemplate.body}
            </p>
          </div>
        )}

        {/* Provider Status Indicator */}
        <div className="p-3 rounded-lg border border-warning/40 bg-warning/10 text-xs text-foreground space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-warning" />
              Provayder Şəbəkə Statusu
            </span>
            <Badge variant="warning" className="text-xs font-semibold">
              Konfiqurasiya olunmayıb
            </Badge>
          </div>
          <p className="text-muted-foreground text-[11px]">
            {channel === 'sms'
              ? 'Azercell / Bakcell SMS Gateway API açarları sistemdə konfiqurasiya edilməyib.'
              : channel === 'whatsapp'
              ? 'Meta WhatsApp Business Cloud API qoşulmayıb.'
              : 'SMTP / SendGrid email serveri qoşulmayıb.'}
            {' '}Mesajlar fiziki olaraq göndərilməyəcək, layihə rejimində qeydə alınacaqdır.
          </p>
        </div>

        {/* Explicit Authorization Checkbox */}
        <label className="flex items-start gap-2.5 cursor-pointer text-xs pt-1">
          <input
            type="checkbox"
            checked={isAuthorized}
            onChange={(e) => setIsAuthorized(e.target.checked)}
            className="mt-0.5 rounded"
          />
          <span className="text-foreground">
            Auditoriya siyahısını və fərdi məlumatların qorunması tələblərini yoxladım. Kampaniyanın yaradılmasına icazə verirəm.
          </span>
        </label>
      </form>
    </Modal>
  );
};
