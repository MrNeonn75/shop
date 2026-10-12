import React, { useState, useEffect } from 'react';
import { marketingRepository } from '../../../shared/adapters';
import { PromoCode, PromoCodeRedemption, PromotionRule } from '../types';
import { PromoCodeModal } from '../components/PromoCodeModal';
import { formatMoney } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  Tag,
  Plus,
  Search,
  Ticket,
  History,
} from 'lucide-react';

export const PromoCodesPage: React.FC = () => {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [redemptions, setRedemptions] = useState<PromoCodeRedemption[]>([]);
  const [rules, setRules] = useState<PromotionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewTab, setViewTab] = useState<'codes' | 'redemptions'>('codes');

  const loadData = async () => {
    setLoading(true);
    try {
      const [codesList, redemps, ruleList] = await Promise.all([
        marketingRepository.getPromoCodes(),
        marketingRepository.getRedemptions(),
        marketingRepository.getPromotionRules(),
      ]);
      setPromoCodes(codesList);
      setRedemptions(redemps);
      setRules(ruleList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSingle = async (data: Partial<PromoCode>) => {
    await marketingRepository.createPromoCode(data);
    loadData();
  };

  const handleGenerateBulk = async (
    prefix: string,
    count: number,
    template: Partial<PromoCode>
  ) => {
    await marketingRepository.generateBulkPromoCodes(prefix, count, template);
    loadData();
  };

  const filteredCodes = promoCodes.filter((pc) => {
    if (!searchQuery) return true;
    return (
      pc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pc.discountDescription.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const getCodeStatusBadge = (status: PromoCode['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Aktiv</Badge>;
      case 'expired':
        return <Badge variant="neutral">Müddəti Bitib</Badge>;
      case 'exhausted':
        return <Badge variant="danger">Tükənib (Limit doldu)</Badge>;
      default:
        return <Badge variant="outline">Deaktiv</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Ticket className="h-7 w-7 text-primary" />
            Promokodlar və Kupon İdarəetməsi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fərdi və kütləvi promokodların generasiyası, istifadə limitləri və kassa istifadə jurnalı.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Yeni Promokod / Kütləvi Generasiya
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-md border border-border p-1 bg-muted/40 w-fit">
        <button
          type="button"
          onClick={() => setViewTab('codes')}
          className={`py-1.5 px-4 text-xs font-medium rounded transition-all flex items-center gap-2 ${
            viewTab === 'codes'
              ? 'bg-background shadow-xs text-foreground font-semibold'
              : 'text-muted-foreground'
          }`}
        >
          <Tag className="h-4 w-4" />
          Aktiv və Arxiv Kodlar ({promoCodes.length})
        </button>
        <button
          type="button"
          onClick={() => setViewTab('redemptions')}
          className={`py-1.5 px-4 text-xs font-medium rounded transition-all flex items-center gap-2 ${
            viewTab === 'redemptions'
              ? 'bg-background shadow-xs text-primary font-semibold'
              : 'text-muted-foreground'
          }`}
        >
          <History className="h-4 w-4" />
          Kassa İstifadə Jurnalı (Redemptions) ({redemptions.length})
        </button>
      </div>

      {viewTab === 'codes' ? (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Kod və ya təsvir ilə axtar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-input bg-background"
            />
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Promokod</th>
                    <th className="px-3 py-3">Endirim Təsviri</th>
                    <th className="px-3 py-3 text-center">İstifadə / Limit</th>
                    <th className="px-3 py-3 text-center">Müştəri Limiti</th>
                    <th className="px-3 py-3">Etibarlılıq Tarixi</th>
                    <th className="px-3 py-3">Filiallar</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Yüklənir...
                      </td>
                    </tr>
                  ) : filteredCodes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Promokod tapılmadı.
                      </td>
                    </tr>
                  ) : (
                    filteredCodes.map((pc) => (
                    <tr key={pc.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-bold tracking-wider text-primary text-xs">
                        {pc.code}
                      </td>
                      <td className="px-3 py-3 text-xs text-foreground font-medium">
                        {pc.discountDescription}
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-mono">
                        <span className="font-semibold text-foreground">{pc.usedCount}</span> /{' '}
                        <span className="text-muted-foreground">{pc.totalUsageLimit}</span>
                        <div className="w-20 bg-muted rounded-full h-1.5 mx-auto mt-1 overflow-hidden">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((pc.usedCount / pc.totalUsageLimit) * 100)
                              )}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                        {pc.perCustomerLimit} dəfə
                      </td>
                      <td className="px-3 py-3 text-xs font-mono text-muted-foreground">
                        {pc.startDate} — {pc.endDate}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {pc.targetBranchIds.includes('*')
                          ? 'Bütün Filiallar'
                          : `${pc.targetBranchIds.length} filial`}
                      </td>
                      <td className="px-4 py-3 text-right">{getCodeStatusBadge(pc.status)}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Redemptions Log */
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Promokod</th>
                  <th className="px-3 py-3">Sifariş ID</th>
                  <th className="px-3 py-3">Müştəri</th>
                  <th className="px-3 py-3 text-right">Tətbiq Edilən Endirim</th>
                  <th className="px-3 py-3">Filial</th>
                  <th className="px-4 py-3 text-right">İstifadə Tarixi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {redemptions.map((red) => (
                  <tr key={red.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono font-bold text-primary text-xs">
                      {red.promoCode}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-foreground">
                      {red.orderId}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className="font-medium text-foreground">{red.customerName}</div>
                      <div className="font-mono text-muted-foreground text-[11px]">
                        {red.customerPhone}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-xs text-success">
                      -{formatMoney(red.discountAppliedQapik)}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{red.branchName}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                      {red.redeemedAt.replace('T', ' ').slice(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PromoCodeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        promotionRules={rules}
        onCreateSingle={handleCreateSingle}
        onGenerateBulk={handleGenerateBulk}
      />
    </div>
  );
};
