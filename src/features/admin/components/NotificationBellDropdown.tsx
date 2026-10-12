import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../components/ui/DropdownMenu';
import { Badge } from '../../../components/ui/Badge';
import { notificationsRepository } from '../../../shared/adapters';
import { NotificationItem, NotificationCategory } from '../types/notifications';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  Bell,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Boxes,
  Truck,
  DollarSign,
  Info,
} from 'lucide-react';

export const NotificationBellDropdown: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchNotifs = async () => {
    try {
      const items = await notificationsRepository.getNotifications();
      setNotifications(items);
    } catch {
      // ignore in UI
    }
  };

  useEffect(() => {
    fetchNotifs();
    // Simulate lightweight polling fallback every 30s
    const timer = setInterval(fetchNotifs, 30000);
    return () => clearInterval(timer);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    await notificationsRepository.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await notificationsRepository.markAsRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
    }
    setIsOpen(false);
    if (notif.linkUrl) {
      navigate(notif.linkUrl);
    }
  };

  const getCategoryIcon = (cat: NotificationCategory) => {
    switch (cat) {
      case 'stock':
        return <Boxes className="h-4 w-4 text-amber-500" />;
      case 'approval':
        return <CheckCircle2 className="h-4 w-4 text-indigo-500" />;
      case 'transfer':
        return <Truck className="h-4 w-4 text-blue-500" />;
      case 'security':
        return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      case 'cash':
      case 'payment':
        return <DollarSign className="h-4 w-4 text-emerald-500" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Bildirişlər"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-danger" />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 shadow-lg border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Bildirişlər</span>
            {unreadCount > 0 && (
              <Badge variant="danger" size="sm" className="text-[10px] px-1.5 py-0">
                {unreadCount} yeni
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Hamısını oxunmuş et
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Yeni bildiriş yoxdur.
            </div>
          ) : (
            notifications.slice(0, 6).map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`p-3 text-xs flex gap-2.5 hover:bg-muted/40 cursor-pointer transition-colors ${
                  !notif.isRead ? 'bg-bh-accent/5 font-medium' : ''
                }`}
              >
                <div className="shrink-0 mt-0.5">{getCategoryIcon(notif.category)}</div>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-semibold text-foreground text-xs">{notif.title}</p>
                    {!notif.isRead && (
                      <span className="h-1.5 w-1.5 rounded-full bg-bh-accent shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
                    {notif.message}
                  </p>
                  <span className="text-[10px] text-muted-foreground/80 block pt-0.5">
                    {formatDateTime(notif.timestamp)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-border bg-muted/20 text-center">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              navigate('/notifications');
            }}
            className="text-xs text-bh-accent hover:underline font-semibold inline-flex items-center gap-1"
          >
            <span>Bütün bildirişləri aç</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
