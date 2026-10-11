import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { MOCK_COMPANY_PROFILE, CompanyProfile } from '../../../shared/adapters/mock/adminMockData';
import { Save, Upload, AlertCircle } from 'lucide-react';

export const CompanyProfilePage: React.FC = () => {
  const { toast } = useToast();
  const [profile, setProfile] = useState<CompanyProfile>(MOCK_COMPANY_PROFILE);
  const [initialProfile] = useState<CompanyProfile>(MOCK_COMPANY_PROFILE);
  const [isSaving, setIsSaving] = useState(false);

  // Dirty state detection
  const isDirty = JSON.stringify(profile) !== JSON.stringify(initialProfile);

  const handleChange = (field: keyof CompanyProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast({
        type: 'success',
        title: 'Məlumatlar yadda saxlanıldı',
        message: 'Şirkət rekvizitləri və profil parametrləri uğurla yeniləndi.',
      });
    }, 600);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Şirkət Profili' },
        ]}
      />

      <PageHeader
        title="Şirkət Profili və Əsas Parametrlər"
        description="Şirkət adı, hüquqi rekvizitlər (VÖEN), loqo, valyuta, saat qurşağı və bank məlumatları."
        badge={
          isDirty ? (
            <Badge variant="warning" size="sm">
              Yadda saxlanılmamış dəyişikliklər
            </Badge>
          ) : (
            <Badge variant="success" size="sm">
              Məlumatlar aktualdır
            </Badge>
          )
        }
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!isDirty}
          >
            <Save className="h-4 w-4 mr-2" />
            Yadda Saxla
          </Button>
        }
      />

      {isDirty && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Diqqət: Şirkət profilində dəyişikliklər etmisiniz. Səhifəni tərk etməzdən əvvəl &quot;Yadda Saxla&quot; düyməsinə klikləyin.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Brand Info & Logo */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Şirkət Loqosu</CardTitle>
              <CardDescription className="text-xs">
                Sistemdə və çap qaimələrində görünən rəsmi ticarət nişanı.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-xl bg-muted/20 text-center">
                <img
                  src={profile.logoUrl}
                  alt="Brend loqosu"
                  className="h-16 w-16 object-contain mb-3"
                  onError={(e) => {
                    // Fallback to text if svg fails
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="font-bold text-sm tracking-wider">BRAND HOUSE</span>
                <p className="text-[11px] text-muted-foreground mt-1">
                  SVG, PNG və ya WebP (Maks. 2MB)
                </p>
                <div className="mt-4">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-xs font-medium transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Yeni Loqo Yüklə</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/svg+xml,image/png,image/webp"
                      onChange={() => {
                        toast({
                          type: 'info',
                          title: 'Loqo yeniləndi',
                          message: 'Loqo faylı önbaxış üçün təyin edildi.',
                        });
                      }}
                    />
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legal Details */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Hüquqi Rekvizitlər</CardTitle>
              <CardDescription className="text-xs">
                Müqavilə, e-qaimə və fiskal çeklərdə əks olunan rəsmi rekvizitlər.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Brend Adı</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Hüquqi Şəxsin Tam Adı</label>
                <input
                  type="text"
                  value={profile.legalName}
                  onChange={(e) => handleChange('legalName', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">VÖEN (Vergi Ödəyicisinin Kodu)</label>
                <input
                  type="text"
                  value={profile.voen}
                  onChange={(e) => handleChange('voen', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Rəsmi Hüquqi Ünvan</label>
                <input
                  type="text"
                  value={profile.legalAddress}
                  onChange={(e) => handleChange('legalAddress', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Telefon</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Rəsmi E-poçt</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Regional Defaults & Bank Info */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Regional Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Regional və Dil Parametrləri</CardTitle>
              <CardDescription className="text-xs">
                Sistem üzrə əsas valyuta, saat qurşağı və standart dil.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Əsas Valyuta</label>
                <input
                  type="text"
                  value="AZN (Azərbaycan Manatı - ₼)"
                  disabled
                  className="w-full rounded-md border border-input bg-muted/60 px-3 py-2 text-sm text-muted-foreground font-medium cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Saat Qurşağı (Timezone)</label>
                <input
                  type="text"
                  value="Asia/Baku (GMT+4)"
                  disabled
                  className="w-full rounded-md border border-input bg-muted/60 px-3 py-2 text-sm text-muted-foreground font-medium cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Standart İnterfeys Dili</label>
                <input
                  type="text"
                  value="Azərbaycan dili (az)"
                  disabled
                  className="w-full rounded-md border border-input bg-muted/60 px-3 py-2 text-sm text-muted-foreground font-medium cursor-not-allowed"
                />
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Bank Hesabı Məlumatları</CardTitle>
              <CardDescription className="text-xs">
                Qaimə və köçürmələrdə istifadə olunan bank hesabı.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Xidmət Edən Bank</label>
                <input
                  type="text"
                  value={profile.bankName}
                  onChange={(e) => handleChange('bankName', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Bankın VÖEN-i</label>
                <input
                  type="text"
                  value={profile.bankVoen}
                  onChange={(e) => handleChange('bankVoen', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Hesablaşma Hesabı (IBAN)</label>
                <input
                  type="text"
                  value={profile.iban}
                  onChange={(e) => handleChange('iban', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">SWIFT / KOD</label>
                <input
                  type="text"
                  value={profile.swift}
                  onChange={(e) => handleChange('swift', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
};
