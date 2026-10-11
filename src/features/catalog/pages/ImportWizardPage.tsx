import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Select } from '../../../components/ui/Select';
import { catalogRepository } from '../../../shared/adapters';
import { toQapik } from '../../../shared/utils/money';
import { CatalogProduct } from '../types/catalog';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  Download,
  ArrowRight,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { useToast } from '../../../components/ui';

interface ParsedRow {
  rowNum: number;
  name: string;
  sku: string;
  barcode: string;
  section: string;
  type: string;
  category: string;
  brand: string;
  price: string;
  cost: string;
  errors: string[];
  status: 'valid' | 'invalid';
}

const TEMPLATE_HEADERS = [
  'Məhsul Adı',
  'SKU',
  'Barkod',
  'Bölmə (kisi/qadin/usaq/diger)',
  'Tip (geyim/ayaqqabi/aksesuar)',
  'Kateqoriya',
  'Brend',
  'Satış Qiyməti (AZN)',
  'Maya Dəyəri (AZN)',
];

const SAMPLE_CSV = `${TEMPLATE_HEADERS.join(',')}\n` +
  `Klassik Kətan Köynək,KTN-M-01,4760012399014,kisi,geyim,Köynək,Massimo Dutti,89.90,45.00\n` +
  `Gündəlik İdman Şalvarı,IDM-W-02,4760012399021,qadin,geyim,Şalvar,Zara,65.00,30.00\n` +
  `Klassik Dəri Kəmər,KMR-M-03,4760012399038,kisi,aksesuar,Kəmər,Tommy Hilfiger,45.00,20.00\n`;

export const ImportWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<{ imported: number; failed: number }>({
    imported: 0,
    failed: 0,
  });

  // Column mappings
  const [columnMapping, setColumnMapping] = useState({
    name: 'Məhsul Adı',
    sku: 'SKU',
    barcode: 'Barkod',
    section: 'Bölmə (kisi/qadin/usaq/diger)',
    type: 'Tip (geyim/ayaqqabi/aksesuar)',
    category: 'Kateqoriya',
    brand: 'Brend',
    price: 'Satış Qiyməti (AZN)',
    cost: 'Maya Dəyəri (AZN)',
  });

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'brend_house_kataloq_sablon.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('İdxal şablonu yükləndi.');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processCsvContent(text);
    };
    reader.readAsText(file);
  };

  const processCsvContent = (content: string) => {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      toastError('Fayl boşdur və ya başlıq xətti yoxdur.');
      return;
    }

    const rows: ParsedRow[] = [];

    const existingSkusInFile = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const rowNum = i + 1;
      const rowErrors: string[] = [];

      const name = cols[0] || '';
      const sku = cols[1] || '';
      const barcode = cols[2] || '';
      const section = cols[3] || 'kisi';
      const type = cols[4] || 'geyim';
      const category = cols[5] || 'Köynək';
      const brand = cols[6] || 'Zara';
      const priceStr = cols[7] || '0';
      const costStr = cols[8] || '0';

      if (!name || name.length < 3) {
        rowErrors.push('Məhsul adı ən az 3 simvol olmalıdır.');
      }

      if (!sku) {
        rowErrors.push('SKU kodu tələb olunur.');
      } else if (existingSkusInFile.has(sku.toUpperCase())) {
        rowErrors.push(`Fayl daxilində təkrarlanan SKU: ${sku}`);
      } else {
        existingSkusInFile.add(sku.toUpperCase());
      }

      const priceNum = parseFloat(priceStr);
      if (isNaN(priceNum) || priceNum <= 0) {
        rowErrors.push('Satış qiyməti müsbət rəqəm olmalıdır.');
      }

      rows.push({
        rowNum,
        name,
        sku,
        barcode,
        section,
        type,
        category,
        brand,
        price: priceStr,
        cost: costStr,
        errors: rowErrors,
        status: rowErrors.length === 0 ? 'valid' : 'invalid',
      });
    }

    setParsedRows(rows);
    setStep(2);
  };

  const handleDownloadErrorReport = () => {
    const invalidRows = parsedRows.filter((r) => r.status === 'invalid');
    if (invalidRows.length === 0) return;

    let csvContent = 'Sətir No,Məhsul Adı,SKU,Barkod,Xətalar\n';
    invalidRows.forEach((r) => {
      csvContent += `${r.rowNum},"${r.name}","${r.sku}","${r.barcode}","${r.errors.join('; ')}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'kataloq_idxal_xeta_hesabati.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('Xəta hesabatı yükləndi.');
  };

  const handleExecuteImport = async () => {
    setIsImporting(true);
    const validRows = parsedRows.filter((r) => r.status === 'valid');

    const productsToImport: Partial<CatalogProduct>[] = validRows.map((r) => {
      const priceQapik = toQapik(Math.round(parseFloat(r.price) * 100));
      const costQapik = toQapik(Math.round(parseFloat(r.cost) * 100));

      return {
        name: r.name,
        sku: r.sku,
        barcode: r.barcode || `476001239${Math.floor(1000 + Math.random() * 9000)}`,
        section: (r.section as CatalogProduct['section']) || 'kisi',
        type: (r.type as CatalogProduct['type']) || 'geyim',
        categoryName: r.category,
        brandName: r.brand,
        priceQapik,
        costPriceQapik: costQapik,
        unit: 'ədəd',
        taxClassId: 'tax-standard',
        minStockLevel: 5,
        status: 'active',
      };
    });

    try {
      const res = await catalogRepository.importProducts(productsToImport);
      setImportResult({
        imported: res.importedCount,
        failed: parsedRows.length - res.importedCount,
      });
      setStep(4);
      success(`${res.importedCount} məhsul uğurla kataloqa əlavə edildi.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'İdxal zamanı xəta baş verdi.';
      toastError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.status === 'valid').length;
  const invalidCount = parsedRows.filter((r) => r.status === 'invalid').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kataloq Məhsullarının Kütləvi İdxalı"
        description="CSV və ya Excel formatında məhsul siyahılarının yoxlanması, sütun uyğunlaşdırılması və sistemə daxil edilməsi."
        breadcrumbs={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Kataloq', href: '/catalog' },
          { label: 'Kütləvi İdxal' },
        ]}
      />

      {/* Opening Balances Deferred Notice Alert */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-100 text-sm">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <div className="font-semibold">Məlumat: İlkin Qalıqların Daxil Edilməsi</div>
          <div className="text-xs text-blue-800 dark:text-blue-200">
            Bu modul vasitəsilə yalnız məhsul kartoçkaları, qiymətlər və təsnifat təyin edilir.
            Filiallar və anbarlar üzrə ilkin fiziki stok qalıqları (Opening Balances) növbəti{' '}
            <strong>F5 Anbar və İnventarizasiya</strong> mərhələsində ayrıca sənədlə daxil ediləcəkdir.
          </div>
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="flex items-center justify-between max-w-3xl mx-auto py-2">
        {[
          { num: 1, label: 'Fayl Yükləmə' },
          { num: 2, label: 'Sütun Uyğunluğu' },
          { num: 3, label: 'Yoxlama və Sınaq' },
          { num: 4, label: 'Nəticə' },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step === s.num
                  ? 'bg-primary text-primary-foreground'
                  : step > s.num
                  ? 'bg-success text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="h-5 w-5" /> : s.num}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                step === s.num ? 'text-foreground font-semibold' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload File */}
      {step === 1 && (
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>CSV / Excel Faylını Seçin</CardTitle>
            <CardDescription>
              Məhsulları düzgün formatda daxil etmək üçün standart CSV şablonumuzdan istifadə edin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center flex flex-col items-center justify-center bg-muted/20 hover:bg-muted/30 transition-colors">
              <UploadCloud className="h-12 w-12 text-muted-foreground mb-3" />
              <div className="text-sm font-semibold text-foreground">
                Faylı buraya sürükləyin və ya kompüterdən seçin
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Yalnız UTF-8 formatlı CSV və ya XLSX faylları (Maksimum 10MB)
              </div>
              <input
                type="file"
                accept=".csv"
                id="csv-file-input"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                size="sm"
                className="mt-4"
                onClick={() => document.getElementById('csv-file-input')?.click()}
              >
                Fayl Seç
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <div>
                  <div className="text-sm font-medium">Standart Kataloq Şablonu</div>
                  <div className="text-xs text-muted-foreground">Doğru başlıqlar və nümunə sətirlər</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={handleDownloadTemplate}
              >
                Şablonu Yüklə (.csv)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 2 && (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Sütunların Uyğunlaşdırılması</CardTitle>
            <CardDescription>
              "{fileName || 'Seçilmiş fayl'}" daxilindəki başlıqların ERP sahələri ilə düzgün əlaqələndirildiyini təsdiqləyin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Məhsul Adı *</label>
                <Select
                  value={columnMapping.name}
                  onValueChange={(v: string) => setColumnMapping((p) => ({ ...p, name: v }))}
                  options={TEMPLATE_HEADERS.map((h) => ({ value: h, label: h }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Əsas SKU *</label>
                <Select
                  value={columnMapping.sku}
                  onValueChange={(v: string) => setColumnMapping((p) => ({ ...p, sku: v }))}
                  options={TEMPLATE_HEADERS.map((h) => ({ value: h, label: h }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Barkod (EAN-13)</label>
                <Select
                  value={columnMapping.barcode}
                  onValueChange={(v: string) => setColumnMapping((p) => ({ ...p, barcode: v }))}
                  options={TEMPLATE_HEADERS.map((h) => ({ value: h, label: h }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Satış Qiyməti (AZN) *</label>
                <Select
                  value={columnMapping.price}
                  onValueChange={(v: string) => setColumnMapping((p) => ({ ...p, price: v }))}
                  options={TEMPLATE_HEADERS.map((h) => ({ value: h, label: h }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Maya Dəyəri (AZN)</label>
                <Select
                  value={columnMapping.cost}
                  onValueChange={(v: string) => setColumnMapping((p) => ({ ...p, cost: v }))}
                  options={TEMPLATE_HEADERS.map((h) => ({ value: h, label: h }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Kateqoriya</label>
                <Select
                  value={columnMapping.category}
                  onValueChange={(v: string) => setColumnMapping((p) => ({ ...p, category: v }))}
                  options={TEMPLATE_HEADERS.map((h) => ({ value: h, label: h }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                Geri
              </Button>
              <Button size="sm" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => setStep(3)}>
                Doğrulamaya Keç
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Dry-run Validation Preview */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Sınaq İcrası (Dry-Run Preview)</CardTitle>
                  <CardDescription>
                    Cəmi {parsedRows.length} sətir oxundu: {validCount} qüsursuz, {invalidCount} xətalı.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {invalidCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Download className="h-4 w-4" />}
                      onClick={handleDownloadErrorReport}
                    >
                      Xəta Hesabatı ({invalidCount})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleExecuteImport}
                    isLoading={isImporting}
                    disabled={validCount === 0}
                  >
                    Təsdiq Et və İdxal Et ({validCount} məhsul)
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-2.5">Sətir</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Məhsul Adı</th>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5">Barkod</th>
                      <th className="p-2.5">Qiymət</th>
                      <th className="p-2.5">Maya</th>
                      <th className="p-2.5">Aşkar Edilən Xətalar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.slice(0, 20).map((r) => (
                      <tr
                        key={r.rowNum}
                        className={r.status === 'invalid' ? 'bg-danger/10' : 'hover:bg-muted/40'}
                      >
                        <td className="p-2.5 font-mono">{r.rowNum}</td>
                        <td className="p-2.5">
                          {r.status === 'valid' ? (
                            <Badge variant="success" size="sm" hasDot>
                              Düzgün
                            </Badge>
                          ) : (
                            <Badge variant="danger" size="sm" hasDot>
                              Xətalı
                            </Badge>
                          )}
                        </td>
                        <td className="p-2.5 font-medium">{r.name}</td>
                        <td className="p-2.5 font-mono">{r.sku}</td>
                        <td className="p-2.5 font-mono">{r.barcode}</td>
                        <td className="p-2.5 font-semibold">{r.price} ₼</td>
                        <td className="p-2.5 text-muted-foreground">{r.cost} ₼</td>
                        <td className="p-2.5 text-danger font-medium">
                          {r.errors.length > 0 ? r.errors.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 20 && (
                <div className="text-center text-xs text-muted-foreground mt-2">
                  Və daha {parsedRows.length - 20} sətir...
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Sütun Uyğunluğuna Qayıt
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Import Complete */}
      {step === 4 && (
        <Card className="max-w-lg mx-auto text-center py-8">
          <CardContent className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <CardTitle className="text-xl">İdxal Uğurla Tamamlandı!</CardTitle>
            <p className="text-sm text-muted-foreground">
              Seçilmiş <strong className="text-foreground">{importResult.imported}</strong> ədəd məhsul
              Brand House ERP mərkəzi kataloquna daxil edildi.
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                Başqa Fayl İdxal Et
              </Button>
              <Button size="sm" onClick={() => navigate('/catalog')}>
                Kataloqda Bax
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

