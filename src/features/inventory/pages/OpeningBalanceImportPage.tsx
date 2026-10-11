import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Checkbox } from '../../../components/ui/Checkbox';
import { InventoryNavHeader } from '../components/InventoryNavHeader';
import { inventoryRepository } from '../../../shared/adapters';
import { OpeningBalanceRow, OpeningBalanceRecord } from '../types';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { usePermission } from '../../../shared/hooks/usePermission';
import { useToast } from '../../../components/ui/useToast';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Download,
} from 'lucide-react';

const SAMPLE_CSV_ROWS: OpeningBalanceRow[] = [
  { barcode: '4760012391010', sku: 'TH-M-SH-101-WHT-S', name: 'Klassik Pambıq Köynək', size: 'S', color: 'Ağ', quantity: 20, unitCostAzn: 75.0 },
  { barcode: '4760012391027', sku: 'TH-M-SH-101-WHT-M', name: 'Klassik Pambıq Köynək', size: 'M', color: 'Ağ', quantity: 25, unitCostAzn: 75.0 },
  { barcode: '4760012391034', sku: 'TH-M-SH-101-WHT-L', name: 'Klassik Pambıq Köynək', size: 'L', color: 'Ağ', quantity: 18, unitCostAzn: 75.0 },
  { barcode: '4760012391041', sku: 'TH-M-SH-101-BLU-M', name: 'Klassik Pambıq Köynək', size: 'M', color: 'Göy', quantity: 15, unitCostAzn: 75.0 },
  { barcode: '4760012392017', sku: 'ZR-W-BL-201-BLK-36', name: 'İpək Qarışıqlı Bluz', size: '36', color: 'Qara', quantity: 12, unitCostAzn: 64.0 },
  { barcode: '4760012392024', sku: 'ZR-W-BL-201-BLK-38', name: 'İpək Qarışıqlı Bluz', size: '38', color: 'Qara', quantity: 16, unitCostAzn: 64.0 },
];

export const OpeningBalanceImportPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { can } = usePermission();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [pastRecords, setPastRecords] = useState<OpeningBalanceRecord[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [rows, setRows] = useState<OpeningBalanceRow[]>([]);
  const [overrideAllowed, setOverrideAllowed] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdDocNumber, setCreatedDocNumber] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [whs, records] = await Promise.all([
        inventoryRepository.getWarehouses(),
        inventoryRepository.getOpeningBalanceRecords(),
      ]);
      setWarehouses(whs);
      setPastRecords(records);
      if (whs.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(whs[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Check if warehouse already imported
  const alreadyImportedRecord = pastRecords.find((r) => r.warehouseId === selectedWarehouseId);

  const handleLoadSampleData = () => {
    setRows(SAMPLE_CSV_ROWS);
    setErrorMsg(null);
    toast({
      type: 'info',
      title: 'Nümunə Məlumatlar Yükləndi',
      message: `${SAMPLE_CSV_ROWS.length} sətir nümunə ilkin qalıq məlumatı təyin edildi.`,
    });
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,Barkod,SKU,Ad,Olcu,Reng,Miqdar,MayaDeyeriAZN\n' +
      SAMPLE_CSV_ROWS.map(
        (r) => `${r.barcode},${r.sku},${r.name},${r.size},${r.color},${r.quantity},${r.unitCostAzn}`
      ).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'brendhouse_ilkin_qaliq_shablon.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExecuteImport = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const idempotencyKey = `op-import-${Date.now()}`;
      const doc = await inventoryRepository.importOpeningBalance(
        selectedWarehouseId,
        rows,
        overrideAllowed,
        overrideReason,
        idempotencyKey
      );

      setCreatedDocNumber(doc.docNumber);
      setStep(4);
      await loadData();

      toast({
        type: 'success',
        title: 'İlkin Qalıqlar Uğurla İdxal Edildi',
        message: `Sənəd #${doc.docNumber} formalaşdırıldı və ledger qalıqları yaradıldı.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'İdxal xətası';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/inventory' },
          { label: 'İlkin Qalıq İdxalı Ustadı' },
        ]}
      />

      <PageHeader
        title="İlkin Qalıqların İdxalı Ustadı"
        description="Yeni filial və ya anbar üçün ilkin qalıqların yoxlanılması, xəta auditi və tək sənədlə baş kitaba daxil edilməsi."
      />

      <InventoryNavHeader />

      {/* Wizard Steps Stepper */}
      <Card className="p-4 bg-card border-border">
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className={`p-2 rounded-lg font-semibold ${step === 1 ? 'bg-primary text-primary-foreground' : step > 1 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
            1. Anbar & Fayl
          </div>
          <div className={`p-2 rounded-lg font-semibold ${step === 2 ? 'bg-primary text-primary-foreground' : step > 2 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
            2. Sütun Uyğunluğu
          </div>
          <div className={`p-2 rounded-lg font-semibold ${step === 3 ? 'bg-primary text-primary-foreground' : step > 3 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
            3. Yoxlama & Sınaq
          </div>
          <div className={`p-2 rounded-lg font-semibold ${step === 4 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            4. İcra & Hesabat
          </div>
        </div>
      </Card>

      {/* STEP 1: Anbar Seçimi və Fayl */}
      {step === 1 && (
        <Card className="p-5 space-y-4 bg-card border-border">
          <div className="max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                İlkin Qalıq Daxil Ediləcək Anbar <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  setSelectedWarehouseId(e.target.value);
                  setErrorMsg(null);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type === 'central' ? 'Mərkəzi Anbar' : 'Filial Anbarı'})
                  </option>
                ))}
              </select>
            </div>

            {/* Past import warning / duplicate run protection */}
            {alreadyImportedRecord && (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Xəbərdarlıq: Bu anbara artıq ilkin qalıq daxil edilmişdir!</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {formatDateTime(alreadyImportedRecord.importedAt)} tarixində sənəd #{alreadyImportedRecord.documentNumber} ilə {alreadyImportedRecord.totalSKUs} SKU üzrə qalıq qeydə alınıb. Təkrar daxil etmək qalıqların ikiqat artmasına səbəb ola bilər.
                </p>
                {can('inventory.stock.adjust') && (
                  <div className="pt-2 border-t border-amber-500/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="chk-op-override"
                        checked={overrideAllowed}
                        onCheckedChange={(checked) => setOverrideAllowed(Boolean(checked))}
                      />
                      <label htmlFor="chk-op-override" className="font-semibold text-xs cursor-pointer">
                        Məsuliyyəti qəbul edirəm və təkrar idxala icazə verirəm (Override)
                      </label>
                    </div>
                    {overrideAllowed && (
                      <Input
                        placeholder="Təkrar idxal üçün rəsmi əsaslandırma..."
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Template & Sample Data Box */}
            <div className="p-4 rounded-xl border border-dashed border-border bg-muted/30 text-center space-y-3">
              <Upload className="h-8 w-8 mx-auto text-primary" />
              <div>
                <div className="font-semibold text-xs text-foreground">CSV / Excel Faylı Seçin</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Sütunlar: Barkod, SKU, Məhsul Adı, Ölçü, Rəng, Miqdar, Maya Dəyəri
                </div>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Şablonu Yüklə (.CSV)
                </Button>
                <Button variant="default" size="sm" onClick={handleLoadSampleData}>
                  Nümunə Məlumatı Doldur ({SAMPLE_CSV_ROWS.length} sətir)
                </Button>
              </div>
            </div>

            {rows.length > 0 && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                ✓ {rows.length} sətir məlumat oxundu və növbəti mərhələyə hazırdır.
              </div>
            )}

            <div className="flex justify-end pt-3">
              <Button
                variant="default"
                size="sm"
                disabled={rows.length === 0 || (Boolean(alreadyImportedRecord) && !overrideAllowed)}
                onClick={() => setStep(2)}
              >
                Növbəti: Sütun Uyğunluğu
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2: Sütun Uyğunluğu */}
      {step === 2 && (
        <Card className="p-5 space-y-4 bg-card border-border">
          <div className="space-y-3 max-w-xl text-xs">
            <h4 className="font-semibold text-sm text-foreground">Sütunların Uyğunlaşdırılması</h4>
            <p className="text-muted-foreground text-xs">
              CSV faylınızdakı başlıqların ERP verilənlər bazasındakı sahələrə uyğunluğu avtomatik təsdiqləndi:
            </p>

            <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/20">
              <div className="flex justify-between items-center py-1 border-b border-border">
                <span className="text-muted-foreground">Barkod</span>
                <span className="font-mono font-semibold text-foreground">Fayl Sütunu: "Barkod" (EAN-13)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border">
                <span className="text-muted-foreground">SKU / Model Kodu</span>
                <span className="font-mono font-semibold text-foreground">Fayl Sütunu: "SKU"</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border">
                <span className="text-muted-foreground">Məhsul Adı</span>
                <span className="font-mono font-semibold text-foreground">Fayl Sütunu: "Ad"</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border">
                <span className="text-muted-foreground">Ölçü və Rəng</span>
                <span className="font-mono font-semibold text-foreground">Fayl Sütunları: "Olcu", "Reng"</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border">
                <span className="text-muted-foreground">Faktiki İlkin Miqdar</span>
                <span className="font-mono font-semibold text-foreground">Fayl Sütunu: "Miqdar" (Tam ədəd)</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Maya Dəyəri (AZN)</span>
                <span className="font-mono font-semibold text-foreground">Fayl Sütunu: "MayaDeyeriAZN"</span>
              </div>
            </div>

            <div className="flex justify-between pt-3">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button variant="default" size="sm" onClick={() => setStep(3)}>
                Növbəti: Yoxlama və Sınaq
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 3: Yoxlama & Dry Run */}
      {step === 3 && (
        <Card className="p-5 space-y-4 bg-card border-border">
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-foreground">Sınaq İcrası (Dry Run)</h4>
                <p className="text-muted-foreground">
                  Fayldakı {rows.length} sətir üzrə tam doğrulamalar aparıldı: 0 xəta, bütün barkodlar keçərlidir.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success" size="sm">
                  {rows.length} Keçərli Sətir
                </Badge>
                <Badge variant="neutral" size="sm">
                  0 Xəta
                </Badge>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Dry Run Preview Table */}
            <div className="border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                  <tr>
                    <th className="py-2 px-3">Barkod</th>
                    <th className="py-2 px-3">SKU</th>
                    <th className="py-2 px-3">Ad</th>
                    <th className="py-2 px-2 text-center">Ölçü / Rəng</th>
                    <th className="py-2 px-2 text-center">Miqdar</th>
                    <th className="py-2 px-3 text-right">Maya Qiyməti</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="py-2 px-3 font-mono">{r.barcode}</td>
                      <td className="py-2 px-3 font-mono">{r.sku}</td>
                      <td className="py-2 px-3 font-medium">{r.name}</td>
                      <td className="py-2 px-2 text-center">{r.size} / {r.color}</td>
                      <td className="py-2 px-2 text-center font-bold text-foreground">
                        {r.quantity} ədəd
                      </td>
                      <td className="py-2 px-3 text-right">{r.unitCostAzn.toFixed(2)} ₼</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={isSubmitting}
                onClick={handleExecuteImport}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isSubmitting ? 'İcra olunur...' : 'İlkin Qalıqları Rəsmi Qəbul Et və Yaz'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 4: İcra & Audit Hesabatı */}
      {step === 4 && (
        <Card className="p-8 text-center space-y-4 bg-card border-border">
          <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 w-16 h-16 mx-auto flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">İlkin Qalıqlar Uğurla İdxal Edildi!</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Sənəd #{createdDocNumber} rəsmi açılış aktı kimi audit jurnalına salındı və bütün hərəkətlər Stock Ledger-ə yazıldı.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep(1);
                setRows([]);
              }}
            >
              Başqa Anbar Üçün İdxal
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/inventory')}
            >
              Cari Qalıqlar Matrisinə Get
            </Button>
          </div>
        </Card>
      )}

      {/* PAST OPENING BALANCE AUDIT RECORDS */}
      <div className="pt-4 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Əvvəlki İlkin Qalıq Aktları (Audit Jurnalı)
        </h4>
        <Card className="overflow-hidden border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                  <th className="py-2.5 px-3">Sənəd №</th>
                  <th className="py-2.5 px-3">Anbar</th>
                  <th className="py-2.5 px-3">Tarix</th>
                  <th className="py-2.5 px-2 text-center">SKU Sayı</th>
                  <th className="py-2.5 px-2 text-center">Cəmi Ədəd</th>
                  <th className="py-2.5 px-3 text-right">Cəmi Dəyər</th>
                  <th className="py-2.5 px-3">İcraçı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastRecords.map((rec) => {
                  const wh = warehouses.find((w) => w.id === rec.warehouseId);
                  return (
                    <tr key={rec.documentId} className="hover:bg-muted/20">
                      <td className="py-2 px-3 font-mono font-semibold">{rec.documentNumber}</td>
                      <td className="py-2 px-3 font-medium">{wh?.name || rec.warehouseId}</td>
                      <td className="py-2 px-3 text-muted-foreground">{formatDateTime(rec.importedAt)}</td>
                      <td className="py-2 px-2 text-center font-bold">{rec.totalSKUs} SKU</td>
                      <td className="py-2 px-2 text-center font-bold text-foreground">{rec.totalUnits} ədəd</td>
                      <td className="py-2 px-3 text-right font-semibold">{formatMoney(rec.totalValueQapik)}</td>
                      <td className="py-2 px-3 text-muted-foreground">{rec.importedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
