import React, { useEffect, useState } from 'react';
import {
  ComplianceStatusSummary,
  RulePack,
  Obligation,
  OpenLegalQuestion,
} from '../types';
import { complianceRepository } from '../../../shared/adapters';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TurnoverMonitorWidget } from '../components/TurnoverMonitorWidget';
import { CalendarImportModal } from '../components/CalendarImportModal';
import { RuleDetailDrawer } from '../components/RuleDetailDrawer';
import { RuleVerificationModal } from '../components/RuleVerificationModal';
import { RuleProposalModal } from '../components/RuleProposalModal';
import {
  Scale,
  ShieldCheck,
  Calendar,
  HelpCircle,
  Download,
  Upload,
  CheckCircle2,
  Eye,
  Search,
} from 'lucide-react';

export const ComplianceCenterPage: React.FC = () => {
  const [summary, setSummary] = useState<ComplianceStatusSummary | null>(null);
  const [rulePacks, setRulePacks] = useState<RulePack[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [questions, setQuestions] = useState<OpenLegalQuestion[]>([]);
  const [, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState('rules');

  // Modals / Drawers state
  const [selectedPack, setSelectedPack] = useState<RulePack | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isProposeModalOpen, setIsProposeModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumRes, packsRes, obligRes, qRes] = await Promise.all([
        complianceRepository.getStatusSummary(),
        complianceRepository.getRulePacks(),
        complianceRepository.getObligations(),
        complianceRepository.getOpenLegalQuestions(),
      ]);
      setSummary(sumRes);
      setRulePacks(packsRes);
      setObligations(obligRes);
      setQuestions(qRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenDetail = (pack: RulePack) => {
    setSelectedPack(pack);
    setIsDetailDrawerOpen(true);
  };

  const handleOpenVerify = (pack: RulePack) => {
    setSelectedPack(pack);
    setIsVerifyModalOpen(true);
  };

  const handleOpenPropose = (pack: RulePack) => {
    setSelectedPack(pack);
    setIsProposeModalOpen(true);
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Domen', 'Ad', 'Status', 'Qanunvericilik Əsası', 'Son Təsdiq'];
    const rows = rulePacks.map((p) => [
      p.id,
      p.domain,
      `"${(p.title || p.titleAz || '').replace(/"/g, '""')}"`,
      p.status,
      `"${(p.legalReference || '').replace(/"/g, '""')}"`,
      p.verifiedAt || 'Təsdiqlənməyib',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `compliance_rules_register_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered rule packs
  const filteredPacks = rulePacks.filter((pack) => {
    const titleText = (pack.title || pack.titleAz || '').toLowerCase();
    const refText = (pack.legalReference || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = titleText.includes(q) || refText.includes(q) || pack.id.toLowerCase().includes(q);
    const matchesDomain = selectedDomain === 'ALL' || pack.domain === selectedDomain;
    const matchesStatus = selectedStatus === 'ALL' || pack.status === selectedStatus;
    return matchesSearch && matchesDomain && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return <Badge variant="success">Təsdiqlənib</Badge>;
      case 'UNVERIFIED':
        return <Badge variant="warning">Təsdiqlənməyib</Badge>;
      case 'DISPUTED':
        return <Badge variant="danger">Mübahisəli</Badge>;
      case 'SUPERSEDED':
        return <Badge variant="neutral">Əvəz olunub</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Scale className="h-7 w-7 text-indigo-400" />
            <h1 className="text-2xl font-bold text-zinc-100">Uyğunluq Mərkəzi</h1>
            {summary?.isDemo && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-mono font-semibold">
                DEMO REJİMİ
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Azərbaycan Respublikasının vergi, əmək, kassa, istehlakçı və fərdi məlumat qanunvericiliyi qaydaları
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-1.5" />
            Reyestri İxrac Et (CSV)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCalendarModalOpen(true)}
          >
            <Upload className="h-4 w-4 mr-1.5" />
            İstehsalat Təqvimi İdxalı
          </Button>
        </div>
      </div>

      {/* Mandatory Legal Disclaimer Banner */}
      <div className="p-3.5 bg-zinc-900/90 border border-indigo-900/50 rounded-lg text-xs text-zinc-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-indigo-400 shrink-0" />
          <span>
            <strong>Hüquqi bildiriş:</strong> Bu sistem uyğunluğa dəstək verir, hüquqi məsləhət deyil; qaydalar mühasib/hüquqşünas tərəfindən təsdiqlənməlidir.
          </span>
        </div>
        <span className="text-zinc-500 text-[11px] font-mono">
          Yurisdiksiya: AZ (Azərbaycan Respublikası)
        </span>
      </div>

      {/* Domain Status Cards (9 domains) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {summary?.domains.map((dom) => (
          <Card
            key={dom.domain}
            className={`p-3.5 border transition-all ${
              (dom.status as any) === 'ACTIVE-VERIFIED' || (dom.status as any) === 'VERIFIED'
                ? 'bg-zinc-900/80 border-emerald-900/40 hover:border-emerald-800/80'
                : (dom.status as any) === 'DISPUTED'
                ? 'bg-zinc-900/80 border-rose-900/40 hover:border-rose-800/80'
                : 'bg-zinc-900/80 border-amber-900/40 hover:border-amber-800/80'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-200">{((dom as any).domainTitleAz || dom.domain)}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Paket: <span className="font-mono text-zinc-300">{dom.packId}</span>
                </div>
              </div>
              {getStatusBadge(dom.status)}
            </div>

            <div className="mt-3 pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 flex items-center justify-between">
              <span>
                {dom.lastVerifiedAt
                  ? `Təsdiq: ${new Date(dom.lastVerifiedAt).toLocaleDateString('az-AZ')}`
                  : 'Hələ təsdiqlənməyib'}
              </span>
              <span className="text-zinc-500 truncate max-w-[120px]">
                {dom.verifiedBy || 'Gözlənilir'}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'rules'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Qayda Reyestri ({rulePacks.length})
          </button>
          <button
            onClick={() => setActiveTab('obligations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'obligations'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Öhdəliklər Təqvimi ({obligations.length})
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'questions'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Açıq Hüquqi Məsələlər ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('turnover')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'turnover'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Dövriyyə & Təqvim
          </button>
        </div>

        {/* Tab 1: Rules Register */}
        {activeTab === 'rules' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-zinc-500" />
                <Input
                  placeholder="Qaydalarda axtarış (ad, qanun, id)..."
                  className="pl-9 text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="ALL">Bütün Domenlər</option>
                  <option value="vat">ƏDV</option>
                  <option value="fiscal">Fiskal çek</option>
                  <option value="payroll_tax">Əmək haqqı vergiləri</option>
                  <option value="social_insurance">Sosial sığorta</option>
                  <option value="work_time">İş vaxtı</option>
                  <option value="leave">Məzuniyyət</option>
                  <option value="consumer_rights">İstehlakçı hüquqları</option>
                  <option value="personal_data">Şəxsi məlumatlar</option>
                  <option value="retention">Saxlama müddəti</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="ALL">Bütün Statuslar</option>
                  <option value="VERIFIED">Təsdiqlənib</option>
                  <option value="UNVERIFIED">Təsdiqlənməyib</option>
                  <option value="DISPUTED">Mübahisəli</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950/80 text-zinc-400 font-semibold border-b border-zinc-800 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Paket Adı</th>
                    <th className="p-3">Domen</th>
                    <th className="p-3">Qanunvericilik Əsası</th>
                    <th className="p-3">Versiya</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Əməliyyatlar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-medium">
                  {filteredPacks.map((pack) => (
                    <tr
                      key={pack.id}
                      className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      onClick={() => handleOpenDetail(pack)}
                    >
                      <td className="p-3">
                        <div className="font-semibold text-zinc-100">{pack.title || pack.titleAz}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{pack.id}</div>
                      </td>
                      <td className="p-3">
                        <span className="capitalize">{pack.domain.replace('_', ' ')}</span>
                      </td>
                      <td className="p-3 text-zinc-400 max-w-xs truncate">
                        {pack.legalReference}
                      </td>
                      <td className="p-3 font-mono">v{pack.version}</td>
                      <td className="p-3">{getStatusBadge(pack.status)}</td>
                      <td
                        className="p-3 text-right space-x-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDetail(pack)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Bax
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenVerify(pack)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                          Təsdiq
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredPacks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-500">
                        Axtarışa uyğun hüquqi qayda paketi tapılmadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Obligations Calendar */}
        {activeTab === 'obligations' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {obligations.map((ob) => (
                <Card
                  key={ob.id}
                  className="p-4 bg-zinc-900 border-zinc-800 space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-zinc-100 text-sm">{(ob as any).title || ob.titleAz}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">{(ob as any).description || (ob as any).templateCode || 'Qanuni öhdəlik'}</div>
                    </div>
                    <Badge variant={ob.status === 'COMPLETED' ? 'success' : 'warning'}>
                      {ob.status === 'COMPLETED' ? 'İcra edildi' : 'Gözlənilir'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 pt-2 border-t border-zinc-800">
                    <div>
                      <span className="text-zinc-500">Son Tarix:</span>{' '}
                      <span className="font-mono text-zinc-200">
                        {new Date(((ob as any).dueDate || ob.nextDue || '2026-11-20')).toLocaleDateString('az-AZ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Dövriyyə:</span>{' '}
                      <span className="text-zinc-200 capitalize">{ob.cadence}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Məsul:</span>{' '}
                      <span className="text-zinc-200">{(ob as any).owner || ob.ownerName || ob.ownerUserId || 'Məsul şəxs'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Qanun əsası:</span>{' '}
                      <span className="text-indigo-400 truncate block">{(ob as any).legalReference || 'AR Qanunvericiliyi'}</span>
                    </div>
                  </div>

                  {ob.status !== 'COMPLETED' && (
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await complianceRepository.completeObligation(
                            ob.id,
                            'Hesabat tərtib edildi və sistemə yükləndi'
                          );
                          loadData();
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                        İcra olundu kimi qeyd et
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Open Legal Questions */}
        {activeTab === 'questions' && (
          <div className="space-y-3">
            {questions.map((q) => (
              <Card key={q.id} className="p-4 bg-zinc-900 border-zinc-800 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <HelpCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-zinc-100 text-sm">{q.question}</div>
                      <div className="text-xs text-zinc-400 mt-1 font-mono">
                        Domen: {q.domain}
                      </div>
                    </div>
                  </div>
                  <Badge variant={q.status === 'RESOLVED' ? 'success' : 'warning'}>
                    {q.status === 'RESOLVED' ? 'Həll olunub' : 'Açıqdır'}
                  </Badge>
                </div>

                <div className="bg-zinc-950/60 p-3 rounded-md border border-zinc-800/80 text-xs space-y-1">
                  <div className="text-zinc-400">
                    <strong className="text-zinc-300">Təyin olunub:</strong> {q.assignee}
                  </div>
                  <div className="text-zinc-300">
                    <strong className="text-zinc-400">Həll / Tövsiyə qeydləri:</strong>{' '}
                    {q.resolutionNotes}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Tab 4: Turnover & Calendar */}
        {activeTab === 'turnover' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TurnoverMonitorWidget />

            <Card className="p-5 bg-zinc-900 border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-indigo-400" />
                  <h3 className="font-semibold text-zinc-100 text-sm">
                    İstehsalat Təqvimi Norması (2026)
                  </h3>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsCalendarModalOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  Yenilə
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                  <div className="text-zinc-500">İllik İş Günləri</div>
                  <div className="text-xl font-bold font-mono text-zinc-100 mt-1">
                    241 gün
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">5 günlük iş həftəsi</div>
                </div>
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                  <div className="text-zinc-500">İllik İş Saatları</div>
                  <div className="text-xl font-bold font-mono text-zinc-100 mt-1">
                    1922 saat
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">40 saatlıq həftəlik norma</div>
                </div>
              </div>

              <div className="text-xs text-zinc-400 space-y-1.5 pt-2 border-t border-zinc-800">
                <div className="flex justify-between">
                  <span>Bayramqabağı qısaldılmış günlər:</span>
                  <span className="font-mono text-zinc-200">7 gün (-1 saat)</span>
                </div>
                <div className="flex justify-between">
                  <span>İş günü hesab edilməyən bayramlar:</span>
                  <span className="font-mono text-zinc-200">19 gün</span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Modals and Drawers */}
      <RuleDetailDrawer
        pack={selectedPack}
        isOpen={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
        onOpenVerify={(pack) => {
          setIsDetailDrawerOpen(false);
          handleOpenVerify(pack);
        }}
        onOpenPropose={(pack) => {
          setIsDetailDrawerOpen(false);
          handleOpenPropose(pack);
        }}
      />

      <RuleVerificationModal
        pack={selectedPack}
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        onSuccess={() => loadData()}
      />

      <RuleProposalModal
        pack={selectedPack}
        isOpen={isProposeModalOpen}
        onClose={() => setIsProposeModalOpen(false)}
        onSuccess={() => loadData()}
      />

      <CalendarImportModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        onSuccess={() => loadData()}
      />
    </div>
  );
};
export default ComplianceCenterPage;
