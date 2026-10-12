import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Clock,
  Search,
  RefreshCw,
} from 'lucide-react';
import { hrRepository } from '../../../shared/adapters';
import { HrAuditLogEntry, HrAuditAction } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/useToast';

const ACTION_LABELS: Record<HrAuditAction, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  reveal_salary: { label: 'Maaş Məlumatına Baxış', variant: 'danger' },
  reveal_personal: { label: 'Şəxsi Fərdi Məlumata Baxış', variant: 'warning' },
  export_payroll: { label: 'Əməkhaqqı Faylı İxrac', variant: 'default' },
  export_employees: { label: 'İşçi Siyahısı İxrac', variant: 'outline' },
  offboard_employee: { label: 'İşdən Azad Etmə', variant: 'danger' },
  manual_attendance: { label: 'Manual Davamiyyət', variant: 'outline' },
  schedule_publish: { label: 'Qrafik Dərc Edilməsi', variant: 'success' },
  payroll_finalize: { label: 'Maaş Cədvəlinin Kilidlənməsi', variant: 'default' },
};

export const HrPrivacyPage: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<HrAuditLogEntry[]>([]);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const logList = await hrRepository.getAuditLogs();
      setLogs(logList);
    } catch {
      toast({
        title: 'Xəta',
        description: 'Audit qeydləri yüklənərkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (
      search &&
      !l.userName.toLowerCase().includes(search.toLowerCase()) &&
      !l.details.toLowerCase().includes(search.toLowerCase()) &&
      !(l.targetEmployeeName && l.targetEmployeeName.toLowerCase().includes(search.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Fərdi Məlumatların Məxfiliyi və Audit Jurnalı
          </h1>
          <p className="text-text-secondary text-sm">
            Həssas maaş və kadr məlumatlarına icazəli baxışların tam qeydiyyatı və arxiv qaydaları
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadLogs}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" />
          Yenilə
        </Button>
      </div>

      {/* Legal Data Protection Banner */}
      <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/20 text-primary rounded-lg flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-text-primary text-sm">
              AR Qanunvericiliyinə Uyğun Fərdi Məlumatların Qorunması və Minimal Toplanma Prinsipləri
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Azərbaycan Respublikasının <strong>"Fərdi məlumatlar haqqında" Qanununa</strong> və{' '}
              <strong>Əmək Məcəlləsinin 87-ci maddəsinə</strong> uyğun olaraq, işçilərin şəxsi və
              maliyyə rekvizitləri (FİN kod, şəxsiyyət vəsiqəsi nömrəsi, əməkhaqqı məbləğləri, bank
              IBAN) defolt olaraq maskalanır (••••••). Yalnız xüsusi səlahiyyətli istifadəçilər{' '}
              (<code className="text-primary font-mono">hr.salary.view</code>) məlumatı aça bilər.
              Hər bir ifşa əməliyyatı dərhal aşağıdakı audit reyestrinə daxil edilir.
            </p>
            <div className="flex items-center gap-2 pt-1 text-xs text-text-primary font-medium">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>Sənədlərin qanuni arxivdə saxlanma müddəti: <strong>5 il</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              placeholder="İstifadəçi, əməkdaş və ya təfərrüat axtar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-surface-card border border-border-default rounded-lg text-sm text-text-primary focus:outline-none"
            />
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-surface-card border border-border-default rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none"
          >
            <option value="all">Bütün Əməliyyatlar</option>
            {Object.entries(ACTION_LABELS).map(([action, meta]) => (
              <option key={action} value={action}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-text-secondary">
          Cəmi {filteredLogs.length} audit hadisəsi
        </span>
      </div>

      {/* Audit Log Table */}
      <Card className="p-0 overflow-hidden bg-surface-card border-border-default">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-hover/50 text-text-secondary text-xs uppercase border-b border-border-default">
              <tr>
                <th className="py-3 px-4">Tarix və Saat</th>
                <th className="py-3 px-4">İstifadəçi</th>
                <th className="py-3 px-4">Əməliyyat</th>
                <th className="py-3 px-4">Hədəf Əməkdaş</th>
                <th className="py-3 px-4">Təfərrüat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-secondary">
                    Audit qeydi tapılmadı.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const meta = ACTION_LABELS[log.action] || {
                    label: log.action,
                    variant: 'neutral',
                  };
                  return (
                    <tr key={log.id} className="hover:bg-surface-hover/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                        {log.timestamp.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-3 px-4 font-medium text-text-primary text-xs">
                        {log.userName}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={meta.variant} className="text-[10px]">
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-text-primary">
                        {log.targetEmployeeName || '-'}
                      </td>
                      <td className="py-3 px-4 text-xs text-text-secondary">
                        {log.details}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
