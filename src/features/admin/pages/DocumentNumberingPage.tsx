import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import {
  MOCK_NUMBERING_CONFIGS,
  DocumentNumberingConfig,
} from '../../../shared/adapters/mock/adminMockData';
import { Save, FileText } from 'lucide-react';

export const DocumentNumberingPage: React.FC = () => {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<DocumentNumberingConfig[]>(MOCK_NUMBERING_CONFIGS);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = <K extends keyof DocumentNumberingConfig>(
    index: number,
    field: K,
    value: DocumentNumberingConfig[K]
  ) => {
    setConfigs((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      // Recompute sample preview dynamically
      const branchPart = item.includeBranchCode ? '28M-' : '';
      const yearPart =
        item.yearFormat === 'YYYY'
          ? '2026-'
          : item.yearFormat === 'YY'
          ? '26-'
          : '';
      const seqSample = '1'.padStart(item.sequencePadding, '0');
      item.samplePreview = `${item.prefix}-${branchPart}${yearPart}${seqSample}`;

      next[index] = item;
      return next;
    });
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast({
        type: 'success',
        title: 'Sənəd nömrələnməsi saxlanıldı',
        message: 'Bütün sənəd prefiksləri və sayğac formatları uğurla yeniləndi.',
      });
    }, 500);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'Sənəd Nömrələnməsi' },
        ]}
      />

      <PageHeader
        title="Sənəd Nömrələnməsi və Sayğac Tənzimləmələri"
        description="Satış çekləri, satınalma qaimələri, anbar transferləri və hesab-fakturaların unikal nömrələnmə şablonları."
        badge={
          <Badge variant="neutral" size="sm">
            {configs.length} Sənəd Şablonu
          </Badge>
        }
        actions={
          <Button variant="default" size="sm" onClick={handleSave} isLoading={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            Parametrləri Yadda Saxla
          </Button>
        }
      />

      <div className="grid gap-4">
        {configs.map((cfg, idx) => (
          <Card key={cfg.docType} className="overflow-hidden">
            <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-bold text-foreground">
                    {cfg.docTypeName}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  docType: {cfg.docType}
                </p>
              </div>

              {/* Form Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">Prefiks</label>
                  <input
                    type="text"
                    value={cfg.prefix}
                    onChange={(e) => handleUpdate(idx, 'prefix', e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">İl Formatı</label>
                  <select
                    value={cfg.yearFormat}
                    onChange={(e) =>
                      handleUpdate(idx, 'yearFormat', e.target.value as 'YYYY' | 'YY' | 'NONE')
                    }
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="YYYY">YYYY (2026)</option>
                    <option value="YY">YY (26)</option>
                    <option value="NONE">İl daxil edilməsin</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">Sayğac Rəqəm Sayı</label>
                  <select
                    value={cfg.sequencePadding}
                    onChange={(e) => handleUpdate(idx, 'sequencePadding', Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={4}>4 rəqəm (0001)</option>
                    <option value={5}>5 rəqəm (00001)</option>
                    <option value={6}>6 rəqəm (000001)</option>
                    <option value={8}>8 rəqəm (00000001)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id={`branchCode-${cfg.docType}`}
                    checked={cfg.includeBranchCode}
                    onChange={(e) => handleUpdate(idx, 'includeBranchCode', e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <label
                    htmlFor={`branchCode-${cfg.docType}`}
                    className="text-xs text-foreground cursor-pointer font-medium"
                  >
                    Filial Kodu Əlavə Et
                  </label>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 rounded-lg border border-border bg-muted/30 min-w-[200px] text-right">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-0.5">
                  Nümunəvi Canlı Önbaxış
                </span>
                <span className="font-mono text-sm font-bold text-foreground">
                  {cfg.samplePreview}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
