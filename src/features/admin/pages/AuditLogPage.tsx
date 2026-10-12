import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Drawer } from '../../../components/ui/Drawer';
import { useToast } from '../../../components/ui/useToast';
import {
  AuditLogEntryExtended,
  SavedAuditView,
} from '../types/securityAudit';
import { securityAuditRepository } from '../../../shared/adapters';
import { formatDateTime } from '../../../shared/utils/formatters';
import { AuditDiffModal } from '../components/AuditDiffModal';
import { EntityAuditTimelineModal } from '../components/EntityAuditTimelineModal';
import {
  Download,
  Search,
  Eye,
  Link as LinkIcon,
  Clock,
  ShieldAlert,
  SlidersHorizontal,
  RefreshCw,
} from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const { toast } = useToast();

  const [logs, setLogs] = useState<AuditLogEntryExtended[]>([]);
  const [savedViews, setSavedViews] = useState<SavedAuditView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>('v-1');

  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [correlationFilter, setCorrelationFilter] = useState('');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  // Modals
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntryExtended | null>(null);
  const [diffModalEntry, setDiffModalEntry] = useState<AuditLogEntryExtended | null>(null);
  const [timelineEntity, setTimelineEntity] = useState<{
    type: string;
    id: string;
    name: string;
  } | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await securityAuditRepository.getAuditLogs();
      setLogs(data);
      const views = await securityAuditRepository.getSavedAuditViews();
      setSavedViews(views);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Audit qeydlərini yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleApplyView = (view: SavedAuditView) => {
    setActiveViewId(view.id);
    if (view.id === 'v-1') {
      setModuleFilter('all');
      setSensitiveOnly(false);
      setSearchQuery('');
    } else if (view.id === 'v-2') {
      setModuleFilter('all');
      setSensitiveOnly(true);
      setSearchQuery('');
    } else if (view.module) {
      setModuleFilter(view.module);
      setSensitiveOnly(Boolean(view.isSensitiveOnly));
      setSearchQuery('');
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        log.userName.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.ipAddress.includes(q) ||
        (log.entityId && log.entityId.toLowerCase().includes(q));

      const matchModule =
        moduleFilter === 'all' || log.module.startsWith(moduleFilter);

      const matchCorrelation =
        !correlationFilter || log.correlationId === correlationFilter;

      const matchSensitive = !sensitiveOnly || Boolean(log.isSensitive);

      return matchSearch && matchModule && matchCorrelation && matchSensitive;
    });
  }, [logs, searchQuery, moduleFilter, correlationFilter, sensitiveOnly]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { dataUri, filename } = await securityAuditRepository.exportAuditLogs(
        { searchQuery, moduleFilter, correlationFilter, sensitiveOnly },
        'Audit Administratoru'
      );

      const link = document.createElement('a');
      link.href = dataUri;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        type: 'success',
        title: 'Audit jurnalı ixrac edildi',
        message: 'CSV faylı uğurla endirildi və ixrac faktı audit qeydlərinə yazıldı.',
      });

      // Refresh to show the export audit event
      await fetchLogs();
    } catch {
      toast({
        type: 'error',
        title: 'İxrac xətası',
        message: 'Faylın ixracı zamanı xəta baş verdi.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Audit Jurnalı' },
        ]}
      />

      <PageHeader
        title="Təhlükəsizlik və İmmutable Audit Jurnalı"
        description="Sistem daxilində baş vermiş bütün kritik əməliyyatların, konfiqurasiya dəyişikliklərinin və istifadəçi addımlarının dəyişdirilməz (read-only) tam tarixçəsi."
        badge={
          <Badge variant="neutral" size="sm">
            {logs.length} Hadisə Qeydi
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={isLoading}
              title="Yenilə"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleExport}
              isLoading={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              CSV İxrac Et (Logged)
            </Button>
          </div>
        }
      />

      {/* Saved Views Toolbar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0 flex items-center gap-1.5 mr-1">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Saxlanılmış Baxışlar:
        </span>
        {savedViews.map((view) => {
          const isActive = activeViewId === view.id;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => handleApplyView(view)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
                isActive
                  ? 'bg-foreground text-background border-foreground font-semibold shadow-xs'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
              }`}
            >
              {view.isSensitiveOnly && <ShieldAlert className="h-3 w-3 text-warning" />}
              {view.name}
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="İstifadəçi, IP, entity ID və ya qeyd ilə axtar..."
                className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {correlationFilter && (
              <div className="flex items-center gap-1 bg-bh-accent/10 text-bh-accent border border-bh-accent/30 px-2.5 py-1 rounded-md text-xs font-mono">
                <LinkIcon className="h-3 w-3" />
                <span>{correlationFilter}</span>
                <button
                  type="button"
                  onClick={() => setCorrelationFilter('')}
                  className="ml-1 text-bh-accent hover:text-foreground font-bold"
                  title="Filtrləməni ləğv et"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none bg-muted/40 px-2.5 py-1.5 rounded-md border border-input">
              <input
                type="checkbox"
                checked={sensitiveOnly}
                onChange={(e) => setSensitiveOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              <span className="text-foreground font-medium">Həssas Hadisələr</span>
            </label>

            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setActiveViewId('custom');
              }}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Modullar</option>
              <option value="admin">Administrasiya (admin)</option>
              <option value="pos">POS & Kassa (pos)</option>
              <option value="inventory">Anbar & Transfer (inventory)</option>
              <option value="finance">Maliyyə (finance)</option>
              <option value="hr">İnsan Resursları (hr)</option>
              <option value="crm">Müştəri & Loyallıq (crm)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">Tarix və Saat</th>
                <th className="py-3 px-4">İstifadəçi</th>
                <th className="py-3 px-4">Modul / Əməliyyat</th>
                <th className="py-3 px-4">Obyekt (Entity)</th>
                <th className="py-3 px-4">Qeyd & Korrelyasiya</th>
                <th className="py-3 px-4 text-right">Təftiş & Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-muted/40 transition-colors group"
                >
                  <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                    {formatDateTime(entry.timestamp)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-bh-accent text-bh-accent-foreground font-bold text-[10px] shrink-0">
                        {entry.userName.charAt(0)}
                      </div>
                      <div>
                        <strong className="text-foreground block">{entry.userName}</strong>
                        <span className="text-[10px] text-muted-foreground">{entry.userRole}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                        {entry.action}
                      </span>
                      {entry.isSensitive && (
                        <Badge variant="warning" size="sm" className="text-[9px] px-1 py-0">
                          Həssas
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {entry.module} • {entry.branchName}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {entry.entityId ? (
                      <button
                        type="button"
                        onClick={() =>
                          setTimelineEntity({
                            type: entry.entityType || 'entity',
                            id: entry.entityId || '',
                            name: entry.details,
                          })
                        }
                        className="font-mono text-[11px] text-bh-accent hover:underline flex items-center gap-1 font-semibold"
                        title="Obyektin tam xronologiyasına bax"
                      >
                        <Clock className="h-3 w-3" />
                        {entry.entityId}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-foreground max-w-sm">
                    <div className="truncate">{entry.details}</div>
                    {entry.correlationId && (
                      <button
                        type="button"
                        onClick={() => setCorrelationFilter(entry.correlationId || '')}
                        className="text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5"
                        title="Eyni əməliyyat zəncirini filtrlə"
                      >
                        <LinkIcon className="h-2.5 w-2.5" />
                        {entry.correlationId}
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {entry.fieldDiffs && entry.fieldDiffs.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDiffModalEntry(entry)}
                          className="h-7 px-2 text-xs text-bh-accent hover:text-bh-accent-hover font-medium"
                          title="Sahə səviyyəsində fərqə (diff) bax"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Diff ({entry.fieldDiffs.length})
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEntry(entry)}
                        className="h-7 px-2 text-xs text-muted-foreground group-hover:text-foreground"
                        title="Audit hadisəsinin detallı JSON görünüşü"
                      >
                        Detallar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Field-level Diff Modal */}
      <AuditDiffModal
        isOpen={Boolean(diffModalEntry)}
        onClose={() => setDiffModalEntry(null)}
        entry={diffModalEntry}
      />

      {/* Entity Timeline Modal */}
      {timelineEntity && (
        <EntityAuditTimelineModal
          isOpen={Boolean(timelineEntity)}
          onClose={() => setTimelineEntity(null)}
          entityType={timelineEntity.type}
          entityId={timelineEntity.id}
          entityName={timelineEntity.name}
          timeline={logs.filter((l) => l.entityId === timelineEntity.id)}
        />
      )}

      {/* Detail Drawer with Before / After JSON Diff */}
      <Drawer
        isOpen={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title="Audit Hadisəsinin Detalları"
        size="lg"
      >
        {selectedEntry && (
          <div className="space-y-6">
            {/* Meta Card */}
            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hadisə ID:</span>
                <span className="font-mono font-bold text-foreground">{selectedEntry.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">İcraçı Əməkdaş:</span>
                <strong className="text-foreground">{selectedEntry.userName} ({selectedEntry.userRole})</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Filial:</span>
                <span className="text-foreground font-medium">{selectedEntry.branchName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">IP Ünvanı:</span>
                <span className="font-mono text-foreground">{selectedEntry.ipAddress}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Korrelyasiya ID:</span>
                <span className="font-mono text-bh-accent">{selectedEntry.correlationId || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tarix:</span>
                <span className="font-mono text-foreground">{formatDateTime(selectedEntry.timestamp)}</span>
              </div>
              <div className="pt-2 border-t border-border">
                <span className="text-muted-foreground block mb-0.5">Məzmun:</span>
                <p className="text-foreground font-medium">{selectedEntry.details}</p>
              </div>
            </div>

            {/* Before vs After JSON Diff Comparison */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Məlumat Dəyişikliyi Müqayisəsi (Raw Payload)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Before (Previous State) */}
                <div className="rounded-xl border border-danger/30 bg-card overflow-hidden">
                  <div className="px-3 py-2 bg-danger/10 border-b border-danger/20 text-xs font-bold text-danger flex items-center justify-between">
                    <span>ƏVVƏLKİ VƏZİYYƏT (BEFORE)</span>
                    <span className="text-[10px] font-mono">Status: Old</span>
                  </div>
                  <pre className="p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-64">
                    {selectedEntry.beforeJson
                      ? JSON.stringify(selectedEntry.beforeJson, null, 2)
                      : '// Əvvəlki vəziyyət mövcud deyil (Yeni qeyd yaradılıb)'}
                  </pre>
                </div>

                {/* After (New State) */}
                <div className="rounded-xl border border-success/30 bg-card overflow-hidden">
                  <div className="px-3 py-2 bg-success/10 border-b border-success/20 text-xs font-bold text-success flex items-center justify-between">
                    <span>YENİ VƏZİYYƏT (AFTER)</span>
                    <span className="text-[10px] font-mono">Status: New</span>
                  </div>
                  <pre className="p-3 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-64">
                    {selectedEntry.afterJson
                      ? JSON.stringify(selectedEntry.afterJson, null, 2)
                      : '// Silinmə əməliyyatı icra olunub və ya fərq yoxdur'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEntry(null)}
              >
                Bağla
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
