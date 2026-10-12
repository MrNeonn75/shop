import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { SecuritySettings } from '../types/securityAudit';
import { securityAuditRepository } from '../../../shared/adapters';
import { ROLE_LABELS, UserRole } from '../../../shared/utils/permissions';
import {
  KeyRound,
  Shield,
  Clock,
  Globe,
  Save,
  AlertTriangle,
  Smartphone,
  RefreshCw,
} from 'lucide-react';

export const SecuritySettingsPage: React.FC = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newIpInput, setNewIpInput] = useState('');

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const data = await securityAuditRepository.getSecuritySettings();
      setSettings(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Təhlükəsizlik parametrlərini yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSaving(true);
    try {
      const updated = await securityAuditRepository.updateSecuritySettings(settings);
      setSettings(updated);
      toast({
        type: 'success',
        title: 'Təhlükəsizlik parametrləri yeniləndi',
        message: 'Bütün siyasət qaydaları sistem üzrə tətbiq edildi.',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: 'Parametrləri yadda saxlamaq mümkün olmadı.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle2FaRole = (role: UserRole) => {
    if (!settings) return;
    const exists = settings.twoFactorPolicy.requiredRoles.includes(role);
    const updatedRoles = exists
      ? settings.twoFactorPolicy.requiredRoles.filter((r) => r !== role)
      : [...settings.twoFactorPolicy.requiredRoles, role];

    setSettings({
      ...settings,
      twoFactorPolicy: {
        ...settings.twoFactorPolicy,
        requiredRoles: updatedRoles,
      },
    });
  };

  const handleAddIp = () => {
    if (!settings || !newIpInput.trim()) return;
    if (settings.ipAllowList.includes(newIpInput.trim())) {
      toast({
        type: 'warning',
        title: 'Mövcuddur',
        message: 'Bu IP artıq siyahıdadır.',
      });
      return;
    }
    setSettings({
      ...settings,
      ipAllowList: [...settings.ipAllowList, newIpInput.trim()],
    });
    setNewIpInput('');
  };

  const handleRemoveIp = (ip: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      ipAllowList: settings.ipAllowList.filter((item) => item !== ip),
    });
  };

  if (isLoading || !settings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Təhlükəsizlik Siyasəti' },
        ]}
      />

      <PageHeader
        title="Təhlükəsizlik və Giriş Siyasəti"
        description="Şifrə mürəkkəbliyi, iki faktorlu autentifikasiya (2FA), sessiya vaxtı və IP məhdudiyyətləri siyasətləri."
        badge={
          <Badge variant="neutral" size="sm">
            Təhlükəsizlik Şurası
          </Badge>
        }
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            Parametrləri Yadda Saxla
          </Button>
        }
      />

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Password Policy */}
        <Card>
          <CardContent className="p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <KeyRound className="h-4 w-4 text-bh-accent" />
              <h3 className="font-bold text-sm text-foreground">
                Şifrə Siyasəti (Password Policy)
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Minimum Simvol Sayı</label>
                <input
                  type="number"
                  min="6"
                  max="32"
                  value={settings.passwordPolicy.minLength}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      passwordPolicy: {
                        ...settings.passwordPolicy,
                        minLength: parseInt(e.target.value) || 8,
                      },
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Şifrənin Qüvvədəolma Müddəti (gün)</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.passwordPolicy.expiryDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      passwordPolicy: {
                        ...settings.passwordPolicy,
                        expiryDays: parseInt(e.target.value) || 90,
                      },
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.passwordPolicy.requireUppercase}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      passwordPolicy: {
                        ...settings.passwordPolicy,
                        requireUppercase: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-foreground">Böyük hərflər tələb olunsun (A-Z)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.passwordPolicy.requireNumbers}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      passwordPolicy: {
                        ...settings.passwordPolicy,
                        requireNumbers: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-foreground">Rəqəmlər tələb olunsun (0-9)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.passwordPolicy.requireSymbols}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      passwordPolicy: {
                        ...settings.passwordPolicy,
                        requireSymbols: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-foreground">Xüsusi simvollar tələb olunsun (!@#$%)</span>
              </label>
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-muted-foreground">Təkrar istifadə qadağası (Son N şifrə):</span>
              <span className="font-mono font-bold text-foreground">{settings.passwordPolicy.historyCount} şifrə</span>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Two-Factor Authentication (2FA) */}
        <Card>
          <CardContent className="p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Smartphone className="h-4 w-4 text-bh-accent" />
              <h3 className="font-bold text-sm text-foreground">
                İki Faktorlu Autentifikasiya (2FA / TOTP)
              </h3>
            </div>

            {/* 2FA Provider Status Alert */}
            {!settings.twoFactorPolicy.totpSupported ? (
              <div className="flex items-start gap-3 p-3.5 bg-muted/40 border border-border rounded-xl text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <div>
                  <strong className="block font-semibold text-foreground">
                    Status: Dəstəklənmir
                  </strong>
                  {settings.twoFactorPolicy.defaultStatusText}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3.5 bg-success/10 border border-success/30 rounded-xl text-success">
                <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Status: Aktiv</strong>
                  TOTP Google Authenticator & Microsoft Authenticator dəstəklənir.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="font-semibold text-foreground block">
                2FA Tələb Olunan Rollar (Məcburi):
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(ROLE_LABELS).map(([roleKey, roleName]) => {
                  const isChecked = settings.twoFactorPolicy.requiredRoles.includes(roleKey as UserRole);
                  return (
                    <label
                      key={roleKey}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-foreground bg-muted/30 font-medium text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted/20'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggle2FaRole(roleKey as UserRole)}
                        className="h-3.5 w-3.5 rounded border-input"
                      />
                      <span className="truncate">{roleName}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between text-muted-foreground">
              <span>Ehtiyat bərpa kodlarının sayı:</span>
              <span className="font-mono font-bold text-foreground">
                {settings.twoFactorPolicy.recoveryCodesCount} kod
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Sessions & Lockout Policy */}
        <Card>
          <CardContent className="p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Clock className="h-4 w-4 text-bh-accent" />
              <h3 className="font-bold text-sm text-foreground">
                Sessiya və Bloklanma Qaydaları
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Sessiya Vaxtı (dəqiqə)</label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={settings.sessionTimeoutMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      sessionTimeoutMinutes: parseInt(e.target.value) || 30,
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Hərəkətsizlikdən sonra avtomatik çıxış.
                </span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Paralel Sessiya Limiti</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.concurrentSessionLimit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      concurrentSessionLimit: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Eyni istifadəçi üçün eyni anda aktiv cihazlar.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Maksimum Yanlış Giriş Cəhdi</label>
                <input
                  type="number"
                  min="3"
                  max="10"
                  value={settings.maxLoginAttempts}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxLoginAttempts: parseInt(e.target.value) || 5,
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Bloklanma Müddəti (dəqiqə)</label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={settings.lockoutDurationMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      lockoutDurationMinutes: parseInt(e.target.value) || 15,
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: IP Allow-list */}
        <Card>
          <CardContent className="p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Globe className="h-4 w-4 text-bh-accent" />
              <h3 className="font-bold text-sm text-foreground">
                İcazəli IP Ünvanları (Allow-List)
              </h3>
            </div>

            <p className="text-muted-foreground">
              Yalnız göstərilən filial və ofis alt-şəbəkələrindən sistemə daxil olmağa icazə verilir. Boş buraxıldıqda bütün IP-lər açıqdır.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={newIpInput}
                onChange={(e) => setNewIpInput(e.target.value)}
                placeholder="məs: 192.168.1.0/24 və ya 85.132.50.2"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddIp}>
                Əlavə Et
              </Button>
            </div>

            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {settings.ipAllowList.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Heç bir IP məhdudiyyəti qoyulmayıb (Qlobal giriş).
                </p>
              ) : (
                settings.ipAllowList.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/20 font-mono text-[11px]"
                  >
                    <span>{ip}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIp(ip)}
                      className="text-danger hover:underline text-xs font-sans"
                    >
                      Sil
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};
