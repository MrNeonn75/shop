import React, { useState, useEffect } from 'react';
import { marketingRepository } from '../../../shared/adapters';
import { Campaign } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';

export const MarketingApprovalsPage: React.FC = () => {
  const [pendingCampaigns, setPendingCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModalCampaign, setRejectModalCampaign] = useState<Campaign | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allCamps = await marketingRepository.getCampaigns();
      setPendingCampaigns(allCamps.filter((c) => c.status === 'pending_approval'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (campaignId: string) => {
    await marketingRepository.updateCampaignStatus(campaignId, 'approved');
    loadData();
  };

  const handleRejectConfirm = async () => {
    if (!rejectModalCampaign || !rejectReason.trim()) return;
    setIsSubmitting(true);
    try {
      await marketingRepository.updateCampaignStatus(
        rejectModalCampaign.id,
        'rejected',
        rejectReason
      );
      setRejectModalCampaign(null);
      setRejectReason('');
      loadData();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Marketinq Təsdiqləmə Mərkəzi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planlaşdırılan kampaniyaların və böyük büdcəli aksiyaların rəhbərlik tərəfindən təsdiqi və ya imtinası.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {pendingCampaigns.length} Təsdiq Gözləyən
        </Badge>
      </div>

      {/* List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Yüklənir...</div>
        ) : pendingCampaigns.length === 0 ? (
          <Card className="p-12 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h3 className="font-semibold text-foreground text-base">Təsdiq Gözləyən Sorğu Yoxdur</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Bütün marketinq kampaniyaları və aksiya təklifləri nəzərdən keçirilmişdir.
            </p>
          </Card>
        ) : (
          pendingCampaigns.map((camp) => (
            <Card key={camp.id} className="p-5 space-y-4 border border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
                <div>
                  <h3 className="font-bold text-base text-foreground">{camp.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{camp.code}</span>
                    <span>•</span>
                    <span>Müəllif: {camp.createdBy}</span>
                    <span>•</span>
                    <span>Tarix: {camp.createdAt.replace('T', ' ').slice(0, 10)}</span>
                  </div>
                </div>
                <Badge variant="warning">Təsdiq Gözləyir</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded bg-muted/40 space-y-1">
                  <span className="text-muted-foreground">Təyin Edilən Büdcə:</span>
                  <div className="text-base font-bold font-mono text-foreground">
                    {formatMoney(camp.budgetQapik)}
                  </div>
                </div>
                <div className="p-3 rounded bg-muted/40 space-y-1">
                  <span className="text-muted-foreground">Aksiya Müddəti:</span>
                  <div className="text-sm font-semibold font-mono text-foreground">
                    {camp.startDate} — {camp.endDate}
                  </div>
                </div>
                <div className="p-3 rounded bg-muted/40 space-y-1">
                  <span className="text-muted-foreground">Hədəf Əhatəsi:</span>
                  <div className="text-sm font-semibold text-foreground">
                    {camp.targetBranchIds.includes('*')
                      ? 'Bütün Filiallar'
                      : `${camp.targetBranchIds.length} filial`}
                  </div>
                </div>
              </div>

              {camp.description && (
                <p className="text-xs text-muted-foreground bg-background p-3 rounded border border-border">
                  {camp.description}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRejectModalCampaign(camp)}
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  İmtina Et
                </Button>
                <Button size="sm" onClick={() => handleApprove(camp.id)}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Kampaniyanı Təsdiqlə
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Reject Reason Modal */}
      <Modal
        isOpen={Boolean(rejectModalCampaign)}
        onClose={() => setRejectModalCampaign(null)}
        title="Kampaniyadan İmtina Səbəbi"
        description="Müraciətin rədd edilməsinin səbəbini audit qeydi kimi daxil edin."
        maxWidth="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRejectModalCampaign(null)}
              disabled={isSubmitting}
            >
              Ləğv et
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRejectConfirm}
              disabled={isSubmitting || !rejectReason.trim()}
            >
              {isSubmitting ? 'Saxlanılır...' : 'İmtinanı Təsdiqlə'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-2">
          <label className="text-xs font-medium text-foreground block">
            İmtina Əsaslandırması *
          </label>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Məs: Ayrılmış marketinq büdcəsi limiti aşıldığı üçün məbləğ azaldılmalıdır..."
            className="w-full text-xs rounded-md border border-input bg-background p-2"
          />
        </div>
      </Modal>
    </div>
  );
};
