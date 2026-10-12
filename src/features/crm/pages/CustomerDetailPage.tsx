import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { crmRepository } from '../../../shared/adapters';
import {
  Customer,
  CustomerPurchaseHistoryItem,
  CustomerReturnHistoryItem,
  PointsLedgerEntry,
  CustomerAuditLogEntry,
} from '../types';
import { formatMoney } from '../../../shared/utils/formatters';
import { maskPhone, maskEmail } from '../utils/piiMasking';
import { usePermission } from '../../../shared/hooks/usePermission';
import { PointsAdjustmentModal } from '../components/PointsAdjustmentModal';
import { CustomerDataExportAnonymizeModal } from '../components/CustomerDataExportAnonymizeModal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  User,
  ShoppingBag,
  RotateCcw,
  Award,
  Sparkles,
  ShieldCheck,
  FileText,
  History,
  Plus,
  Download,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = usePermission();
  const canViewPii = can('crm.pii.view');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<CustomerPurchaseHistoryItem[]>([]);
  const [returns, setReturns] = useState<CustomerReturnHistoryItem[]>([]);
  const [pointsLedger, setPointsLedger] = useState<PointsLedgerEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<CustomerAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('general');
  const [revealPiiTemporary, setRevealPiiTemporary] = useState(false);

  // Modals
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isDataSubjectModalOpen, setIsDataSubjectModalOpen] = useState(false);
  const [newNote, setNewNote] = useState('');

  const loadCustomerData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const cust = await crmRepository.getCustomerById(id);
      if (!cust) {
        navigate('/crm/customers');
        return;
      }
      const [purchList, retList, ledgerList, logs] = await Promise.all([
        crmRepository.getCustomerPurchases(id),
        crmRepository.getCustomerReturns(id),
        crmRepository.getPointsLedger(id),
        crmRepository.getCustomerAuditLogs(id),
      ]);
      setCustomer(cust);
      setPurchases(purchList);
      setReturns(retList);
      setPointsLedger(ledgerList);
      setAuditLogs(logs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
  }, [id]);

  if (loading || !customer) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Müştəri profili yüklənir...</div>;
  }

  const effectivePiiVisibility = canViewPii || revealPiiTemporary;

  const handleAdjustPoints = async (delta: number, reason: string) => {
    await crmRepository.adjustCustomerPoints(customer.id, delta, reason, user?.name || 'Menecer');
    loadCustomerData();
  };

  const handleAnonymize = async (reason: string) => {
    await crmRepository.requestCustomerAnonymization(customer.id, reason, user?.name || 'Menecer');
    loadCustomerData();
  };

  const handleToggleConsent = async (channel: 'sms' | 'email' | 'whatsapp') => {
    const key = channel === 'sms' ? 'smsMarketing' : channel === 'email' ? 'emailMarketing' : 'whatsappMarketing';
    const currentVal = customer.consent[key];
    await crmRepository.updateCustomerConsent(
      customer.id,
      { [key]: !currentVal },
      'customer_profile_toggle'
    );
    loadCustomerData();
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const updatedNotes = customer.notes
      ? `${customer.notes}\n[${new Date().toISOString().replace('T', ' ').slice(0, 16)}]: ${newNote}`
      : `[${new Date().toISOString().replace('T', ' ').slice(0, 16)}]: ${newNote}`;
    await crmRepository.updateCustomer(customer.id, { notes: updatedNotes });
    setNewNote('');
    loadCustomerData();
  };

  const tabs = [
    { id: 'general', label: 'Ümumi Məlumat', icon: <User className="h-4 w-4" /> },
    { id: 'purchases', label: `Alış Tarixçəsi (${purchases.length})`, icon: <ShoppingBag className="h-4 w-4" /> },
    { id: 'returns', label: `Qaytarmalar (${returns.length})`, icon: <RotateCcw className="h-4 w-4" /> },
    { id: 'loyalty', label: `Loyallıq və Ballar (${customer.pointsBalance})`, icon: <Award className="h-4 w-4" /> },
    { id: 'offers', label: 'Təkliflər & Promokodlar', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'consent', label: 'Razılıqlar (Consent)', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'notes', label: 'Xidmət Qeydləri', icon: <FileText className="h-4 w-4" /> },
    { id: 'audit', label: 'Audit Jurnalı', icon: <History className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Back button & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/crm/customers')}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {customer.firstName} {customer.lastName}
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {customer.customerCode}
              </Badge>
              <Badge
                variant={customer.tier === 'platinum' ? 'default' : customer.tier === 'gold' ? 'warning' : 'neutral'}
                className="capitalize"
              >
                {customer.tier}
              </Badge>
              {customer.isAnonymized && (
                <Badge variant="danger" className="text-xs">
                  Anonimləşdirilib (Silinib)
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span>Telefon: <span className="font-mono">{maskPhone(customer.phone, effectivePiiVisibility)}</span></span>
              <span>•</span>
              <span>Balans: <span className="font-bold text-primary">{customer.pointsBalance} bal</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealPiiTemporary(!revealPiiTemporary)}
            className="text-xs text-muted-foreground"
          >
            {effectivePiiVisibility ? (
              <>
                <EyeOff className="h-4 w-4 mr-1.5" /> PII Maskala
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1.5" /> PII Göstər
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDataSubjectModalOpen(true)}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Məlumat Subyekti Alətləri
          </Button>

          <Button size="sm" onClick={() => setIsAdjustModalOpen(true)}>
            <Award className="h-4 w-4 mr-1.5" />
            Bal Düzəlişi Et
          </Button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex overflow-x-auto border-b border-border space-x-1 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary font-bold bg-muted/40'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: General Info & RFM Server Metrics */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Server-Computed RFM Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Ömürlük Dəyər (LTV)</span>
              <div className="text-2xl font-bold font-mono text-primary">
                {formatMoney(customer.totalSpentQapik)}
              </div>
              <span className="text-xs text-muted-foreground">Bütün tamamlanmış alışlar üzrə</span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Orta Çek (AOV)</span>
              <div className="text-2xl font-bold font-mono text-foreground">
                {formatMoney(customer.averageOrderValueQapik)}
              </div>
              <span className="text-xs text-muted-foreground">Sifariş başına orta ödəniş</span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Alış Tezliyi (Frequency)</span>
              <div className="text-2xl font-bold text-foreground">{customer.ordersCount} alış</div>
              <span className="text-xs text-muted-foreground">
                Son alış: {customer.lastPurchaseDate || '-'}
              </span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Loyallıq Səviyyəsi</span>
              <div className="text-2xl font-bold capitalize text-foreground">{customer.tier}</div>
              <span className="text-xs text-muted-foreground">
                {customer.pointsBalance} aktiv bonus balı
              </span>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-5 space-y-3">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Fərdi Əlaqə Məlumatları
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span>Ad, Soyad:</span>
                  <span className="font-semibold text-foreground">
                    {customer.firstName} {customer.lastName}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span>Telefon:</span>
                  <span className="font-mono font-medium text-foreground">
                    {maskPhone(customer.phone, effectivePiiVisibility)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span>E-mail:</span>
                  <span className="font-mono text-foreground">
                    {maskEmail(customer.email, effectivePiiVisibility)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span>Doğum Tarixi:</span>
                  <span className="font-mono text-foreground">{customer.birthDate || '-'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Qeydiyyat Filialı:</span>
                  <span className="font-medium text-foreground">
                    {customer.primaryBranchId === 'branch-1'
                      ? 'Mall 28 Filialı'
                      : customer.primaryBranchId === 'branch-2'
                      ? 'Gənclik Mall Filialı'
                      : 'Dəniz Mall Filialı'}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                Üstünlük Verilən Kateqoriyalar və Ölçülər
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground block mb-1">Sevimli Kateqoriyalar:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {customer.preferredCategories.length > 0 ? (
                      customer.preferredCategories.map((cat, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {cat}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-[11px]">-</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground block mb-1">Standart Geyim/Ayaqqabı Ölçüləri:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {customer.preferredSizes.length > 0 ? (
                      customer.preferredSizes.map((sz, i) => (
                        <Badge key={i} variant="neutral" className="text-xs">
                          {sz}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-[11px]">-</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground block mb-1">Seqment Teqləri:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {customer.segmentTags.map((tag, i) => (
                      <Badge key={i} variant="info" className="text-[10px]">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Purchases */}
      {activeTab === 'purchases' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Sifariş Nömrəsi</th>
                  <th className="px-3 py-3">Tarix</th>
                  <th className="px-3 py-3">Filial</th>
                  <th className="px-3 py-3">Məhsullar</th>
                  <th className="px-3 py-3 text-right">Məbləğ</th>
                  <th className="px-3 py-3 text-right">Qazanılan Bal</th>
                  <th className="px-3 py-3 text-right">Silinən Bal</th>
                  <th className="px-4 py-3">Ödəniş Metodu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      Alış qeydi tapılmadı.
                    </td>
                  </tr>
                ) : (
                  purchases.map((p) => (
                    <tr key={p.orderId} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-semibold text-primary text-xs">
                        {p.orderNumber}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{p.date}</td>
                      <td className="px-3 py-3 text-xs">{p.branchName}</td>
                      <td className="px-3 py-3 text-xs text-foreground max-w-xs truncate">
                        {p.itemsSummary}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-xs text-foreground">
                        {formatMoney(p.totalAmountQapik)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-success">
                        +{p.pointsEarned}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-destructive">
                        {p.pointsRedeemed > 0 ? `-${p.pointsRedeemed}` : '0'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.paymentMethod}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Returns */}
      {activeTab === 'returns' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Qaytarılma Sənədi</th>
                  <th className="px-3 py-3">Əlaqəli Çek</th>
                  <th className="px-3 py-3">Tarix</th>
                  <th className="px-3 py-3">Filial</th>
                  <th className="px-3 py-3">Qaytarılan Məhsul</th>
                  <th className="px-3 py-3 text-right">Geri Ödənilən</th>
                  <th className="px-3 py-3 text-right">Ləğv Edilən Bal</th>
                  <th className="px-4 py-3">Səbəb</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      Qaytarılma əməliyyatı olmayıb.
                    </td>
                  </tr>
                ) : (
                  returns.map((r) => (
                    <tr key={r.returnId} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-semibold text-foreground text-xs">
                        {r.returnNumber}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {r.originalOrderNumber}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{r.date}</td>
                      <td className="px-3 py-3 text-xs">{r.branchName}</td>
                      <td className="px-3 py-3 text-xs text-foreground">{r.itemsReturned}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-xs text-destructive">
                        {formatMoney(r.refundAmountQapik)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-destructive">
                        -{r.pointsReversed} bal
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Loyalty Points Ledger */}
      {activeTab === 'loyalty' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-lg border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                Cari Qalıq: <span className="font-bold font-mono text-sm text-primary">{customer.pointsBalance} bal</span>
              </span>
            </div>
            <Button size="sm" onClick={() => setIsAdjustModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Korreksiya / Bal Əlavə Et
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Tarix</th>
                    <th className="px-3 py-3">Əməliyyat Növü</th>
                    <th className="px-3 py-3 text-right">Bal Dəyişikliyi</th>
                    <th className="px-3 py-3 text-right">Qalıq</th>
                    <th className="px-3 py-3">İstinad (Ref ID)</th>
                    <th className="px-3 py-3">Qeyd / Əsaslandırma</th>
                    <th className="px-4 py-3">Müəllif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pointsLedger.map((ple) => (
                    <tr key={ple.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{ple.date}</td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={ple.pointsDelta > 0 ? 'success' : 'danger'}
                          className="text-[10px] uppercase"
                        >
                          {ple.type}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono font-bold text-xs ${
                          ple.pointsDelta > 0 ? 'text-success' : 'text-destructive'
                        }`}
                      >
                        {ple.pointsDelta > 0 ? `+${ple.pointsDelta}` : ple.pointsDelta}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-xs text-foreground">
                        {ple.balanceAfter}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {ple.referenceId || '-'}
                      </td>
                      <td className="px-3 py-3 text-xs text-foreground">{ple.note}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{ple.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Offers & Eligible Promos */}
      {activeTab === 'offers' && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Müştərinin Loyallıq Dərəcəsinə Uyğun Xüsusi Təkliflər
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded border border-border bg-muted/30 space-y-1">
                <div className="font-bold text-primary">10% VIP Tier Endirimi</div>
                <p className="text-muted-foreground">
                  Qızıl və Platin üzvlük dərəcəsinə görə bütün alışlarda avtomatik tətbiq olunur.
                </p>
              </div>
              <div className="p-3 rounded border border-border bg-muted/30 space-y-1">
                <div className="font-bold text-primary">NOVRUZ2026 Promokodu</div>
                <p className="text-muted-foreground">
                  Bahar kolleksiyası geyimlərinə 20% xüsusi kupon aktivdir.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 6: Consent History & Preferences */}
      {activeTab === 'consent' && (
        <div className="space-y-5">
          {/* Active Consent Toggles */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Aktiv Bildiriş və Marketinq Razılıqları
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div>
                  <div className="font-medium text-xs text-foreground">SMS Bildirişləri</div>
                  <div className="text-[11px] text-muted-foreground">
                    Yeni aksiyalar və promokodların mobil nömrəyə SMS ilə göndərilməsi.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={customer.consent.smsMarketing ? 'default' : 'outline'}
                  onClick={() => handleToggleConsent('sms')}
                  className="text-xs h-7"
                >
                  {customer.consent.smsMarketing ? 'Razılıq Verilib' : 'İmtina Edilib'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div>
                  <div className="font-medium text-xs text-foreground">WhatsApp Business Mesajları</div>
                  <div className="text-[11px] text-muted-foreground">
                    Kassa çekləri və loyallıq bal xatırlatmaları.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={customer.consent.whatsappMarketing ? 'default' : 'outline'}
                  onClick={() => handleToggleConsent('whatsapp')}
                  className="text-xs h-7"
                >
                  {customer.consent.whatsappMarketing ? 'Razılıq Verilib' : 'İmtina Edilib'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div>
                  <div className="font-medium text-xs text-foreground">E-mail Bülleteni</div>
                  <div className="text-[11px] text-muted-foreground">
                    Mövsümi kataloqlar və fərdi endirimlər.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={customer.consent.emailMarketing ? 'default' : 'outline'}
                  onClick={() => handleToggleConsent('email')}
                  className="text-xs h-7"
                >
                  {customer.consent.emailMarketing ? 'Razılıq Verilib' : 'İmtina Edilib'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Consent History Log */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30">
              <h4 className="font-semibold text-xs text-foreground">Razılıq Dəyişikliyi Arxivi (Audit Trail)</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Kanal</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Mənbə (Source)</th>
                    <th className="px-4 py-2.5 text-right">Tarix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customer.consent.history.map((h, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-semibold text-foreground uppercase">
                        {h.channel}
                      </td>
                      <td className="px-3 py-2.5">
                        {h.granted ? (
                          <span className="text-success font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Razılıq Təsdiqləndi
                          </span>
                        ) : (
                          <span className="text-destructive font-medium flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5" /> İmtina Edildi
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{h.source}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                        {h.timestamp.replace('T', ' ').slice(0, 16)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-foreground">Yeni Xidmət Qeydi Əlavə Et</h3>
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                rows={3}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Məs: Müştəri yeni kolleksiya kostyumlarının çatdırılması barədə zəng etməyi xahiş etdi..."
                className="w-full text-xs rounded-md border border-input bg-background p-2"
              />
              <div className="flex justify-end">
                <Button size="sm" type="submit">
                  Qeydi Yadda Saxla
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-4 space-y-2">
            <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider">
              Tarixi Qeydlər
            </h4>
            <div className="p-3 rounded bg-muted/40 font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground">
              {customer.notes || 'Qeyd yoxdur.'}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 8: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Əməliyyat</th>
                  <th className="px-3 py-3">İcraçı</th>
                  <th className="px-3 py-3">Rol</th>
                  <th className="px-3 py-3">Təsvir</th>
                  <th className="px-4 py-3 text-right">Tarix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      Audit qeydi yoxdur.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/20 text-xs">
                      <td className="px-4 py-3 font-semibold uppercase text-primary">
                        {log.action}
                      </td>
                      <td className="px-3 py-3 text-foreground font-medium">{log.actorName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{log.actorRole}</td>
                      <td className="px-3 py-3 text-foreground">{log.details}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {log.timestamp.replace('T', ' ').slice(0, 16)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PointsAdjustmentModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        customer={customer}
        onSubmit={handleAdjustPoints}
      />

      <CustomerDataExportAnonymizeModal
        isOpen={isDataSubjectModalOpen}
        onClose={() => setIsDataSubjectModalOpen(false)}
        customer={customer}
        onAnonymizeRequest={handleAnonymize}
      />
    </div>
  );
};
