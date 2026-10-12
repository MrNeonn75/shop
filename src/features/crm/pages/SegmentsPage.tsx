import React, { useState, useEffect, useMemo } from 'react';
import { crmRepository } from '../../../shared/adapters';
import { CustomerSegment, Customer, CustomerTier } from '../types';
import { matchesSegmentRules } from '../utils/segmentEvaluator';
import { aznToQapik, formatMoney } from '../../../shared/utils/formatters';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  Users2,
  Plus,
  Download,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

export const SegmentsPage: React.FC = () => {
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | null>(null);

  // Form states for builder modal
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minSpendAzn, setMinSpendAzn] = useState<string>('');
  const [minOrders, setMinOrders] = useState<string>('');
  const [lastVisitDays, setLastVisitDays] = useState<string>('');
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [consentChannel, setConsentChannel] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [segList, custList] = await Promise.all([
        crmRepository.getCustomerSegments(),
        crmRepository.getCustomers(),
      ]);
      setSegments(segList);
      setAllCustomers(custList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Live matching count preview inside modal
  const liveMatchedCount = useMemo(() => {
    const rules: CustomerSegment['rules'] = {
      minSpendQapik: minSpendAzn ? aznToQapik(parseFloat(minSpendAzn)) : undefined,
      minOrdersCount: minOrders ? parseInt(minOrders) : undefined,
      lastVisitWithinDays: lastVisitDays ? parseInt(lastVisitDays) : undefined,
      tiers: selectedTiers.length > 0 ? (selectedTiers as CustomerTier[]) : undefined,
      requiredConsentChannel: consentChannel ? (consentChannel as 'sms' | 'email' | 'whatsapp') : undefined,
    };

    return allCustomers.filter((c) => matchesSegmentRules(c, rules)).length;
  }, [allCustomers, minSpendAzn, minOrders, lastVisitDays, selectedTiers, consentChannel]);

  const handleOpenCreateModal = () => {
    setSelectedSegment(null);
    setName('');
    setDescription('');
    setMinSpendAzn('');
    setMinOrders('');
    setLastVisitDays('');
    setSelectedTiers([]);
    setConsentChannel('');
    setError(null);
    setIsModalOpen(true);
  };

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Seqmentin adı qeyd edilməlidir');
      return;
    }

    setIsSubmitting(true);
    try {
      const rules: CustomerSegment['rules'] = {
        minSpendQapik: minSpendAzn ? aznToQapik(parseFloat(minSpendAzn)) : undefined,
        minOrdersCount: minOrders ? parseInt(minOrders) : undefined,
        lastVisitWithinDays: lastVisitDays ? parseInt(lastVisitDays) : undefined,
        tiers: selectedTiers.length > 0 ? (selectedTiers as CustomerTier[]) : undefined,
        requiredConsentChannel: consentChannel ? (consentChannel as 'sms' | 'email' | 'whatsapp') : undefined,
      };

      if (selectedSegment) {
        await crmRepository.updateCustomerSegment(selectedSegment.id, {
          name,
          description,
          rules,
          matchedCount: liveMatchedCount,
        });
      } else {
        await crmRepository.createCustomerSegment({
          name,
          description,
          rules,
          isDynamic: true,
          matchedCount: liveMatchedCount,
        });
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta baş verdi';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportSegment = (seg: CustomerSegment) => {
    const matching = allCustomers.filter((c) => matchesSegmentRules(c, seg.rules));
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'ID,Kod,Ad,Soyad,Telefon,Dərəcə,Balans\n' +
      matching
        .map(
          (c) =>
            `${c.id},${c.customerCode},${c.firstName},${c.lastName},${c.phone},${c.tier},${c.pointsBalance}`
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `segment_${seg.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Users2 className="h-7 w-7 text-primary" />
            Müştəri Seqmentasiyası (Auditoriya Qrupları)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dinamik qaydalar əsasında müştəri qruplarının formalaşdırılması və hədəfli təkliflər.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleOpenCreateModal}>
            <Plus className="h-4 w-4 mr-1.5" />
            Yeni Seqment Qur
          </Button>
        </div>
      </div>

      {/* Segments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-3 text-center p-8 text-sm text-muted-foreground">
            Seqmentlər yüklənir...
          </div>
        ) : (
          segments.map((seg) => {
            const currentMatch = allCustomers.filter((c) => matchesSegmentRules(c, seg.rules)).length;
            return (
              <Card key={seg.id} className="p-5 space-y-4 border border-border flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base text-foreground">{seg.name}</h3>
                    <Badge variant={seg.isDynamic ? 'default' : 'neutral'} className="text-[10px]">
                      {seg.isDynamic ? 'Dinamik' : 'Statik'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{seg.description}</p>
                </div>

                {/* Rules preview */}
                <div className="p-3 rounded-lg bg-muted/40 space-y-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground text-[11px] block">Qayda Şərtləri:</span>
                  {seg.rules.minSpendQapik && (
                    <div>• Min. Xərcləmə: {formatMoney(seg.rules.minSpendQapik)}</div>
                  )}
                  {seg.rules.minOrdersCount && (
                    <div>• Min. Sifariş: {seg.rules.minOrdersCount} alış</div>
                  )}
                  {seg.rules.lastVisitWithinDays && (
                    <div>• Son ziyarət: Son {seg.rules.lastVisitWithinDays} gündə</div>
                  )}
                  {seg.rules.tiers && seg.rules.tiers.length > 0 && (
                    <div>• Dərəcələr: {seg.rules.tiers.join(', ')}</div>
                  )}
                  {seg.rules.requiredConsentChannel && (
                    <div className="text-primary font-medium">
                      • Məcburi Razılıq: {seg.rules.requiredConsentChannel.toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Uyğun gələn: </span>
                    <span className="font-bold font-mono text-foreground text-sm">
                      {currentMatch} nəfər
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportSegment(seg)}
                    className="text-xs h-7 px-2"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    CSV İxrac
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Segment Builder Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedSegment ? 'Seqmentə Düzəliş Et' : 'Yeni Dinamik Seqment Qurucusu'}
        description="Şərtləri təyin edin; sistem uyğun gələn müştəriləri canlı hesablayacaq."
        maxWidth="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
              Ləğv et
            </Button>
            <Button size="sm" onClick={handleSaveSegment} disabled={isSubmitting}>
              {isSubmitting ? 'Saxlanılır...' : 'Seqmenti Yadda Saxla'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveSegment} className="space-y-4 py-1">
          {error && (
            <div className="p-3 text-xs bg-destructive/10 text-destructive rounded border border-destructive/20 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Seqmentin Adı *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Məs: Son 30 gündə alış edən VIP Qızıl müştərilər"
              className="w-full text-sm rounded-md border border-input bg-background p-2"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Təsvir</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Seqmentin marketinq məqsədi və hədəf xüsusiyyətləri..."
              className="w-full text-xs rounded-md border border-input bg-background p-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Min. Xərcləmə (AZN)
              </label>
              <input
                type="number"
                min="0"
                value={minSpendAzn}
                onChange={(e) => setMinSpendAzn(e.target.value)}
                placeholder="Limitsiz"
                className="w-full text-xs rounded-md border border-input bg-background p-2 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Min. Sifariş Sayı
              </label>
              <input
                type="number"
                min="0"
                value={minOrders}
                onChange={(e) => setMinOrders(e.target.value)}
                placeholder="Limitsiz"
                className="w-full text-xs rounded-md border border-input bg-background p-2 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Son Alış Gün Aralığı (Recency)
              </label>
              <input
                type="number"
                min="1"
                value={lastVisitDays}
                onChange={(e) => setLastVisitDays(e.target.value)}
                placeholder="Məs: 30 gün daxilində"
                className="w-full text-xs rounded-md border border-input bg-background p-2 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Məcburi Razılıq Kanalı (Consent)
              </label>
              <select
                value={consentChannel}
                onChange={(e) => setConsentChannel(e.target.value)}
                className="w-full text-xs rounded-md border border-input bg-background p-2"
              >
                <option value="">Fərqi yoxdur</option>
                <option value="sms">SMS Razılığı Olanlar</option>
                <option value="email">Email Razılığı Olanlar</option>
                <option value="whatsapp">WhatsApp Razılığı Olanlar</option>
              </select>
            </div>
          </div>

          {/* Live Count Preview Banner */}
          <div className="p-3.5 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Canlı Uyğunlaşma Nəticəsi:
            </span>
            <span className="font-bold font-mono text-sm text-primary">
              {liveMatchedCount} müştəri uyğundur
            </span>
          </div>
        </form>
      </Modal>
    </div>
  );
};
