import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  SecurityEvent,
  SecurityEventSeverity,
  SecurityEventStatus,
} from '../types/securityAudit';
import { securityAuditRepository } from '../../../shared/adapters';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  ShieldAlert,
  Search,
  CheckCircle,
  AlertOctagon,
  User,
  RefreshCw,
} from 'lucide-react';

export const SecurityEventsPage: React.FC = () => {
  const { toast } = useToast();

  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);

  // Resolution / Acknowledge Modal
  const [activeEvent, setActiveEvent] = useState<SecurityEvent | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<SecurityEventStatus>('acknowledged');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('Kamran Əliyev');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const data = await securityAuditRepository.getSecurityEvents();
      setEvents(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Təhlükəsizlik hadisələrini yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        ev.actorName.toLowerCase().includes(q) ||
        ev.target.toLowerCase().includes(q) ||
        ev.details.toLowerCase().includes(q) ||
        ev.actorIp.includes(q);

      const matchSeverity =
        severityFilter === 'all' || ev.severity === severityFilter;

      const matchStatus =
        statusFilter === 'all' || ev.status === statusFilter;

      return matchSearch && matchSeverity && matchStatus;
    });
  }, [events, searchQuery, severityFilter, statusFilter]);

  const handleOpenActionModal = (ev: SecurityEvent) => {
    setActiveEvent(ev);
    setResolutionStatus(
      ev.status === 'new'
        ? 'investigating'
        : ev.status === 'investigating'
        ? 'acknowledged'
        : 'resolved'
    );
    setResolutionNotes(ev.resolutionNotes || '');
    setAssignedTo(ev.assignedTo || 'Kamran Əliyev');
  };

  const handleSaveResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent) return;

    setIsUpdating(true);
    try {
      const updated = await securityAuditRepository.updateSecurityEventStatus(
        activeEvent.id,
        resolutionStatus,
        resolutionNotes,
        assignedTo
      );

      setEvents((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e))
      );

      toast({
        type: 'success',
        title: 'Hadisə statusu yeniləndi',
        message: `Hadisə #${updated.id} üçün status "${resolutionStatus}" olaraq qeydə alındı.`,
      });

      setActiveEvent(null);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: 'Hadisə statusunu yadda saxlamaq mümkün olmadı.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getSeverityBadge = (severity: SecurityEventSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <Badge variant="danger" size="sm" className="font-bold flex items-center gap-1">
            <AlertOctagon className="h-3 w-3" />
            Kritik
          </Badge>
        );
      case 'high':
        return (
          <Badge variant="warning" size="sm" className="font-semibold flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            Yüksək
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="neutral" size="sm" className="text-amber-500 border-amber-500/30">
            Orta
          </Badge>
        );
      default:
        return (
          <Badge variant="neutral" size="sm">
            Məlumat
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: SecurityEventStatus) => {
    switch (status) {
      case 'new':
        return (
          <Badge variant="danger" size="sm" className="bg-rose-500/10 text-rose-500 border-rose-500/20">
            Yeni
          </Badge>
        );
      case 'investigating':
        return (
          <Badge variant="warning" size="sm" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
            Araşdırılır
          </Badge>
        );
      case 'acknowledged':
        return (
          <Badge variant="neutral" size="sm" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            Baxıldı
          </Badge>
        );
      case 'resolved':
        return (
          <Badge variant="success" size="sm" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            Həll Olundu
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Təhlükəsizlik və Audit' },
          { label: 'Təhlükəsizlik Hadisələri' },
        ]}
      />

      <PageHeader
        title="Təhlükəsizlik Hadisələri Lövhəsi (Security Events)"
        description="Uğursuz girişlər, hesab bloklanmaları, iş saatından kənar fəaliyyət, qiymət və çek ləğv (void) anomaliyaları üzrə insidentlərin monitorinqi."
        badge={
          <Badge variant="neutral" size="sm">
            {events.length} İnsident Qeydi
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEvents}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Yenilə
          </Button>
        }
      />

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="İcraçı, hədəf, IP və ya təsvir ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Ciddiliklər</option>
              <option value="critical">Kritik</option>
              <option value="high">Yüksək</option>
              <option value="medium">Orta</option>
              <option value="info">Məlumat</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Statuslar</option>
              <option value="new">Yeni</option>
              <option value="investigating">Araşdırılır</option>
              <option value="acknowledged">Baxıldı</option>
              <option value="resolved">Həll Olundu</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">Tarix</th>
                <th className="py-3 px-4">Ciddilik</th>
                <th className="py-3 px-4">Hadisə Növü & İcraçı</th>
                <th className="py-3 px-4">Hədəf Obyekt</th>
                <th className="py-3 px-4">Detallar</th>
                <th className="py-3 px-4">Status & Təyinat</th>
                <th className="py-3 px-4 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                    {formatDateTime(ev.timestamp)}
                  </td>
                  <td className="py-3 px-4">
                    {getSeverityBadge(ev.severity)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-foreground block">
                      {ev.type.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                      <User className="h-3 w-3 shrink-0" />
                      {ev.actorName} ({ev.actorIp})
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-[11px] font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                      {ev.target}
                    </span>
                  </td>
                  <td className="py-3 px-4 max-w-sm text-foreground">
                    <p className="line-clamp-2">{ev.details}</p>
                    {ev.resolutionNotes && (
                      <p className="text-[10px] text-muted-foreground italic mt-1 bg-muted/50 p-1 rounded">
                        Qeyd: {ev.resolutionNotes}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      {getStatusBadge(ev.status)}
                      {ev.assignedTo && (
                        <span className="text-[10px] text-muted-foreground">
                          {ev.assignedTo}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenActionModal(ev)}
                      className="h-7 text-xs"
                    >
                      Cavabla
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolution Modal */}
      <Modal
        isOpen={Boolean(activeEvent)}
        onClose={() => setActiveEvent(null)}
        title="Təhlükəsizlik Hadisəsinin İdarə Edilməsi"
        size="md"
      >
        {activeEvent && (
          <form onSubmit={handleSaveResolution} className="space-y-4 text-xs">
            <div className="p-3 bg-muted/30 rounded-lg space-y-1.5 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hadisə ID:</span>
                <span className="font-mono font-bold text-foreground">#{activeEvent.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">İcraçı & IP:</span>
                <span className="font-semibold text-foreground">{activeEvent.actorName} ({activeEvent.actorIp})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hədəf:</span>
                <span className="font-mono text-foreground">{activeEvent.target}</span>
              </div>
              <div className="pt-1 text-muted-foreground">
                <p className="text-foreground">{activeEvent.details}</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Status</label>
              <select
                value={resolutionStatus}
                onChange={(e) => setResolutionStatus(e.target.value as SecurityEventStatus)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="new">Yeni</option>
                <option value="investigating">Araşdırılır (Investigating)</option>
                <option value="acknowledged">Məlumatlandırıldı (Acknowledged)</option>
                <option value="resolved">Həll Olundu / Əsaslandırıldı (Resolved)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Təyin Edilmiş Məsul Şəxs</label>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Məsul admin və ya təhlükəsizlik mütəxəssisi"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Araşdırma və Həll Qeydləri</label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                placeholder="İnsidentin səbəbi, görülmüş tədbir və ya izahat (məs: müştəri kartında vəsait çatışmadığı üçün ləğv edildi)..."
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveEvent(null)}
              >
                İmtina
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                isLoading={isUpdating}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                Yadda Saxla
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
