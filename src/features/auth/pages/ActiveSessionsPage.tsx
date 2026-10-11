import React, { useState } from 'react';
import { Laptop, Smartphone, ShieldCheck, MapPin, Globe, Clock, Trash2 } from 'lucide-react';
import { useSessionStore, UserSessionDevice } from '../../../shared/stores/sessionStore';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/useToast';
import { formatDateTime } from '../../../shared/utils/formatters';

export const ActiveSessionsPage: React.FC = () => {
  const { activeSessions, revokeSession, revokeAllOtherSessions, user } = useSessionStore();
  const { toast } = useToast();

  const [sessionToRevoke, setSessionToRevoke] = useState<UserSessionDevice | null>(null);
  const [isRevokeAllOpen, setIsRevokeAllOpen] = useState(false);

  const handleRevokeSingle = () => {
    if (!sessionToRevoke) return;
    revokeSession(sessionToRevoke.id);
    toast({
      type: 'success',
      title: 'Sessiya sonlandırıldı',
      message: `${sessionToRevoke.deviceName} cihazının sistemə girişi ləğv edildi.`,
    });
    setSessionToRevoke(null);
  };

  const handleRevokeAllOthers = () => {
    revokeAllOtherSessions();
    toast({
      type: 'success',
      title: 'Bütün digər sessiyalar sonlandırıldı',
      message: 'Cari cihazınızdan başqa bütün açıq sessiyalar qapadıldı.',
    });
    setIsRevokeAllOpen(false);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Təhlükəsizlik və Sessiyalar' },
        ]}
      />

      <PageHeader
        title="Aktiv Sessiyalar və Cihazlar"
        description="Hesabınıza daxil olmuş aktiv cihazların siyahısı, coğrafi məkanı və təhlükəsizlik idarəetməsi."
        badge={
          <Badge variant="neutral" size="sm">
            {activeSessions.length} Aktiv Cihaz
          </Badge>
        }
        actions={
          activeSessions.length > 1 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRevokeAllOpen(true)}
              className="text-danger hover:text-danger hover:border-danger/40"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Digər Bütün Sessiyaları Bağla
            </Button>
          ) : undefined
        }
      />

      {/* Security Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />
              <CardTitle className="text-base font-semibold">
                Hesab Qorunması & Sessiya Monitorinqi
              </CardTitle>
            </div>
            <Badge variant="success" size="sm">
              Təhlükəsiz
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Hesab: <strong className="text-foreground">{user?.name}</strong> ({user?.email}) — Əgər yad bir cihaz və ya tanımadığınız IP ünvanı görsəniz, həmin sessiyanı dərhal sonlandırın və şifrənizi dəyişin.
          </p>
        </CardContent>
      </Card>

      {/* Devices Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {activeSessions.map((session) => {
          const isMobile = session.deviceName.toLowerCase().includes('zebra') || session.deviceName.toLowerCase().includes('phone');

          return (
            <Card
              key={session.id}
              className={`relative transition-all ${
                session.isCurrent ? 'border-foreground shadow-sm bg-card' : 'border-border'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-muted text-foreground">
                      {isMobile ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {session.deviceName}
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        {session.browser}
                      </p>
                    </div>
                  </div>

                  {session.isCurrent ? (
                    <Badge variant="default" size="sm" className="text-[10px]">
                      Cari Cihaz
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSessionToRevoke(session)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-danger"
                      title="Sessiyanı sonlandır"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-2 text-xs pt-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{session.location}</span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono text-[11px]">{session.ipAddress}</span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {session.isCurrent ? (
                      <span className="text-success font-medium">İndi aktivdir</span>
                    ) : (
                      formatDateTime(session.lastActiveAt)
                    )}
                  </span>
                </div>

                <div className="pt-2 border-t border-border mt-3 text-[11px] text-muted-foreground">
                  Əməliyyat sistemi: <span className="font-medium text-foreground">{session.os}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revoke Single Session Dialog */}
      <ConfirmDialog
        isOpen={Boolean(sessionToRevoke)}
        onClose={() => setSessionToRevoke(null)}
        onConfirm={handleRevokeSingle}
        title="Sessiyanı sonlandırmaq istəyirsiniz?"
        description={`"${sessionToRevoke?.deviceName}" (${sessionToRevoke?.ipAddress}) cihazından dərhal çıxış ediləcək və istifadəçi yenidən şifrə daxil etməli olacaq.`}
        confirmText="Sessiyanı Bağla"
        cancelText="İmtina"
        variant="danger"
      />

      {/* Revoke All Others Dialog */}
      <ConfirmDialog
        isOpen={isRevokeAllOpen}
        onClose={() => setIsRevokeAllOpen(false)}
        onConfirm={handleRevokeAllOthers}
        title="Bütün digər sessiyalar sonlandırılsın?"
        description="Cari işlədiyiniz bu brauzerdən başqa, bütün digər cihaz və POS terminallardakı sessiyalar təhlükəsizlik məqsədilə qapadılacaq."
        confirmText="Bütün Digərlərini Bağla"
        cancelText="İmtina"
        variant="danger"
      />
    </div>
  );
};
