import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import {
  UserNotificationPreference,
  NotificationCategory,
} from '../types/notifications';
import { notificationsRepository } from '../../../shared/adapters';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  Moon,
  Clock,
  Save,
  RefreshCw,
} from 'lucide-react';

const CATEGORIES: { id: NotificationCategory; label: string; desc: string }[] = [
  { id: 'stock', label: 'Stok və Anbar Həyəcanları', desc: 'Kritik minimum qalıq, bitmiş məhsullar və anbar kəsirləri.' },
  { id: 'payment', label: 'Ödəniş və Gecikmələr', desc: 'Təchizatçı borc gecikmələri və böyük məbləğli ödənişlər.' },
  { id: 'order', label: 'Satınalma və Sifarişlər', desc: 'Təsdiq gözləyən və çatdırılması gecikən sifarişlər.' },
  { id: 'transfer', label: 'Filial Transferləri', desc: 'Tranzitdə gecikən transferlər və qəbul uyğunsuzluqları.' },
  { id: 'cash', label: 'Kassa və POS Terminal', desc: 'Gün sonu kassa fərqləri, kassa açılış/bağlanış bildirişləri.' },
  { id: 'approval', label: 'Təsdiq Növbəsi', desc: 'Xərc, transfer, sifariş və əməkhaqqı üzrə təsdiq sorğuları.' },
  { id: 'security', label: 'Təhlükəsizlik İnsidentləri', desc: 'Uğursuz girişlər, şifrə sıfırlamaları və səlahiyyət artımları.' },
  { id: 'system', label: 'Sistem və İnteqrasiyalar', desc: 'Avtomatik backup statusu, API xətaları və yeniləmələr.' },
];

export const NotificationPreferencesPage: React.FC = () => {
  const { toast } = useToast();

  const [preferences, setPreferences] = useState<UserNotificationPreference | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPrefs = async () => {
    setIsLoading(true);
    try {
      const data = await notificationsRepository.getUserPreferences('usr-001');
      setPreferences(data);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Tənzimləmələri yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrefs();
  }, []);

  const handleToggleCategory = (cat: NotificationCategory) => {
    if (!preferences) return;
    const exists = preferences.enabledCategories.includes(cat);
    const updated = exists
      ? preferences.enabledCategories.filter((c) => c !== cat)
      : [...preferences.enabledCategories, cat];

    setPreferences({
      ...preferences,
      enabledCategories: updated,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferences) return;

    setIsSaving(true);
    try {
      const saved = await notificationsRepository.updateUserPreferences(
        preferences.userId,
        preferences
      );
      setPreferences(saved);
      toast({
        type: 'success',
        title: 'Tənzimləmələr yadda saxlanıldı',
        message: 'Bildiriş seçimləriniz uğurla yeniləndi.',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: 'Yadda saxlamaq mümkün olmadı.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !preferences) {
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
          { label: 'Bildiriş Mərkəzi', href: '/notifications' },
          { label: 'Bildiriş Tənzimləmələri' },
        ]}
      />

      <PageHeader
        title="Fərdi Bildiriş və Çatdırılma Seçimləri"
        description="Hansı hadisələr barədə xəbərdarlıq almaq istədiyinizi, çatdırılma kanallarını və sakit saatları fərdiləşdirin."
        badge={
          <Badge variant="neutral" size="sm">
            İstifadəçi Profili
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
            Dəyişiklikləri Yadda Saxla
          </Button>
        }
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Delivery Channels Status Card */}
        <Card>
          <CardContent className="p-5 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-foreground">
              Çatdırılma Kanalları və Əlaqə Vəziyyəti
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* In-App Channel */}
              <div className="p-3 rounded-xl border border-success/30 bg-success/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Bell className="h-4 w-4 text-success" />
                    <span>Daxili Sistem (In-App)</span>
                  </div>
                  <Badge variant="success" size="sm">
                    Aktiv
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Zəng işarəsi və daxili pop-up bildirişləri daimi aktivdir.
                </p>
              </div>

              {/* Email Channel */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>E-poçt (Email)</span>
                  </div>
                  <Badge variant="neutral" size="sm" className="text-warning border-warning/30">
                    {preferences.emailChannelStatus}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  SMTP poçt servisi hələlik konfiqurasiya olunmayıb.
                </p>
              </div>

              {/* SMS Channel */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span>SMS Xəbərdarlıq</span>
                  </div>
                  <Badge variant="neutral" size="sm" className="text-warning border-warning/30">
                    {preferences.smsChannelStatus}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  SMS Gateway provayderi konfiqurasiya olunmayıb.
                </p>
              </div>

              {/* Push Channel */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span>Brauzer Push</span>
                  </div>
                  <Badge variant="neutral" size="sm" className="text-warning border-warning/30">
                    {preferences.pushChannelStatus}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Web push bildiriş servisi quraşdırılmayıb.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Categories Selection */}
        <Card>
          <CardContent className="p-5 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-foreground">
              Bildiriş Kateqoriyaları
            </h3>
            <p className="text-muted-foreground">
              Hansı modullardan xəbərdarlıq almaq istədiyinizi seçin:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => {
                const isChecked = preferences.enabledCategories.includes(cat.id);
                return (
                  <div
                    key={cat.id}
                    onClick={() => handleToggleCategory(cat.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-start gap-3 ${
                      isChecked
                        ? 'border-foreground bg-muted/20'
                        : 'border-border bg-card hover:bg-muted/10 opacity-70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleCategory(cat.id)}
                      className="h-4 w-4 rounded border-input mt-0.5"
                    />
                    <div>
                      <strong className="text-foreground block">{cat.label}</strong>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{cat.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours & Digest Frequency */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Moon className="h-4 w-4 text-bh-accent" />
                <h3 className="font-bold text-sm text-foreground">
                  Sakit Saatlar (Do Not Disturb)
                </h3>
              </div>

              <p className="text-muted-foreground">
                Göstərilən saat aralığında qeyri-kritik bildirişlər səsli və pop-up olaraq narahat etməyəcək.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Başlama Saatı</label>
                  <input
                    type="time"
                    value={preferences.quietHoursStart}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        quietHoursStart: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Bitmə Saatı</label>
                  <input
                    type="time"
                    value={preferences.quietHoursEnd}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        quietHoursEnd: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Clock className="h-4 w-4 text-bh-accent" />
                <h3 className="font-bold text-sm text-foreground">
                  Çatdırılma Tezliyi (Digest)
                </h3>
              </div>

              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${
                    preferences.digestFrequency === 'instant'
                      ? 'border-foreground bg-muted/20'
                      : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="digestFrequency"
                    value="instant"
                    checked={preferences.digestFrequency === 'instant'}
                    onChange={() =>
                      setPreferences({
                        ...preferences,
                        digestFrequency: 'instant',
                      })
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <strong className="text-foreground block">Real Vaxtda (Instant)</strong>
                    <span className="text-[11px] text-muted-foreground">
                      Hər bir hadisə baş verdiyi andaca dərhal çatdırılsın.
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${
                    preferences.digestFrequency === 'daily_digest'
                      ? 'border-foreground bg-muted/20'
                      : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="digestFrequency"
                    value="daily_digest"
                    checked={preferences.digestFrequency === 'daily_digest'}
                    onChange={() =>
                      setPreferences({
                        ...preferences,
                        digestFrequency: 'daily_digest',
                      })
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <strong className="text-foreground block">Gündəlik Xülasə (Daily Digest)</strong>
                    <span className="text-[11px] text-muted-foreground">
                      Günün sonunda bütün hadisələr bir toplu hesabat şəklində göndərilsin.
                    </span>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
};
