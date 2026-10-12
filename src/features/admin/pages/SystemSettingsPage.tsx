import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import {
  SystemParameters,
  SettingsVersionRecord,
  ReceiptTemplateConfig,
} from '../types/systemSettings';
import { systemRepository } from '../../../shared/adapters';
import { computeSettingsDiff } from '../utils/settingsDiffEngine';
import { SettingsDiffModal } from '../components/SettingsDiffModal';
import { ReceiptTemplatePreview } from '../components/ReceiptTemplatePreview';
import { ROLE_LABELS, UserRole } from '../../../shared/utils/permissions';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  Building,
  Coins,
  Receipt,
  Hash,
  Printer,
  CreditCard,
  Percent,
  RotateCcw,
  Boxes,
  Gift,
  Calendar,
  Languages,
  Palette,
  Save,
  History,
  RefreshCw,
} from 'lucide-react';

type TabKey =
  | 'general'
  | 'currency'
  | 'tax'
  | 'numbering'
  | 'receiptTemplate'
  | 'paymentMethods'
  | 'discountLimits'
  | 'returnPolicy'
  | 'warehousePolicy'
  | 'loyaltyDefaults'
  | 'businessHours'
  | 'localization'
  | 'branding';

const TABS: { id: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'general', label: '1. Ümumi Məlumat', icon: Building },
  { id: 'currency', label: '2. Valyuta & Yuvarlaqlaşdırma', icon: Coins },
  { id: 'tax', label: '3. Vergi & ƏDV', icon: Receipt },
  { id: 'numbering', label: '4. Sənəd Nömrələmə', icon: Hash },
  { id: 'receiptTemplate', label: '5. Çek & Çap Şablonu', icon: Printer },
  { id: 'paymentMethods', label: '6. Ödəniş Üsulları', icon: CreditCard },
  { id: 'discountLimits', label: '7. Endirim Limitləri', icon: Percent },
  { id: 'returnPolicy', label: '8. Qaytarma Qaydaları', icon: RotateCcw },
  { id: 'warehousePolicy', label: '9. Anbar Siyasəti & COGS', icon: Boxes },
  { id: 'loyaltyDefaults', label: '10. Loyallıq Defoltları', icon: Gift },
  { id: 'businessHours', label: '11. İş Saatları & Təqvim', icon: Calendar },
  { id: 'localization', label: '12. Dil & Lokalizasiya', icon: Languages },
  { id: 'branding', label: '13. Brend Vizual Tokenləri', icon: Palette },
];

export const SystemSettingsPage: React.FC = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [initialSettings, setInitialSettings] = useState<SystemParameters | null>(null);
  const [currentSettings, setCurrentSettings] = useState<SystemParameters | null>(null);
  const [versionHistory, setVersionHistory] = useState<SettingsVersionRecord[]>([]);

  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await systemRepository.getSystemParameters();
      setInitialSettings(JSON.parse(JSON.stringify(data)));
      setCurrentSettings(JSON.parse(JSON.stringify(data)));
      const history = await systemRepository.getVersionHistory();
      setVersionHistory(history);
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Sistem parametrlərini yükləmək mümkün olmadı.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const diffs =
    initialSettings && currentSettings
      ? computeSettingsDiff(initialSettings, currentSettings)
      : [];
  const hasChanges = diffs.length > 0;

  const handleOpenSaveDiff = () => {
    if (!hasChanges) {
      toast({
        type: 'info',
        title: 'Dəyişiklik yoxdur',
        message: 'Yadda saxlamaq üçün heç bir parametr dəyişdirilməyib.',
      });
      return;
    }
    setIsDiffModalOpen(true);
  };

  const handleConfirmSave = async (reason: string) => {
    if (!currentSettings) return;
    setIsSaving(true);
    try {
      const savedVersion = await systemRepository.saveSystemParametersWithVersion(
        currentSettings,
        reason,
        'Baş Sistem Administratoru'
      );
      setInitialSettings(JSON.parse(JSON.stringify(currentSettings)));
      setVersionHistory((prev) => [savedVersion, ...prev]);
      setIsDiffModalOpen(false);

      toast({
        type: 'success',
        title: 'Parametrlər yadda saxlanıldı',
        message: `Yeni versiya #${savedVersion.versionNumber} qeydə alındı və qüvvəyə mindi.`,
      });
    } catch {
      toast({
        type: 'error',
        title: 'Xəta',
        message: 'Parametrləri yadda saxlamaq mümkün olmadı.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    try {
      const restored = await systemRepository.rollbackToVersion(
        versionId,
        'Versiyanın geri qaytarılması (Rollback)'
      );
      setInitialSettings(JSON.parse(JSON.stringify(restored)));
      setCurrentSettings(JSON.parse(JSON.stringify(restored)));
      const history = await systemRepository.getVersionHistory();
      setVersionHistory(history);
      setIsHistoryOpen(false);

      toast({
        type: 'success',
        title: 'Versiya bərpa edildi',
        message: 'Sistem parametrləri seçilmiş əvvəlki versiyaya uğurla qaytarıldı.',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Rollback xətası',
        message: 'Versiyanı bərpa etmək mümkün olmadı.',
      });
    }
  };

  if (isLoading || !currentSettings) {
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
          { label: 'Sistem Parametrləri' },
        ]}
      />

      <PageHeader
        title="Sistem Parametrləri və Konfiqurasiya (System Parameters)"
        description="Şirkət rekvizitləri, vergi dərəcələri, çek şablonu, nömrələmə, endirim limitləri və anbar siyasəti üzrə 13 mərkəzi bölmə."
        badge={
          <Badge variant={hasChanges ? 'warning' : 'neutral'} size="sm">
            {hasChanges ? `${diffs.length} Dəyişiklik Gözləyir` : 'Versiyalaşdırılmış'}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsHistoryOpen(true)}
            >
              <History className="h-4 w-4 mr-1.5" />
              Versiya Tarixçəsi ({versionHistory.length})
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleOpenSaveDiff}
              disabled={!hasChanges}
            >
              <Save className="h-4 w-4 mr-1.5" />
              Dəyişiklikləri Təsdiqlə (Pre-Save Diff)
            </Button>
          </div>
        }
      />

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Nav: 13 Tabs */}
        <div className="space-y-1 rounded-xl border border-border bg-card p-2 shadow-xs lg:col-span-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 block">
            Bölmələr
          </span>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-background' : 'text-muted-foreground'}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div className="lg:col-span-3 space-y-6">
          {/* Section 1: General */}
          {activeTab === 'general' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Building className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">1. Şirkət və Müəssisə Məlumatları</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Ticarət Brendi Adı</label>
                    <input
                      type="text"
                      value={currentSettings.general.companyName}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          general: { ...currentSettings.general, companyName: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Hüquqi Şəxsin Tam Adı</label>
                    <input
                      type="text"
                      value={currentSettings.general.legalName}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          general: { ...currentSettings.general, legalName: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">VÖEN (Vergi Ödəyicisinin Eyniləşdirmə Nömrəsi)</label>
                    <input
                      type="text"
                      value={currentSettings.general.voen}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          general: { ...currentSettings.general, voen: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Saat Qurşağı (Timezone)</label>
                    <input
                      type="text"
                      value={currentSettings.general.timezone}
                      disabled
                      className="w-full rounded-md border border-input bg-muted px-3 py-1.5 text-xs text-muted-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="font-semibold text-foreground">Hüquqi və Baş Ofis Ünvanı</label>
                    <input
                      type="text"
                      value={currentSettings.general.legalAddress}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          general: { ...currentSettings.general, legalAddress: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 2: Currency */}
          {activeTab === 'currency' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Coins className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">2. Valyuta və Yuvarlaqlaşdırma Siyasəti</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Əsas Valyuta Kodu</label>
                    <input
                      type="text"
                      value={currentSettings.currency.currencyCode}
                      disabled
                      className="w-full rounded-md border border-input bg-muted px-3 py-1.5 text-xs text-muted-foreground font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Valyuta Simvolu</label>
                    <input
                      type="text"
                      value={currentSettings.currency.symbol}
                      disabled
                      className="w-full rounded-md border border-input bg-muted px-3 py-1.5 text-xs text-muted-foreground font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Ondalıq Rəqəmlər Sayı</label>
                    <input
                      type="number"
                      value={currentSettings.currency.decimalPlaces}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          currency: { ...currentSettings.currency, decimalPlaces: parseInt(e.target.value) || 2 },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Riyazi Yuvarlaqlaşdırma Metodu</label>
                    <select
                      value={currentSettings.currency.roundingRule}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          currency: { ...currentSettings.currency, roundingRule: e.target.value as 'half_up' | 'floor' | 'cash_005' },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                    >
                      <option value="half_up">Riyazi Yuxarı (Half Up: 0.005 → 0.01)</option>
                      <option value="floor">Aşağı Kəsmə (Floor)</option>
                      <option value="cash_005">Nağd Kassa 5 qəpik yuvarlaqlaşdırması</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 3: Tax */}
          {activeTab === 'tax' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Receipt className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">3. Vergi Dərəcələri və Qanunvericilik Bildirişi</h3>
                </div>

                <div className="p-3 bg-bh-accent/10 border border-bh-accent/30 rounded-xl text-foreground space-y-1 leading-relaxed">
                  <strong className="block font-semibold">AR Vergi Məcəlləsi Bildirişi:</strong>
                  <p className="text-[11px] text-muted-foreground">{currentSettings.tax.legalNotice}</p>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                        <th className="py-2.5 px-3">Adı & Kodu</th>
                        <th className="py-2.5 px-3">Dərəcə (%)</th>
                        <th className="py-2.5 px-3">Sinif</th>
                        <th className="py-2.5 px-3">Qüvvə Tarixi</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {currentSettings.tax.rates.map((rate) => (
                        <tr key={rate.id}>
                          <td className="py-2.5 px-3">
                            <strong className="text-foreground block">{rate.name}</strong>
                            <span className="font-mono text-[10px] text-muted-foreground">{rate.code}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                            {rate.ratePercent}%
                          </td>
                          <td className="py-2.5 px-3 capitalize text-muted-foreground">
                            {rate.taxClass}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">
                            {rate.effectiveFrom}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant={rate.isDefault ? 'success' : 'neutral'} size="sm">
                              {rate.isDefault ? 'Əsas (Default)' : 'Aktiv'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 4: Document Numbering */}
          {activeTab === 'numbering' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Hash className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">4. Sənəd Nömrələmə Formatları və Canlı Önbaxış</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Kassa Satış Çeki Prefiksi</label>
                    <input
                      type="text"
                      value={currentSettings.numbering.receiptPrefix}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          numbering: { ...currentSettings.numbering, receiptPrefix: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Transfer Sənədi Prefiksi</label>
                    <input
                      type="text"
                      value={currentSettings.numbering.transferPrefix}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          numbering: { ...currentSettings.numbering, transferPrefix: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Satınalma Sifarişi Prefiksi</label>
                    <input
                      type="text"
                      value={currentSettings.numbering.orderPrefix}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          numbering: { ...currentSettings.numbering, orderPrefix: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Sıfırlanma Qaydası</label>
                    <select
                      value={currentSettings.numbering.resetRule}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          numbering: { ...currentSettings.numbering, resetRule: e.target.value as 'annual' | 'monthly' | 'never' },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                    >
                      <option value="annual">Hər il sıfırlansın (01 Yanvar)</option>
                      <option value="monthly">Hər ay sıfırlansın</option>
                      <option value="never">Heç vaxt sıfırlanmasın (Davamlı artan)</option>
                    </select>
                  </div>
                </div>

                {/* Live Preview Box */}
                <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1 font-mono text-xs">
                  <span className="font-sans font-semibold text-muted-foreground block text-[11px]">
                    Canlı Sənəd Nömrəsi Nümunələri:
                  </span>
                  <div className="text-foreground">
                    Satış Çeki: <strong className="text-bh-accent">{currentSettings.numbering.receiptPrefix}-GM-2026-004120</strong>
                  </div>
                  <div className="text-foreground">
                    Transfer: <strong className="text-bh-accent">{currentSettings.numbering.transferPrefix}-2026-00045</strong>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 5: Receipt Template & Live Preview */}
          {activeTab === 'receiptTemplate' && (
            <div className="space-y-6">
              <ReceiptTemplatePreview
                config={currentSettings.receiptTemplate}
                onChange={(updated: ReceiptTemplateConfig) =>
                  setCurrentSettings({
                    ...currentSettings,
                    receiptTemplate: updated,
                  })
                }
              />
            </div>
          )}

          {/* Section 6: Payment Methods */}
          {activeTab === 'paymentMethods' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <CreditCard className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">6. Ödəniş Üsulları və Komissiyalar</h3>
                </div>

                <div className="space-y-2">
                  {currentSettings.paymentMethods.map((pm, idx) => (
                    <div
                      key={pm.id}
                      className="p-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={pm.isEnabled}
                          onChange={(e) => {
                            const updated = [...currentSettings.paymentMethods];
                            updated[idx] = { ...pm, isEnabled: e.target.checked };
                            setCurrentSettings({ ...currentSettings, paymentMethods: updated });
                          }}
                          className="h-4 w-4 rounded border-input"
                        />
                        <div>
                          <strong className="text-foreground block">{pm.nameAz}</strong>
                          <span className="text-[10px] font-mono text-muted-foreground">Kodu: {pm.code}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-muted-foreground text-[11px]">
                        <span>Qaytarma dəstəyi: {pm.supportsRefund ? 'Bəli' : 'Xeyr'}</span>
                        <div className="flex items-center gap-1">
                          <span>Komissiya:</span>
                          <span className="font-mono font-bold text-foreground">{pm.feePercent}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 7: Discount Limits per Role */}
          {activeTab === 'discountLimits' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Percent className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">7. Rollar Üzrə Maksimum Endirim Limitləri</h3>
                </div>

                <p className="text-muted-foreground">
                  Hər bir rolun POS kassa və ya sifariş zamanı tətbiq edə biləcəyi maksimum endirim faizi:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(currentSettings.discountLimits).map(([roleKey, limit]) => (
                    <div key={roleKey} className="space-y-1">
                      <label className="font-semibold text-foreground">
                        {ROLE_LABELS[roleKey as UserRole] || roleKey}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={limit}
                          onChange={(e) =>
                            setCurrentSettings({
                              ...currentSettings,
                              discountLimits: {
                                ...currentSettings.discountLimits,
                                [roleKey]: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono pr-8"
                        />
                        <span className="absolute right-3 top-2 text-muted-foreground text-xs">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 8: Return Policy */}
          {activeTab === 'returnPolicy' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <RotateCcw className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">8. Qaytarma və Mübadilə Siyasəti</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Qaytarma Müddəti (gün)</label>
                    <input
                      type="number"
                      value={currentSettings.returnPolicy.returnWindowDays}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          returnPolicy: {
                            ...currentSettings.returnPolicy,
                            returnWindowDays: parseInt(e.target.value) || 14,
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground">AR İstehlakçıların hüquqları üzrə defolt 14 gündür.</span>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Menecer Təsdiq Həddi (₼)</label>
                    <input
                      type="number"
                      value={currentSettings.returnPolicy.approvalThresholdAzn}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          returnPolicy: {
                            ...currentSettings.returnPolicy,
                            approvalThresholdAzn: parseFloat(e.target.value) || 50,
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground">Bu məbləğdən böyük qaytarmalarda menecer PIN tələb olunur.</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="font-semibold text-foreground block">Məcburi Səbəb Kodları:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {currentSettings.returnPolicy.reasonCodes.map((code) => (
                      <span key={code} className="bg-muted px-2 py-1 rounded text-foreground text-xs">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 9: Warehouse Policy & COGS */}
          {activeTab === 'warehousePolicy' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Boxes className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">9. Anbar İdarəetməsi və Maya Dəyəri (COGS)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Mənfi Stok Siyasəti</label>
                    <select
                      value={currentSettings.warehousePolicy.negativeStockPolicy}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          warehousePolicy: {
                            ...currentSettings.warehousePolicy,
                            negativeStockPolicy: e.target.value as 'block' | 'warn' | 'allow_admin',
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                    >
                      <option value="block">Qəti Qadağandır (Satış bloklanır)</option>
                      <option value="warn">Xəbərdarlıqla İcazə Ver</option>
                      <option value="allow_admin">Yalnız Administrator İcazəsi ilə</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">COGS Maya Dəyəri Metodu</label>
                    <select
                      value={currentSettings.warehousePolicy.cogsMethod}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          warehousePolicy: {
                            ...currentSettings.warehousePolicy,
                            cogsMethod: e.target.value as 'fifo' | 'weighted_average',
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                    >
                      <option value="weighted_average">Çəkili Orta Qiymət (Weighted Average - Standart)</option>
                      <option value="fifo">FIFO (First In First Out)</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 10: Loyalty Defaults */}
          {activeTab === 'loyaltyDefaults' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Gift className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">10. Loyallıq Proqramı Defoltları</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Bal Qazanma Əmsalı (1 AZN = N Bal)</label>
                    <input
                      type="number"
                      value={currentSettings.loyaltyDefaults.earnRateAznToPoints}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          loyaltyDefaults: {
                            ...currentSettings.loyaltyDefaults,
                            earnRateAznToPoints: parseFloat(e.target.value) || 1,
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Bal Xərcləmə Əmsalı (1 Bal = N AZN)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={currentSettings.loyaltyDefaults.redeemRatePointsToAzn}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          loyaltyDefaults: {
                            ...currentSettings.loyaltyDefaults,
                            redeemRatePointsToAzn: parseFloat(e.target.value) || 0.05,
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Minimum İstifadə Limiti (Bal)</label>
                    <input
                      type="number"
                      value={currentSettings.loyaltyDefaults.minimumRedemptionThreshold}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          loyaltyDefaults: {
                            ...currentSettings.loyaltyDefaults,
                            minimumRedemptionThreshold: parseInt(e.target.value) || 50,
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Balın İstifadə Müddəti (Ay)</label>
                    <input
                      type="number"
                      value={currentSettings.loyaltyDefaults.pointsExpiryMonths}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          loyaltyDefaults: {
                            ...currentSettings.loyaltyDefaults,
                            pointsExpiryMonths: parseInt(e.target.value) || 12,
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 11: Business Hours & Holidays */}
          {activeTab === 'businessHours' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Calendar className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">11. Rəsmi İş Saatları və Bayram Təqvimi</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Həftəiçi Açılış / Bağlanış</label>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={currentSettings.businessHours.weekdayOpen}
                        onChange={(e) =>
                          setCurrentSettings({
                            ...currentSettings,
                            businessHours: { ...currentSettings.businessHours, weekdayOpen: e.target.value },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                      />
                      <input
                        type="time"
                        value={currentSettings.businessHours.weekdayClose}
                        onChange={(e) =>
                          setCurrentSettings({
                            ...currentSettings,
                            businessHours: { ...currentSettings.businessHours, weekdayClose: e.target.value },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Həftəsonu Açılış / Bağlanış</label>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={currentSettings.businessHours.weekendOpen}
                        onChange={(e) =>
                          setCurrentSettings({
                            ...currentSettings,
                            businessHours: { ...currentSettings.businessHours, weekendOpen: e.target.value },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                      />
                      <input
                        type="time"
                        value={currentSettings.businessHours.weekendClose}
                        onChange={(e) =>
                          setCurrentSettings({
                            ...currentSettings,
                            businessHours: { ...currentSettings.businessHours, weekendClose: e.target.value },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="font-semibold text-foreground block">
                    Qeyri-İş Günləri və Bayram Təqvimi:
                  </label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {currentSettings.businessHours.holidayCalendar.map((h, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-lg border border-border bg-muted/20 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-bh-accent font-semibold">{h.date}</span>
                          <span className="text-foreground">{h.name}</span>
                        </div>
                        <Badge variant="neutral" size="sm">
                          İstirahət Günü
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 12: Localization */}
          {activeTab === 'localization' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Languages className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">12. Dil və Lokalizasiya Dəstəyi</h3>
                </div>

                <div className="space-y-3">
                  {currentSettings.localization.supportedLanguages.map((lang) => (
                    <div
                      key={lang.code}
                      className="p-3 rounded-xl border border-border bg-card flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-foreground uppercase">{lang.code}</span>
                        <strong className="text-foreground">{lang.name}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[11px]">
                          Tərcümə: {lang.completenessPercent}%
                        </span>
                        <Badge
                          variant={lang.status === 'active' ? 'success' : 'neutral'}
                          size="sm"
                        >
                          {lang.status === 'active' ? 'Aktiv' : 'Tezliklə'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 13: Branding */}
          {activeTab === 'branding' && (
            <Card>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Palette className="h-4 w-4 text-bh-accent" />
                  <h3 className="font-bold text-sm text-foreground">13. Brend Vizual Tokenləri</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Brend Adı</label>
                    <input
                      type="text"
                      value={currentSettings.branding.brandName}
                      onChange={(e) =>
                        setCurrentSettings({
                          ...currentSettings,
                          branding: { ...currentSettings.branding, brandName: e.target.value },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Əsas Rəng (Primary Hex)</label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-7 w-7 rounded border border-border shrink-0"
                        style={{ backgroundColor: currentSettings.branding.primaryColor }}
                      />
                      <input
                        type="text"
                        value={currentSettings.branding.primaryColor}
                        onChange={(e) =>
                          setCurrentSettings({
                            ...currentSettings,
                            branding: { ...currentSettings.branding, primaryColor: e.target.value },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Vurğu Rəngi (Accent Gold Hex)</label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-7 w-7 rounded border border-border shrink-0"
                        style={{ backgroundColor: currentSettings.branding.accentColor }}
                      />
                      <input
                        type="text"
                        value={currentSettings.branding.accentColor}
                        onChange={(e) =>
                          setCurrentSettings({
                            ...currentSettings,
                            branding: { ...currentSettings.branding, accentColor: e.target.value },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Krem Rəngi (Cream Hex)</label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-7 w-7 rounded border border-border shrink-0"
                        style={{ backgroundColor: currentSettings.branding.creamColor }}
                      />
                      <input
                        type="text"
                        value={currentSettings.branding.creamColor}
                        onChange={(e) =>
                          setCurrentSettings({
                            ...currentSettings,
                            branding: { ...currentSettings.branding, creamColor: e.target.value },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground font-mono"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Pre-Save Diff Modal with Mandatory Reason */}
      <SettingsDiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        diffs={diffs}
        onConfirm={handleConfirmSave}
        isSaving={isSaving}
      />

      {/* Version History & Rollback Modal */}
      <Modal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        title="Sistem Parametrlərinin Versiya Arxivi və Rollback"
        size="lg"
      >
        <div className="space-y-4 text-xs">
          <p className="text-muted-foreground">
            Bütün konfiqurasiya dəyişiklikləri unikal versiya nömrəsi, icraçı və əsaslandırma səbəbi ilə arxivlənir. İstənilən əvvəlki versiyanı bərpa edə bilərsiniz.
          </p>

          <div className="divide-y divide-border border border-border rounded-xl max-h-96 overflow-y-auto">
            {versionHistory.map((rec) => (
              <div key={rec.versionId} className="p-3.5 space-y-2 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" size="sm" className="font-mono font-bold">
                      v{rec.versionNumber}
                    </Badge>
                    <span className="font-semibold text-foreground">{rec.changedBy}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {formatDateTime(rec.changedAt)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRollback(rec.versionId)}
                      className="h-6 text-[11px] text-bh-accent hover:text-bh-accent-hover"
                    >
                      Bərpa Et
                    </Button>
                  </div>
                </div>

                <div className="text-[11px] text-foreground bg-muted/30 p-2 rounded border border-border/50">
                  <strong className="text-muted-foreground">Səbəb:</strong> {rec.reason}
                </div>

                <div className="text-[10px] text-muted-foreground font-mono">
                  {rec.diffs.length} parametr dəyişikliyi qeydə alınıb.
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsHistoryOpen(false)}
            >
              Bağla
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
