import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { crmRepository, branchRepository } from '../../../shared/adapters';
import { Customer, CustomerTier } from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { maskPhone } from '../utils/piiMasking';
import { usePermission } from '../../../shared/hooks/usePermission';
import { CustomerQuickCreateModal } from '../components/CustomerQuickCreateModal';
import { CustomerMergeModal } from '../components/CustomerMergeModal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  Users,
  Plus,
  GitMerge,
  Phone,
  Eye,
  EyeOff,
} from 'lucide-react';

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, can } = usePermission();
  const canViewPii = can('crm.pii.view');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [revealPiiTemporary, setRevealPiiTemporary] = useState(false);

  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [custList, branchList] = await Promise.all([
        crmRepository.getCustomers({
          search: searchQuery,
          tier: tierFilter,
          branchId: branchFilter,
        }),
        branchRepository.getBranches(),
      ]);
      setCustomers(custList);
      setBranches(branchList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery, tierFilter, branchFilter]);

  const handleCreateCustomer = async (data: Partial<Customer>) => {
    await crmRepository.createCustomer(data);
    loadData();
  };

  const handleMergeCustomers = async (sourceId: string, targetId: string, reason: string) => {
    await crmRepository.mergeCustomers(sourceId, targetId, reason, user?.name || 'Menecer');
    loadData();
  };

  const effectivePiiVisibility = canViewPii || revealPiiTemporary;

  const getTierBadge = (tier: CustomerTier) => {
    switch (tier) {
      case 'platinum':
        return (
          <Badge variant="default" className="bg-purple-600 text-white hover:bg-purple-700">
            Platin
          </Badge>
        );
      case 'gold':
        return (
          <Badge variant="warning" className="bg-amber-500 text-white hover:bg-amber-600">
            Qızıl
          </Badge>
        );
      case 'silver':
        return <Badge variant="neutral">Gümüş</Badge>;
      default:
        return <Badge variant="outline">Bürünc</Badge>;
    }
  };

  // KPI calculations
  const totalPoints = customers.reduce((sum, c) => sum + c.pointsBalance, 0);
  const totalSpendCents = customers.reduce((sum, c) => sum + c.totalSpentQapik, 0);
  const avgOrderValueCents =
    customers.length > 0 ? Math.round(totalSpendCents / Math.max(1, customers.reduce((sum, c) => sum + c.ordersCount, 0))) : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Users className="h-7 w-7 text-primary" />
            Müştəri Bazası və Loyallıq (CRM)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Müştəri kartotekası, balans balları, fərdi alış vərdişləri və PII məxfilik nəzarəti.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsMergeOpen(true)}>
            <GitMerge className="h-4 w-4 mr-1.5" />
            Müştəriləri Birləşdir
          </Button>
          <Button size="sm" onClick={() => setIsQuickCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Yeni Müştəri Qeydiyyatı
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Qeydiyyatdakı Müştərilər</span>
          <div className="text-2xl font-bold text-foreground">{customers.length} nəfər</div>
          <span className="text-xs text-muted-foreground">Aktiv fərdi kartlar</span>
        </Card>
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Toplanmış Loyallıq Balı</span>
          <div className="text-2xl font-bold text-primary">{totalPoints.toLocaleString()} bal</div>
          <span className="text-xs text-muted-foreground">Dövriyyədəki cari balans</span>
        </Card>
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Cəmi Müştəri Xərcləməsi</span>
          <div className="text-2xl font-bold text-success font-mono">
            {formatMoney(totalSpendCents)}
          </div>
          <span className="text-xs text-muted-foreground">Tarixi ümumi alış həcmi</span>
        </Card>
        <Card className="p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Orta Çek Məbləği (AOV)</span>
          <div className="text-2xl font-bold text-foreground font-mono">
            {formatMoney(avgOrderValueCents)}
          </div>
          <span className="text-xs text-muted-foreground">Bütün filiallar üzrə</span>
        </Card>
      </div>

      {/* Filters and Phone-First Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card">
        <div className="relative w-full md:w-96">
          <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-primary" />
          <input
            type="text"
            placeholder="İlk öncə telefon (+994...), ad və ya kod ilə axtar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-input bg-background font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="text-xs rounded-md border border-input bg-background p-1.5"
          >
            <option value="all">Bütün Dərəcələr (Tiers)</option>
            <option value="platinum">Platin</option>
            <option value="gold">Qızıl</option>
            <option value="silver">Gümüş</option>
            <option value="bronze">Bürünc</option>
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

          {/* Privacy reveal toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealPiiTemporary(!revealPiiTemporary)}
            className="text-xs text-muted-foreground h-8"
            title="Həssas əlaqə məlumatlarının maskalanması"
          >
            {effectivePiiVisibility ? (
              <>
                <EyeOff className="h-3.5 w-3.5 mr-1" /> Maskala
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 mr-1" /> PII Göstər
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Müştəri Kodu / Ad</th>
                <th className="px-3 py-3">Telefon</th>
                <th className="px-3 py-3">Dərəcə (Tier)</th>
                <th className="px-3 py-3 text-right">Balans</th>
                <th className="px-3 py-3 text-right">Cəmi Xərcləmə</th>
                <th className="px-3 py-3 text-center">Sifarişlər</th>
                <th className="px-3 py-3 text-right">Orta Çek (AOV)</th>
                <th className="px-3 py-3">Son Alış</th>
                <th className="px-4 py-3 text-right">Profil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    Müştərilər yüklənir...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    Axtarışa uyğun müştəri tapılmadı.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/crm/customers/${c.id}`)}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">
                        {c.firstName} {c.lastName}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">{c.customerCode}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {maskPhone(c.phone, effectivePiiVisibility)}
                    </td>
                    <td className="px-3 py-3">{getTierBadge(c.tier)}</td>
                    <td className="px-3 py-3 text-right font-bold text-primary font-mono text-xs">
                      {c.pointsBalance} bal
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-xs text-foreground">
                      {formatMoney(c.totalSpentQapik)}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-medium">
                      {c.ordersCount}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatMoney(c.averageOrderValueQapik)}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-muted-foreground">
                      {c.lastPurchaseDate || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                        Baxış
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerQuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        existingCustomers={customers}
        onSubmit={handleCreateCustomer}
      />

      <CustomerMergeModal
        isOpen={isMergeOpen}
        onClose={() => setIsMergeOpen(false)}
        allCustomers={customers}
        onMerge={handleMergeCustomers}
      />
    </div>
  );
};
