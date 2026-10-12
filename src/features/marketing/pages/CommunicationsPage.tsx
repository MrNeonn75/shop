import React, { useState, useEffect } from 'react';
import { marketingRepository, crmRepository } from '../../../shared/adapters';
import { CommunicationTemplate, CommunicationCampaign } from '../types';
import { CustomerSegment } from '../../crm/types';
import { CommunicationCampaignModal } from '../components/CommunicationCampaignModal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  Send,
  Plus,
  MessageSquare,
  Mail,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';

export const CommunicationsPage: React.FC = () => {
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<CommunicationCampaign[]>([]);
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tpls, comms, segList] = await Promise.all([
        marketingRepository.getCommunicationTemplates(),
        marketingRepository.getCommunicationCampaigns(),
        crmRepository.getCustomerSegments(),
      ]);
      setTemplates(tpls);
      setCampaigns(comms);
      setSegments(segList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (data: Partial<CommunicationCampaign>) => {
    await marketingRepository.createCommunicationCampaign(data);
    loadData();
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'sms':
        return <Smartphone className="h-4 w-4 text-primary" />;
      case 'email':
        return <Mail className="h-4 w-4 text-info" />;
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4 text-success" />;
      default:
        return <Send className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Send className="h-7 w-7 text-primary" />
            Müştəri Bildirişləri və Kommunikasiya
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Yalnız rəsmi razılığı (Consent) olan müştərilərə ünvanlanmış SMS, E-mail və WhatsApp bildirişləri.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Yeni Bildiriş Kampaniyası
          </Button>
        </div>
      </div>

      {/* Provider Connectivity Status Card */}
      <Card className="p-4 border-warning/40 bg-warning/5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning shrink-0" />
            <h3 className="font-semibold text-sm text-foreground">
              Kommunikasiya Provayderlərinin Şəbəkə Statusu
            </h3>
          </div>
          <Badge variant="warning" className="text-xs font-semibold">
            Konfiqurasiya olunmayıb
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Azercell, Bakcell və Twilio SMS şlüzləri, eləcə də Meta WhatsApp Cloud API açarları sistemdə konfiqurasiya edilməyənə qədər faktiki göndəriş dayandırılmışdır. Mesajlar saxtalaşdırılmır və simulyasiya edilmir; sistemdə audit statusu olaraq saxlanılır.
        </p>
      </Card>

      {/* Grid: Campaigns & Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Communications Campaigns */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold text-base text-foreground flex items-center justify-between">
            <span>Planlaşdırılmış Bildiriş Kampaniyaları</span>
            <Badge variant="outline" className="text-xs">
              {campaigns.length} Kampaniya
            </Badge>
          </h3>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Kampaniya</th>
                    <th className="px-3 py-3">Kanal</th>
                    <th className="px-3 py-3 text-center">Ümumi Auditoriya</th>
                    <th className="px-3 py-3 text-center">Razılığı Olan</th>
                    <th className="px-3 py-3 text-center">İmtina (Kənarlaşdırılan)</th>
                    <th className="px-4 py-3 text-right">Provayder Statusu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Yüklənir...
                      </td>
                    </tr>
                  ) : campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Planlaşdırılmış bildiriş kampaniyası yoxdur.
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((comm) => (
                    <tr key={comm.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold text-foreground text-xs">
                        {comm.title}
                      </td>
                      <td className="px-3 py-3 text-xs capitalize">
                        <span className="flex items-center gap-1.5 font-medium">
                          {getChannelIcon(comm.channel)}
                          {comm.channel.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-xs text-muted-foreground">
                        {comm.audienceTotalCount}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-xs font-semibold text-success">
                        {comm.consentingCount}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-xs text-destructive">
                        {comm.optedOutCount}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="warning" className="text-[10px]">
                          Konfiqurasiya olunmayıb
                        </Badge>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Col: Message Templates */}
        <div className="space-y-4">
          <h3 className="font-semibold text-base text-foreground flex items-center justify-between">
            <span>Mesaj Şablonları</span>
            <Badge variant="outline" className="text-xs">
              {templates.length}
            </Badge>
          </h3>

          <div className="space-y-3">
            {templates.map((tpl) => (
              <Card key={tpl.id} className="p-3.5 space-y-2 text-xs border border-border">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {getChannelIcon(tpl.channel)}
                    {tpl.name}
                  </span>
                  <Badge variant="outline" className="uppercase text-[10px]">
                    {tpl.category}
                  </Badge>
                </div>
                {tpl.subject && (
                  <div className="text-[11px] text-muted-foreground font-medium">
                    Mövzu: {tpl.subject}
                  </div>
                )}
                <p className="p-2 rounded bg-muted/40 font-mono text-[11px] text-foreground leading-relaxed">
                  {tpl.body}
                </p>
                <div className="text-[10px] text-muted-foreground">
                  Dəyişənlər: <span className="font-mono text-primary">&#123;&#123;customer_name&#125;&#125;</span>,{' '}
                  <span className="font-mono text-primary">&#123;&#123;points&#125;&#125;</span>,{' '}
                  <span className="font-mono text-primary">&#123;&#123;promo_code&#125;&#125;</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <CommunicationCampaignModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        templates={templates}
        segments={segments}
        onCreate={handleCreate}
      />
    </div>
  );
};
