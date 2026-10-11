import React, { useState, useMemo } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Drawer } from '../../../components/ui/Drawer';
import { useToast } from '../../../components/ui/useToast';
import { useExportCsv } from '../../../shared/hooks/useExportCsv';
import { MOCK_AUDIT_LOGS, AuditLogEntry } from '../../../shared/adapters/mock/adminMockData';
import { formatDateTime } from '../../../shared/utils/formatters';
import { Download, Search, Eye } from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const { toast } = useToast();
  const { exportToCsv } = useExportCsv<AuditLogEntry>();

  const [logs] = useState<AuditLogEntry[]>(MOCK_AUDIT_LOGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.ipAddress.includes(searchQuery);

      const matchModule = moduleFilter === 'all' || log.module.startsWith(moduleFilter);

      return matchSearch && matchModule;
    });
  }, [logs, searchQuery, moduleFilter]);

  const handleExport = () => {
    exportToCsv(filteredLogs, {
      filename: `brand_house_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`,
      columns: [
        { header: 'Tarix və Saat', accessor: (row) => formatDateTime(row.timestamp) },
        { header: 'İstifadəçi', accessor: 'userName' },
        { header: 'Rol', accessor: 'userRole' },
        { header: 'Modul', accessor: 'module' },
        { header: 'Əməliyyat (Action)', accessor: 'action' },
        { header: 'Filial', accessor: 'branchName' },
        { header: 'IP Ünvanı', accessor: 'ipAddress' },
        { header: 'Ətraflı Qeyd', accessor: 'details' },
      ],
    });

    toast({
      type: 'success',
      title: 'Audit jurnalı ixrac edildi',
      message: 'Fayl CSV formatında (UTF-8 BOM ilə) uğurla endirildi.',
    });
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
        title="Təhlükəsizlik və Audit Jurnalı"
        description="Sistem daxilində baş vermiş bütün kritik əməliyyatların, konfiqurasiya dəyişikliklərinin və istifadəçi addımlarının tam tarixçəsi."
        badge={
          <Badge variant="neutral" size="sm">
            {logs.length} Hadisə Qeydi
          </Badge>
        }
        actions={
          <Button variant="default" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            CSV Formatında İxrac Et
          </Button>
        }
      />

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="İstifadəçi, IP, əməliyyat və ya qeyd ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-muted-foreground">Modul:</span>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Modullar</option>
              <option value="admin">Administrasiya (admin)</option>
              <option value="pos">POS & Kassa (pos)</option>
              <option value="inventory">Anbar & Transfer (inventory)</option>
              <option value="finance">Maliyyə (finance)</option>
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
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4">Qeyd</th>
                <th className="py-3 px-4 text-right">Detallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className="hover:bg-muted/40 transition-colors cursor-pointer group"
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
                    <span className="font-mono text-[11px] font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                      {entry.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {entry.module}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {entry.branchName}
                  </td>
                  <td className="py-3 px-4 text-foreground max-w-sm truncate">
                    {entry.details}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground group-hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Diff
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
                Məlumat Dəyişikliyi Müqayisəsi (JSON Diff)
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
                      : '// Silinmə əməliyyatı icra olunub'}
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
