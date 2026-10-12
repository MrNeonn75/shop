import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import {
  NotificationItem,
  NotificationCategory,
  NotificationSeverity,
} from '../types/notifications';
import { notificationsRepository } from '../../../shared/adapters';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  CheckCheck,
  Clock,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sliders,
  Settings,
  Layers,
  Search,
  RefreshCw,
} from 'lucide-react';

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  stock: 'Stok & Anbar',
  payment: 'Ödənişlər',
  order: 'Sifarişlər',
  transfer: 'Transferlər',
  cash: 'Kassa & POS',
  approval: 'Təsdiqlər',
  security: 'Təhlükəsizlik',
  system: 'Sistem',
};

export const NotificationsCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByEvent, setGroupByEvent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await notificationsRepository.getNotifications();
      setNotifications(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Bildirişləri yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationsRepository.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast({
        type: 'success',
        title: 'Bütün bildirişlər oxundu',
        message: 'Bütün bildirişlər oxunmuş kimi qeyd edildi.',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Statusu dəyişmək mümkün olmadı.',
      });
    }
  };

  const handleToggleRead = async (id: string, current: boolean) => {
    try {
      if (!current) {
        await notificationsRepository.markAsRead(id);
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: !current } : n))
      );
    } catch {
      // ignore
    }
  };

  const handleSnooze = async (id: string, minutes: number) => {
    try {
      await notificationsRepository.snoozeNotification(id, minutes);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isSnoozed: true } : n))
      );
      toast({
        type: 'info',
        title: 'Bildiriş təxirə salındı',
        message: `Bildiriş ${minutes} dəqiqə müddətinə gizlədildi.`,
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Təxirə salmaq mümkün olmadı.',
      });
    }
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const matchCat =
        selectedCategory === 'all' || n.category === selectedCategory;
      const matchSev =
        selectedSeverity === 'all' || n.severity === selectedSeverity;
      const matchUnread = !unreadOnly || !n.isRead;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q);

      return matchCat && matchSev && matchUnread && matchSearch;
    });
  }, [notifications, selectedCategory, selectedSeverity, unreadOnly, searchQuery]);

  // Grouped items
  const displayGroups = useMemo(() => {
    if (!groupByEvent) {
      return [{ key: 'all', items: filteredNotifications }];
    }
    const map = new Map<string, NotificationItem[]>();
    filteredNotifications.forEach((item) => {
      const key = item.eventKey || item.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }, [filteredNotifications, groupByEvent]);

  const unreadCount = notifications.filter((n) => !n.isRead && !n.isSnoozed).length;

  const getSeverityIcon = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />;
      case 'warning':
        return <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-bh-accent shrink-0" />;
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Bildiriş Mərkəzi' },
        ]}
      />

      <PageHeader
        title="Mərkəzi Bildirişlər və Xəbərdarlıqlar"
        description="Bütün əməliyyat hadisələri, təsdiq sorğuları, kritik anbar və kassa kənarlaşmalarının unifikasiya olunmuş axını."
        badge={
          <Badge variant={unreadCount > 0 ? 'warning' : 'neutral'} size="sm">
            {unreadCount} Oxunmamış Bildiriş
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchNotifications}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Yenilə
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/notifications/preferences')}
            >
              <Settings className="h-4 w-4 mr-1.5" />
              Kanal Tənzimləmələri
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/alert-rules')}
            >
              <Sliders className="h-4 w-4 mr-1.5" />
              Xəbərdarlıq Qaydaları (Alert Rules)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Hamısını Oxunmuş Qeyd Et
            </Button>
          </div>
        }
      />

      {/* Filter & Grouping Toolbar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Başlıq və ya məzmun ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none bg-muted/30 px-2.5 py-1.5 rounded-md border border-input">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              <span className="text-foreground font-medium">Yalnız Oxunmamış</span>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none bg-muted/30 px-2.5 py-1.5 rounded-md border border-input">
              <input
                type="checkbox"
                checked={groupByEvent}
                onChange={(e) => setGroupByEvent(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              <Layers className="h-3.5 w-3.5 text-bh-accent" />
              <span className="text-foreground font-medium">Qruplaşdır</span>
            </label>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Kateqoriyalar</option>
              {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
                <option key={catKey} value={catKey}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Bütün Ciddiliklər</option>
              <option value="critical">Kritik</option>
              <option value="warning">Xəbərdarlıq</option>
              <option value="info">Məlumat</option>
              <option value="success">Uğurlu</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Stream */}
      <div className="space-y-4">
        {displayGroups.map((group) => (
          <div key={group.key} className="space-y-2">
            {groupByEvent && group.key !== 'all' && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Qrup: {group.key}
                </span>
                <Badge variant="neutral" size="sm">
                  {group.items.length} Hadisə
                </Badge>
              </div>
            )}

            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              {group.items.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Seçilmiş filtrlərə uyğun bildiriş tapılmadı.
                </div>
              ) : (
                group.items.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 flex flex-col sm:flex-row items-start justify-between gap-3 transition-colors ${
                      !item.isRead ? 'bg-bh-accent/5' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-0.5">{getSeverityIcon(item.severity)}</div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong
                            className={`text-xs ${
                              !item.isRead ? 'font-bold text-foreground' : 'text-foreground/90 font-medium'
                            }`}
                          >
                            {item.title}
                          </strong>
                          <Badge variant="neutral" size="sm" className="text-[10px] px-1.5 py-0">
                            {CATEGORY_LABELS[item.category] || item.category}
                          </Badge>
                          {!item.isRead && (
                            <span className="h-1.5 w-1.5 rounded-full bg-bh-accent inline-block" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.message}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono pt-1">
                          <span>{formatDateTime(item.timestamp)}</span>
                          {item.correlationId && (
                            <span className="text-bh-accent font-semibold">
                              #{item.correlationId}
                            </span>
                          )}
                          {item.isSnoozed && (
                            <span className="text-amber-500 italic">
                              (Təxirə salınıb)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {item.linkUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(item.linkUrl!)}
                          className="h-7 text-xs flex items-center gap-1"
                        >
                          Sənədi Aç
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSnooze(item.id, 60)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title="1 saat təxirə sal"
                      >
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        1 saat
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleRead(item.id, item.isRead)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title={item.isRead ? 'Oxunmamış qeyd et' : 'Oxunmuş qeyd et'}
                      >
                        {item.isRead ? 'Oxunmayıb' : 'Oxundu'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
