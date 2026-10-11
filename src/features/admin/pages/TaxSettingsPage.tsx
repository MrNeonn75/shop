import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { MOCK_TAX_RATES, TaxRateConfig } from '../../../shared/adapters/mock/adminMockData';
import { Plus, Edit2, Scale } from 'lucide-react';

export const TaxSettingsPage: React.FC = () => {
  const { toast } = useToast();
  const [taxRates, setTaxRates] = useState<TaxRateConfig[]>(MOCK_TAX_RATES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<Partial<TaxRateConfig> | null>(null);

  const handleOpenCreate = () => {
    setEditingRate({
      id: `tax-${Date.now()}`,
      code: '',
      name: '',
      ratePercent: 18.0,
      taxClass: 'standard',
      description: '',
      isDefault: false,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rate: TaxRateConfig) => {
    setEditingRate({ ...rate });
    setIsModalOpen(true);
  };

  const handleSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRate || !editingRate.code || !editingRate.name) {
      toast({
        type: 'error',
        title: 'Məlumat natamamdır',
        message: 'Vergi kodu və adı mütləq daxil edilməlidir.',
      });
      return;
    }

    setTaxRates((prev) => {
      const idx = prev.findIndex((r) => r.id === editingRate.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = editingRate as TaxRateConfig;
        return next;
      }
      return [...prev, editingRate as TaxRateConfig];
    });

    toast({
      type: 'success',
      title: 'Vergi dərəcəsi yadda saxlanıldı',
      message: `"${editingRate.name}" vergi parametri yeniləndi.`,
    });
    setIsModalOpen(false);
    setEditingRate(null);
  };

  const handleSetDefault = (id: string) => {
    setTaxRates((prev) =>
      prev.map((r) => ({
        ...r,
        isDefault: r.id === id,
      }))
    );
    toast({
      type: 'info',
      title: 'Əsas vergi dərəcəsi dəyişdirildi',
      message: 'Yeni satış sənədlərində bu dərəcə avtomatik tətbiq olunacaq.',
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Vergi Parametrləri' },
        ]}
      />

      <PageHeader
        title="Vergi Dərəcələri və Tənzimləmələri"
        description="Pərakəndə satış, idxal və xidmətlər üzrə tətbiq olunan vergi sinifləri və faiz dərəcələri."
        badge={
          <Badge variant="neutral" size="sm">
            {taxRates.length} Vergi Dərəcəsi
          </Badge>
        }
        actions={
          <Button variant="default" size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Vergi Dərəcəsi
          </Button>
        }
      />

      {/* Mandatory Azerbaijani Tax Code Legal Disclaimer */}
      <div className="p-4 rounded-xl border border-warning/40 bg-warning/10 space-y-2">
        <div className="flex items-center gap-2 text-warning font-bold text-sm">
          <Scale className="h-5 w-5 shrink-0" />
          <span>Hüquqi Xəbərdarlıq — Azərbaycan Respublikasının Vergi Məcəlləsi</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>DİQQƏT:</strong> Bu bölmədəki vergi dərəcələri və sinifləri yalnız texniki konfiqurasiya xarakteri daşıyır və hüquqi məsləhət hesab edilmir. Şirkətiniz üçün tətbiq olunan faktiki dərəcələr (ƏDV, sadələşdirilmiş vergi, aksiz və ya güzəştlər) baş mühasib və vergi məsləhətçisi tərəfindən <strong>AR Vergi Məcəlləsinin</strong> cari redaksiyasına uyğun yoxlanılmalı və təsdiq edilməlidir.
        </p>
      </div>

      {/* Tax Rates Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">Kod və Ad</th>
                <th className="py-3 px-4">Dərəcə (%)</th>
                <th className="py-3 px-4">Sinif</th>
                <th className="py-3 px-4">Təsvir</th>
                <th className="py-3 px-4">Standart</th>
                <th className="py-3 px-4 text-right">Əməliyyatlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {taxRates.map((rate) => (
                <tr key={rate.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">
                        {rate.code}
                      </span>
                      <strong className="text-foreground">{rate.name}</strong>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-bold text-foreground text-sm font-mono">
                    %{rate.ratePercent.toFixed(1)}
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="neutral" size="sm" className="capitalize">
                      {rate.taxClass}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">
                    {rate.description}
                  </td>
                  <td className="py-3 px-4">
                    {rate.isDefault ? (
                      <Badge variant="success" size="sm">
                        Əsas Seçim
                      </Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(rate.id)}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        Əsas et
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(rate)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRate?.id ? 'Vergi Dərəcəsini Redaktə Et' : 'Yeni Vergi Dərəcəsi'}
        size="md"
      >
        {editingRate && (
          <form onSubmit={handleSaveRate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Vergi Kodu</label>
                <input
                  type="text"
                  value={editingRate.code || ''}
                  onChange={(e) => setEditingRate({ ...editingRate, code: e.target.value })}
                  placeholder="məs: EDV-18"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Adı</label>
                <input
                  type="text"
                  value={editingRate.name || ''}
                  onChange={(e) => setEditingRate({ ...editingRate, name: e.target.value })}
                  placeholder="məs: Standart ƏDV"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Dərəcə Faizi (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={editingRate.ratePercent ?? 0}
                  onChange={(e) =>
                    setEditingRate({ ...editingRate, ratePercent: parseFloat(e.target.value) || 0 })
                  }
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Vergi Sinfi</label>
                <select
                  value={editingRate.taxClass || 'standard'}
                  onChange={(e) =>
                    setEditingRate({
                      ...editingRate,
                      taxClass: e.target.value as TaxRateConfig['taxClass'],
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="standard">Standart (ƏDV)</option>
                  <option value="reduced">Güzəştli / Sadələşdirilmiş</option>
                  <option value="zero">Sıfır Dərəcə (0%)</option>
                  <option value="exempt">Azad Edilmiş</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Açıqlama və Qanunvericilik İstinadı</label>
              <textarea
                value={editingRate.description || ''}
                onChange={(e) => setEditingRate({ ...editingRate, description: e.target.value })}
                rows={2}
                placeholder="məs: AR Vergi Məcəlləsinin 159-cu maddəsi..."
                className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
              >
                İmtina
              </Button>
              <Button type="submit" variant="default" size="sm">
                Yadda Saxla
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
