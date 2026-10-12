import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { marketingRepository, branchRepository } from '../../../shared/adapters';
import { Campaign, CampaignStatus } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { CampaignWizardModal } from '../components/CampaignWizardModal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  Megaphone,
  Plus,
  Search,
  BarChart3,
  Play,
  Pause,
  Send,
} from 'lucide-react';

export const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedCampaignForEdit, setSelectedCampaignForEdit] = useState<Campaign | undefined>(undefined);

  const loadData = async () => {
    setLoading(true);
    try {
      const [camps, branchList] = await Promise.all([
        marketingRepository.getCampaigns({ status: statusFilter, branchId: branchFilter }),
        branchRepository.getBranches(),
      ]);
      setCampaigns(camps);
      setBranches(branchList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, branchFilter]);

  const handleCreateOrUpdate = async (data: Partial<Campaign>) => {
    if (selectedCampaignForEdit) {
      await marketingRepository.updateCampaign(selectedCampaignForEdit.id, data);
    } else {
      await marketingRepository.createCampaign(data);
    }
    loadData();
  };

  const handleStatusChange = async (id: string, newStatus: CampaignStatus) => {
    await marketingRepository.updateCampaignStatus(id, newStatus);
    loadData();
  };

  // Filter by search query
  const filteredCampaigns = campaigns.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  // KPI calculations
  const activeCount = campaigns.filter((c) => c.status === 'active').length;
  const totalBudgetCents = campaigns.reduce((sum, c) => sum + c.budgetQapik, 0);
  const totalSpentCents = campaigns.reduce((sum, c) => sum + c.spentQapik, 0);
  const totalSalesCents = campaigns.reduce((sum, c) => sum + c.attributedSalesQapik, 0);

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Aktiv</Badge>;
      case 'scheduled':
        return <Badge variant="info">Planlaşdırılıb</Badge>;
      case 'pending_approval':
        return <Badge variant="warning">Təsdiq Gözləyir</Badge>;
      case 'approved':
        return <Badge variant="default">Təsdiqlənib</Badge>;
      case 'paused':
        return <Badge variant="outline">Dayandırılıb</Badge>;
      case 'ended':
        return <Badge variant="neutral">Başa Çatıb</Badge>;
      case 'rejected':
        return <Badge variant="danger">İmtina Edilib</Badge>;
      default:
        return <Badge variant="outline">Layihə (Draft)</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Megaphone className="h-7 w-7 text-primary" />
            Marketinq və Kampaniyalar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mövsümi aksiyaların, brend kampaniyalarının və filial endirimlərinin mərkəzləşdirilmiş idarəetməsi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setSelectedCampaignForEdit(undefined);
              setIsWizardOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Yeni Kampaniya Yarat
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Aktiv Kampaniyalar</span>
          <div className="text-2xl font-bold text-foreground">{activeCount}</div>
          <span className="text-xs text-muted-foreground">Cəmi {campaigns.length} qeydiyyatda</span>
        </Card>
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Ümumi Büdcə Limiti</span>
          <div className="text-2xl font-bold text-foreground font-mono">
            {formatMoney(totalBudgetCents)}
          </div>
          <span className="text-xs text-muted-foreground">Planlaşdırılmış marketinq büdcəsi</span>
        </Card>
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Faktiki Xərclənən</span>
          <div className="text-2xl font-bold text-foreground font-mono text-warning">
            {formatMoney(totalSpentCents)}
          </div>
          <span className="text-xs text-muted-foreground">
            Büdcənin {totalBudgetCents > 0 ? Math.round((totalSpentCents / totalBudgetCents) * 100) : 0}%-i
          </span>
        </Card>
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Attributasiya Olunmuş Satış</span>
          <div className="text-2xl font-bold text-success font-mono">
            {formatMoney(totalSalesCents)}
          </div>
          <span className="text-xs text-muted-foreground">Kampaniyalarla əlaqəli dövriyyə</span>
        </Card>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Kampaniya adı və ya kodu ilə axtar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-input bg-background"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-md border border-input bg-background p-1.5"
          >
            <option value="all">Bütün Statuslar</option>
            <option value="active">Aktiv</option>
            <option value="pending_approval">Təsdiq Gözləyir</option>
            <option value="scheduled">Planlaşdırılıb</option>
            <option value="draft">Layihə (Draft)</option>
            <option value="ended">Başa Çatıb</option>
          </select>

          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="text-xs rounded-md border border-input bg-background p-1.5"
          >
            <option value="all">Bütün Filiallar</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Kampaniya</th>
                <th className="px-3 py-3">Növ / Məqsəd</th>
                <th className="px-3 py-3">Tarix Aralığı</th>
                <th className="px-3 py-3 text-right">Büdcə</th>
                <th className="px-3 py-3 text-right">Xərc</th>
                <th className="px-3 py-3 text-right">Satış Həcmi</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-right">Əməliyyatlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    Kampaniyalar yüklənir...
                  </td>
                </tr>
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    Uyğun kampaniya tapılmadı.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{camp.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{camp.code}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className="capitalize font-medium text-foreground">
                        {camp.type === 'seasonal'
                          ? 'Mövsümi'
                          : camp.type === 'promo_code'
                          ? 'Promokod'
                          : camp.type === 'brand'
                          ? 'Brend'
                          : 'Digər'}
                      </span>
                      <div className="text-[11px] text-muted-foreground">
                        {camp.targetBranchIds.includes('*')
                          ? 'Bütün Filiallar'
                          : `${camp.targetBranchIds.length} filial`}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-muted-foreground">
                      {camp.startDate} — {camp.endDate}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs">
                      {formatMoney(camp.budgetQapik)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatMoney(camp.spentQapik)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-success">
                      {formatMoney(camp.attributedSalesQapik)}
                    </td>
                    <td className="px-3 py-3">{getStatusBadge(camp.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/marketing/performance?campaignId=${camp.id}`)}
                          className="h-7 text-xs px-2"
                        >
                          <BarChart3 className="h-3.5 w-3.5 mr-1" />
                          ROI & Analitika
                        </Button>

                        {camp.status === 'draft' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(camp.id, 'pending_approval')}
                            className="h-7 text-xs px-2 text-primary"
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Təsdiqə Ver
                          </Button>
                        )}

                        {camp.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStatusChange(camp.id, 'paused')}
                            className="h-7 text-xs px-2 text-warning"
                          >
                            <Pause className="h-3 w-3 mr-1" />
                            Dayandır
                          </Button>
                        )}

                        {camp.status === 'paused' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStatusChange(camp.id, 'active')}
                            className="h-7 text-xs px-2 text-success"
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Davam Et
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CampaignWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSubmit={handleCreateOrUpdate}
        initialData={selectedCampaignForEdit}
      />
    </div>
  );
};
