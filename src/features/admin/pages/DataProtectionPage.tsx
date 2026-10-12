import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  DataRetentionPolicy,
  PiiAccessRecord,
  DataSubjectRequest,
} from '../types/securityAudit';
import { securityAuditRepository } from '../../../shared/adapters';
import { formatDateTime } from '../../../shared/utils/formatters';
import { FileText, RefreshCw } from 'lucide-react';

export const DataProtectionPage: React.FC = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'retention' | 'pii_report' | 'requests'>('requests');
  const [retentionPolicies, setRetentionPolicies] = useState<DataRetentionPolicy[]>([]);
  const [piiReports, setPiiReports] = useState<PiiAccessRecord[]>([]);
  const [subjectRequests, setSubjectRequests] = useState<DataSubjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New Request Modal
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    requestType: 'anonymize' as DataSubjectRequest['requestType'],
    reason: '',
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [policies, reports, requests] = await Promise.all([
        securityAuditRepository.getDataRetentionPolicies(),
        securityAuditRepository.getPiiAccessReports(),
        securityAuditRepository.getDataSubjectRequests(),
      ]);
      setRetentionPolicies(policies);
      setPiiReports(reports);
      setSubjectRequests(requests);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Məlumatların mühafizəsi məlumatlarını yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProcessRequest = async (id: string, status: DataSubjectRequest['status']) => {
    try {
      const updated = await securityAuditRepository.updateDataSubjectRequestStatus(
        id,
        status,
        'Məlumat Mühafizəsi Zabiti'
      );
      setSubjectRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      toast({
        type: 'success',
        title: 'Sorğu emal edildi',
        message: `Müştəri müraciəti "${status}" statusuna keçirildi.`,
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: 'Sorğunun statusunu yeniləmək mümkün olmadı.',
      });
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.customerName || !newRequest.customerPhone || !newRequest.reason) {
      toast({
        type: 'error',
        title: 'Məlumat natamamdır',
        message: 'Bütün sahələri doldurun.',
      });
      return;
    }

    try {
      const created = await securityAuditRepository.createDataSubjectRequest({
        ...newRequest,
        customerId: newRequest.customerId || `cust-${Date.now()}`,
      });
      setSubjectRequests((prev) => [created, ...prev]);
      toast({
        type: 'success',
        title: 'Sorğu qeydiyyata alındı',
        message: 'Müştərinin məlumat sorğusu növbəyə əlavə edildi.',
      });
      setIsNewRequestOpen(false);
      setNewRequest({
        customerId: '',
        customerName: '',
        customerPhone: '',
        requestType: 'anonymize',
        reason: '',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Sorğu yaradılarkən xəta baş verdi.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Məlumatların Mühafizəsi & GDPR' },
        ]}
      />

      <PageHeader
        title="Fərdi Məlumatların Mühafizəsi və Saxlanma Siyasəti"
        description="AR Qanunvericiliyi və GDPR standartlarına uyğun məlumatların saxlanma müddətləri (retention), PII baxış auditi və müştəri unutulma/çıxarış sorğuları."
        badge={
          <Badge variant="neutral" size="sm">
            Hüquqi Uyğunluq (Compliance)
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Yenilə
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsNewRequestOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Yeni Müştəri Sorğusu
            </Button>
          </div>
        }
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
            activeTab === 'requests'
              ? 'bg-foreground text-background shadow-xs'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Müştəri Hüquqları Sorğuları ({subjectRequests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pii_report')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
            activeTab === 'pii_report'
              ? 'bg-foreground text-background shadow-xs'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Həssas Məlumat (PII) Giriş Hesabatı ({piiReports.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('retention')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
            activeTab === 'retention'
              ? 'bg-foreground text-background shadow-xs'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Saxlanma Siyasətləri (Retention Rules)
        </button>
      </div>

      {/* Tab 1: Subject Requests Queue */}
      {activeTab === 'requests' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-3 px-4">Tarix</th>
                  <th className="py-3 px-4">Müştəri</th>
                  <th className="py-3 px-4">Sorğu Tipi</th>
                  <th className="py-3 px-4">Səbəb & Qeyd</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Qərar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subjectRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                      {formatDateTime(req.requestedAt)}
                    </td>
                    <td className="py-3 px-4">
                      <strong className="text-foreground block">{req.customerName}</strong>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {req.customerPhone}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {req.requestType === 'anonymize' ? (
                        <Badge variant="warning" size="sm">
                          Anonimləşdirmə
                        </Badge>
                      ) : req.requestType === 'delete' ? (
                        <Badge variant="danger" size="sm">
                          Məlumatın Silinməsi
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Məlumat Çıxarışı (Export)
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-sm text-foreground">
                      <p>{req.reason}</p>
                      {req.processedBy && (
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          İcra edən: {req.processedBy}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {req.status === 'pending' ? (
                        <Badge variant="neutral" size="sm" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                          Gözləyir
                        </Badge>
                      ) : req.status === 'completed' ? (
                        <Badge variant="success" size="sm">
                          Tamamlandı
                        </Badge>
                      ) : req.status === 'approved' ? (
                        <Badge variant="neutral" size="sm">
                          Təsdiqləndi
                        </Badge>
                      ) : (
                        <Badge variant="danger" size="sm">
                          İmtina Edildi
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleProcessRequest(req.id, 'completed')}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          >
                            İcra Et
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleProcessRequest(req.id, 'rejected')}
                            className="h-7 text-xs text-danger hover:text-danger"
                          >
                            Rədd Et
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px] italic">İcra olunub</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: PII Access Report */}
      {activeTab === 'pii_report' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-3 px-4">Tarix</th>
                  <th className="py-3 px-4">Baxan Əməkdaş</th>
                  <th className="py-3 px-4">Müştəri (Subyekt)</th>
                  <th className="py-3 px-4">Açılmış Həssas Sahələr</th>
                  <th className="py-3 px-4">Baxış Əsası / Səbəb</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {piiReports.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                      {formatDateTime(item.timestamp)}
                    </td>
                    <td className="py-3 px-4">
                      <strong className="text-foreground">{item.viewerName}</strong>
                    </td>
                    <td className="py-3 px-4">
                      <strong className="text-foreground block">{item.customerName}</strong>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        ID: {item.customerId}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {item.fieldsAccessed.map((f) => (
                          <span
                            key={f}
                            className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground">
                      {item.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Retention Policies */}
      {activeTab === 'retention' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {retentionPolicies.map((pol) => (
            <Card key={pol.id}>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="font-bold text-foreground text-sm">{pol.titleAz}</h4>
                  <Badge variant="neutral" size="sm">
                    {pol.entityType}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <span className="text-muted-foreground block">Məcburi Saxlanma Müddəti:</span>
                  <strong className="text-foreground font-mono text-base block">
                    {pol.retentionPeriodDays} gün ({Math.round(pol.retentionPeriodDays / 365)} il)
                  </strong>
                </div>

                <div className="space-y-1">
                  <span className="text-muted-foreground block">Hüquqi Əsas:</span>
                  <p className="text-foreground font-medium">{pol.legalBasis}</p>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Avtomatik anonimləşdirmə:</span>
                  <Badge variant={pol.autoAnonymize ? 'success' : 'neutral'} size="sm">
                    {pol.autoAnonymize ? 'Aktiv' : 'Deaktiv'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      <Modal
        isOpen={isNewRequestOpen}
        onClose={() => setIsNewRequestOpen(false)}
        title="Müştəri Fərdi Məlumat Sorğusu Qeydiyyatı"
        size="md"
      >
        <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-foreground">Müştərinin Tam Adı</label>
            <input
              type="text"
              value={newRequest.customerName}
              onChange={(e) => setNewRequest({ ...newRequest, customerName: e.target.value })}
              placeholder="məs: Günel Əliyeva"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-foreground">Müştərinin Əlaqə Nömrəsi</label>
            <input
              type="text"
              value={newRequest.customerPhone}
              onChange={(e) => setNewRequest({ ...newRequest, customerPhone: e.target.value })}
              placeholder="+994 50 123 45 67"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-foreground">Sorğu Tipi</label>
            <select
              value={newRequest.requestType}
              onChange={(e) =>
                setNewRequest({
                  ...newRequest,
                  requestType: e.target.value as DataSubjectRequest['requestType'],
                })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="anonymize">Anonimləşdirmə (Ad və əlaqə məlumatlarının gizlədilməsi)</option>
              <option value="export">Məlumat Çıxarışı (Bütün alış və loyalıq tarixçəsi çıxarışı)</option>
              <option value="delete">Tam Silinmə (Hesabın və bildiriş razılıqlarının ləğvi)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-foreground">Müraciət Səbəbi və Təfərrüat</label>
            <textarea
              value={newRequest.reason}
              onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
              rows={3}
              placeholder="Müştərinin rəsmi ərizə və ya şifahi müraciət səbəbini daxil edin..."
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsNewRequestOpen(false)}
            >
              İmtina
            </Button>
            <Button type="submit" variant="default" size="sm">
              Növbəyə Əlavə Et
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
