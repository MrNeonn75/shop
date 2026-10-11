import React, { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  Input,
  NumberInput,
  MoneyInput,
  Select,
  Combobox,
  DatePicker,
  DateRangePicker,
  DateRange,
  Checkbox,
  RadioGroup,
  Switch,
  Textarea,
  FormField,
  Modal,
  Drawer,
  ConfirmDialog,
  Tabs,
  Tooltip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useToast,
  Badge,
  Avatar,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  KpiCard,
  Skeleton,
  EmptyState,
  ErrorState,
  Pagination,
  DataTable,
  FilterBar,
  FilterBarValues,
  FileUpload,
  PageHeader,
  PermissionGate,
  BrandLogo,
} from '../../../components/ui';
import { formatMoney, formatDate, formatDateTime, formatQty } from '../../../shared/utils/formatters';
import { toQapik, qapikToAznString } from '../../../shared/utils/money';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { UserRole } from '../../../shared/utils/permissions';
import {
  ShoppingBag,
  TrendingUp,
  Users,
  Building,
  MoreVertical,
  Plus,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { MOCK_PRODUCTS } from '../../../shared/adapters/mock/mockData';
import { Product } from '../../../shared/types/models';

export const UiShowcasePage: React.FC = () => {
  const { success, error, warning, info } = useToast();
  const { user, switchRoleForDemo } = useSessionStore();

  // State for Overlays
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmWithReason, setConfirmWithReason] = useState(true);

  // State for Form Controls
  const [buttonLoading, setButtonLoading] = useState(false);
  const [numberVal, setNumberVal] = useState(5);
  const [moneyQapik, setMoneyQapik] = useState(toQapik(14990)); // 149.90 ₼
  const [selectVal, setSelectVal] = useState('MD');
  const [comboboxVal, setComboboxVal] = useState('TH');
  const [dateVal, setDateVal] = useState<Date | null>(new Date());
  const [rangeVal, setRangeVal] = useState<DateRange>({
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  const [checkboxVal, setCheckboxVal] = useState<boolean | 'indeterminate'>(true);
  const [radioVal, setRadioVal] = useState('kisi');
  const [switchVal, setSwitchVal] = useState(true);
  const [textareaVal, setTextareaVal] = useState('BRAND HOUSE ERP sistemi üçün qeyd...');

  // State for FilterBar
  const [filterValues, setFilterValues] = useState<FilterBarValues>({
    search: '',
    branchId: 'all',
    dateRange: { startDate: null, endDate: null },
  });

  // State for Pagination
  const [page, setPage] = useState(1);

  // Table Columns
  const tableColumns: ColumnDef<Product, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Məhsulun Adı',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.sku}</span>
        </div>
      ),
    },
    {
      accessorKey: 'brand',
      header: 'Brend',
      cell: ({ row }) => (
        <Badge variant="neutral" size="sm">
          {row.original.brand}
        </Badge>
      ),
    },
    {
      accessorKey: 'section',
      header: 'Bölmə',
      cell: ({ row }) => <span className="capitalize">{row.original.section}</span>,
    },
    {
      accessorKey: 'priceQapik',
      header: 'Qiymət',
      cell: ({ row }) => (
        <span className="font-semibold">{formatMoney(row.original.priceQapik)}</span>
      ),
    },
    {
      accessorKey: 'stockQty',
      header: 'Stok',
      cell: ({ row }) => {
        const qty = row.original.stockQty;
        return (
          <Badge
            variant={qty > 20 ? 'success' : qty > 10 ? 'warning' : 'danger'}
            hasDot
            size="sm"
          >
            {formatQty(qty)} ədəd
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: 'Əməliyyat',
      cell: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-muted text-muted-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Baxış keçir</DropdownMenuItem>
            <DropdownMenuItem>Düzəliş et</DropdownMenuItem>
            <DropdownMenuItem destructive>Sil</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <PageHeader
        title="UI Komponent Sistemi & Dizayn Vitrini"
        description="BRAND HOUSE ERP üçün hazırlanmış bütün atomik və mürəkkəb komponentlərin interaktiv kataloqu."
        breadcrumbs={[
          { label: 'Sistem', href: '/' },
          { label: 'UI Vitrini' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setButtonLoading(true);
                setTimeout(() => setButtonLoading(false), 1500);
              }}
              isLoading={buttonLoading}
            >
              Yüklənmə Testi
            </Button>
            <Button
              size="sm"
              onClick={() => success('Əməliyyat uğurla tamamlandı!', 'Bütün dəyişikliklər qeydə alındı.')}
            >
              Test Bildirişi
            </Button>
          </div>
        }
      />

      {/* Main Tabs */}
      <Tabs
        defaultValue="typography"
        items={[
          {
            id: 'typography',
            label: '1. Tipoqrafiya & Qliflər',
            content: (
              <div className="space-y-6">
                {/* Azerbaijani Character Verification Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Azərbaycan Şrifti və Qlif Dəstəyinin Yoxlanılması</CardTitle>
                    <CardDescription>
                      Bütün xüsusi simvolların (ə, ı, ö, ü, ç, ş, ğ, İ) və böyük nöqtəli &quot;İ&quot; hərfinin düzgün vizuallaşdırılması.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 rounded-lg border border-border bg-muted/40 space-y-3 font-sans">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">
                            Kiçik hərflər:
                          </span>
                          <p className="text-xl font-medium tracking-wide">
                            ə ı ö ü ç ş ğ i
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">
                            Böyük hərflər (Dotted &quot;İ&quot; yoxlanışı):
                          </span>
                          <p className="text-xl font-medium tracking-wide">
                            Ə I Ö Ü Ç Ş Ğ İ
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border">
                        <span className="text-xs font-semibold text-muted-foreground uppercase">
                          Nümunəvi Pərakəndə Cümlə:
                        </span>
                        <p className="text-base text-foreground mt-1">
                          &quot;BRAND HOUSE mağazalarında kişi, qadın və uşaq geyimləri üzrə endirimlər başladı! İpək köynəklər, dəri ayaqqabılar və şalvarlar vitrində təqdim olunur.&quot;
                        </p>
                      </div>
                    </div>

                    {/* Formatters Verification */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                      <div className="p-3 rounded border border-border bg-card">
                        <span className="text-xs text-muted-foreground">formatMoney(3490 qəpik):</span>
                        <p className="text-lg font-bold text-foreground mt-1">{formatMoney(3490)}</p>
                      </div>
                      <div className="p-3 rounded border border-border bg-card">
                        <span className="text-xs text-muted-foreground">formatDate(Cari tarix):</span>
                        <p className="text-lg font-bold text-foreground mt-1">{formatDate(new Date())}</p>
                      </div>
                      <div className="p-3 rounded border border-border bg-card">
                        <span className="text-xs text-muted-foreground">formatDateTime(24h saat):</span>
                        <p className="text-lg font-bold text-foreground mt-1">{formatDateTime(new Date())}</p>
                      </div>
                      <div className="p-3 rounded border border-border bg-card">
                        <span className="text-xs text-muted-foreground">formatQty(1250 ədəd):</span>
                        <p className="text-lg font-bold text-foreground mt-1">{formatQty(1250)} əd.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Brand Design Tokens & Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle>Dizayn Tokenləri və Rəng Palitrası</CardTitle>
                    <CardDescription>
                      Bütün rənglər `src/styles/tokens.css` faylında təyin edilmiş dəyişənlər əsasında render olunur.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-border">
                        <div className="h-10 w-full rounded bg-bh-black border border-border" />
                        <span className="font-semibold">--bh-black</span>
                        <span className="text-muted-foreground">Əsas Qara</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-border">
                        <div className="h-10 w-full rounded bg-bh-white border border-border" />
                        <span className="font-semibold">--bh-white</span>
                        <span className="text-muted-foreground">Ağ</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-border">
                        <div className="h-10 w-full rounded bg-bh-accent border border-border" />
                        <span className="font-semibold">--bh-accent</span>
                        <span className="text-muted-foreground">Brend Aksent (#111111)</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-border">
                        <div className="h-10 w-full rounded bg-success" />
                        <span className="font-semibold text-success">--success</span>
                        <span className="text-muted-foreground">Uğur</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-border">
                        <div className="h-10 w-full rounded bg-warning" />
                        <span className="font-semibold text-warning">--warning</span>
                        <span className="text-muted-foreground">Xəbərdarlıq</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-border">
                        <div className="h-10 w-full rounded bg-danger" />
                        <span className="font-semibold text-danger">--danger</span>
                        <span className="text-muted-foreground">Təhlükə / Xəta</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Brand Logos */}
                <Card>
                  <CardHeader>
                    <CardTitle>Brend Loqoları və Yazılı İfadə (BrandLogo)</CardTitle>
                    <CardDescription>
                      SVG vektor loqosu və &quot;BRAND HOUSE&quot; mətn ehtiyatı (wordmark fallback).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-8 p-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">Kiçik (sm):</span>
                      <BrandLogo size="sm" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">Orta (md):</span>
                      <BrandLogo size="md" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">Böyük (lg):</span>
                      <BrandLogo size="lg" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">Yalnız ikon:</span>
                      <BrandLogo size="md" showWordmark={false} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            id: 'buttons',
            label: '2. Düymələr & Nişanlar',
            content: (
              <div className="space-y-6">
                {/* Buttons Variants */}
                <Card>
                  <CardHeader>
                    <CardTitle>Düymə Variantları və Ölçüləri (Button)</CardTitle>
                    <CardDescription>
                      Bütün variantlar, ölçülər, ikon yuvaları və yüklənmə (loading) rejimi.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="default">Əsas (Default)</Button>
                      <Button variant="secondary">İkinci dərəcəli</Button>
                      <Button variant="outline">Konturlu (Outline)</Button>
                      <Button variant="ghost">Şəffaf (Ghost)</Button>
                      <Button variant="destructive">Ləğv / Sil (Danger)</Button>
                      <Button variant="link">Keçid (Link)</Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                      <Button size="sm">Kiçik (sm)</Button>
                      <Button size="md">Orta (md)</Button>
                      <Button size="lg">Böyük (lg)</Button>
                      <Button size="icon" variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button isLoading={true}>Yüklənir...</Button>
                      <Button disabled>Deaktiv</Button>
                      <Button leftIcon={<Plus className="h-4 w-4" />}>İkon ilə</Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Badges and Avatars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Status Nişanları (Badge / StatusPill)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default">Əsas</Badge>
                        <Badge variant="neutral">Neytral</Badge>
                        <Badge variant="outline">Konturlu</Badge>
                        <Badge variant="success">Stokda var</Badge>
                        <Badge variant="warning">Az qalıb</Badge>
                        <Badge variant="danger">Bitib</Badge>
                        <Badge variant="info">Məlumat</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <Badge variant="success" hasDot>
                          Aktiv filial
                        </Badge>
                        <Badge variant="warning" hasDot>
                          Gözləmədə
                        </Badge>
                        <Badge variant="danger" hasDot>
                          Bloklandı
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>İstifadəçi Avatarları (Avatar)</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center gap-4">
                      <Avatar fallbackText="Elşən Məmmədov" size="sm" status="online" />
                      <Avatar fallbackText="Nigar Hüseynova" size="md" status="busy" />
                      <Avatar fallbackText="Rəşad Əliyev" size="lg" status="offline" />
                      <Avatar fallbackText="BRAND HOUSE" size="xl" />
                    </CardContent>
                  </Card>
                </div>

                {/* Tooltips and Skeletons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>İpucu Bildirişləri (Tooltip)</CardTitle>
                      <CardDescription>
                        Radix Tooltip primitives ilə kontekst məlumatının göstərilməsi.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center gap-3">
                      <Tooltip content="Məhsulu daimi olaraq silər">
                        <Button variant="outline" size="sm">Silmə İpucu</Button>
                      </Tooltip>
                      <Tooltip content="Yalnız səlahiyyətli menecerlər üçün açıqdır">
                        <Button variant="secondary" size="sm">Menecer İpucu</Button>
                      </Tooltip>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Yüklənmə İskeletləri (Skeleton)</CardTitle>
                      <CardDescription>
                        Məlumatlar gələnə qədər vizual placeholder strukturları.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton variant="text" className="w-3/4 h-4" />
                      <div className="flex items-center gap-3">
                        <Skeleton variant="circular" className="w-10 h-10" />
                        <div className="space-y-1.5 flex-1">
                          <Skeleton variant="text" className="w-1/2 h-3" />
                          <Skeleton variant="text" className="w-1/3 h-3" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            id: 'forms',
            label: '3. Form İdarəetmələri',
            content: (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Form Giriş Sahələri & Validasiya</CardTitle>
                    <CardDescription>
                      Bütün xanalar FormField ilə tam əlçatanlıq (aria-invalid, label, hint, error) təmin edir.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {/* Input */}
                      <FormField label="Məhsulun Adı" required hint="Dəqiq model adını daxil edin">
                        <Input placeholder="Məs: Klassik Pambıq Köynək" />
                      </FormField>

                      {/* NumberInput */}
                      <FormField label="Miqdar (Ədəd)" required>
                        <NumberInput
                          value={numberVal}
                          onChange={setNumberVal}
                          min={1}
                          max={100}
                        />
                      </FormField>

                      {/* MoneyInput */}
                      <FormField
                        label="Satış Qiyməti (AZN)"
                        required
                        hint={`Daxili integer: ${moneyQapik} qəpik (${qapikToAznString(moneyQapik)} ₼)`}
                      >
                        <MoneyInput
                          value={moneyQapik}
                          onMoneyChange={(val) => setMoneyQapik(val.qapik)}
                        />
                      </FormField>

                      {/* Select */}
                      <FormField label="Brend">
                        <Select
                          value={selectVal}
                          onValueChange={setSelectVal}
                          options={[
                            { value: 'MD', label: 'Massimo Dutti' },
                            { value: 'TH', label: 'Tommy Hilfiger' },
                            { value: 'ZR', label: 'Zara' },
                            { value: 'AD', label: 'Adidas' },
                          ]}
                        />
                      </FormField>

                      {/* Combobox */}
                      <FormField label="Təchizatçı Axtarışı">
                        <Combobox
                          value={comboboxVal}
                          onSelect={setComboboxVal}
                          options={[
                            { value: 'TH', label: 'Tommy Hilfiger Europe B.V.', sublabel: 'Niderland' },
                            { value: 'MD', label: 'Inditex Massimo Dutti S.A.', sublabel: 'İspaniya' },
                            { value: 'ZR', label: 'Zara Fashion Group', sublabel: 'İspaniya' },
                            { value: 'AD', label: 'Adidas AG Germany', sublabel: 'Almaniya' },
                          ]}
                        />
                      </FormField>

                      {/* DatePicker */}
                      <FormField label="Gəliş Tarixi">
                        <DatePicker value={dateVal} onChange={setDateVal} />
                      </FormField>

                      {/* DateRangePicker */}
                      <div className="md:col-span-2">
                        <FormField label="Hesabat Dövrü">
                          <DateRangePicker value={rangeVal} onChange={setRangeVal} />
                        </FormField>
                      </div>

                      {/* Checkbox & Switch */}
                      <div className="flex flex-col gap-4 justify-center">
                        <Checkbox
                          checked={checkboxVal}
                          onCheckedChange={setCheckboxVal}
                          label="ƏDV tətbiq edilsin (18%)"
                          hint="Vergi daxili qiymətləndirmə üçün aktiv edin"
                        />
                        <Switch
                          checked={switchVal}
                          onCheckedChange={setSwitchVal}
                          label="Onlayn mağazada aktivdir"
                          hint="Məhsul e-ticarət vitrinində göstərilir"
                        />
                      </div>

                      {/* Radio */}
                      <div className="md:col-span-3 pt-2">
                        <FormField label="Məhsul Bölməsi">
                          <RadioGroup
                            value={radioVal}
                            onValueChange={setRadioVal}
                            orientation="horizontal"
                            options={[
                              { value: 'kisi', label: 'Kişi' },
                              { value: 'qadin', label: 'Qadın' },
                              { value: 'usaq', label: 'Uşaq' },
                              { value: 'diger', label: 'Digər' },
                            ]}
                          />
                        </FormField>
                      </div>

                      {/* Textarea */}
                      <div className="md:col-span-3">
                        <FormField label="Əlavə Qeydlər" hint="Maksimum 300 simvol">
                          <Textarea
                            value={textareaVal}
                            onChange={(e) => setTextareaVal(e.target.value)}
                            maxLength={300}
                            showCharCount
                            rows={3}
                          />
                        </FormField>
                      </div>

                      {/* FileUpload */}
                      <div className="md:col-span-3">
                        <FormField label="Məhsul Şəkilləri və ya Faktura Faylı">
                          <FileUpload
                            accept="image/*,.pdf,.xlsx"
                            maxSizeBytes={5 * 1024 * 1024}
                            onFilesSelected={(files) =>
                              info(`Fayllar seçildi: ${files.map((f) => f.name).join(', ')}`)
                            }
                          />
                        </FormField>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            id: 'feedback',
            label: '4. Dialoq & Bildirişlər',
            content: (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Modallar, Çəkməcələr və Təsdiq Dialoqları</CardTitle>
                    <CardDescription>
                      Radix Dialog primitives ilə qurulmuş pəncərələr.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3">
                    <Button onClick={() => setIsModalOpen(true)}>Modal Pəncərəni Aç</Button>
                    <Button variant="outline" onClick={() => setIsDrawerOpen(true)}>
                      Sağ Çəkməcəni (Drawer) Aç
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setConfirmWithReason(true);
                        setIsConfirmOpen(true);
                      }}
                    >
                      Səbəbli Təsdiq Dialoqu (Sənəd Ləğvi)
                    </Button>
                  </CardContent>
                </Card>

                {/* Toasts Trigger Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Bildirişlər Sistemi (Toast)</CardTitle>
                    <CardDescription>
                      Fərqli semantik kateqoriyalar üzrə avtomatik itən bildirişlər.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => success('Məlumat yeniləndi', 'Məhsul parametrləri uğurla yadda saxlanıldı.')}
                    >
                      Uğur (Success)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => error('Xəta baş verdi', 'Server sorğuya 500 kodu ilə cavab verdi.')}
                    >
                      Xəta (Error)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => warning('Stok xəbərdarlığı', 'Bu məhsuldan cəmi 2 ədəd qalıb.')}
                    >
                      Xəbərdarlıq (Warning)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => info('Sinxronizasiya', 'Filial qalığı fon rejimində yenilənir.')}
                    >
                      Məlumat (Info)
                    </Button>
                  </CardContent>
                </Card>

                {/* Skeletons and Empty/Error States */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Boş Ekran (EmptyState)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <EmptyState
                        title="Heç bir sifariş tapılmadı"
                        description="Seçilmiş filial üzrə bu gün hələ ki heç bir satış qeydə alınmayıb."
                        action={<Button size="sm">Yeni Satış Yarat</Button>}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Xəta Ekranı (ErrorState)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ErrorState
                        title="Məlumat yüklənməsi uğursuz oldu"
                        description="API əlaqəsi kəsildi. Zəhmət olmasa yenidən cəhd edin."
                        error={new Error('NetworkTimeoutError: connection to 8000 timed out after 30000ms')}
                        onRetry={() => info('Yenidən sorğu göndərildi...')}
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            id: 'data',
            label: '5. Cədvəl & Məlumat Ekranı',
            content: (
              <div className="space-y-6">
                {/* KPI Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    title="Gündəlik Satış"
                    value={formatMoney(1425000)} // 14,250.00 ₼
                    changePercentage={12.4}
                    icon={<ShoppingBag className="h-4 w-4" />}
                    periodText="dünənə nisbətən"
                  />
                  <KpiCard
                    title="Aktiv Çeklər"
                    value="148"
                    changePercentage={-3.1}
                    icon={<TrendingUp className="h-4 w-4" />}
                    periodText="əvvəlki həftəyə nisbətən"
                  />
                  <KpiCard
                    title="Müştəri Ziyarəti"
                    value="842"
                    changePercentage={8.5}
                    icon={<Users className="h-4 w-4" />}
                    periodText="keçən aya nisbətən"
                  />
                  <KpiCard
                    title="Filiallar"
                    value="4"
                    subtitle="Bütün filiallar aktivdir"
                    icon={<Building className="h-4 w-4" />}
                  />
                </div>

                {/* FilterBar */}
                <FilterBar
                  values={filterValues}
                  onChange={setFilterValues}
                  onReset={() =>
                    setFilterValues({
                      search: '',
                      branchId: 'all',
                      dateRange: { startDate: null, endDate: null },
                    })
                  }
                />

                {/* DataTable */}
                <Card>
                  <CardHeader>
                    <CardTitle>Cədvəl Nümunəsi (DataTable)</CardTitle>
                    <CardDescription>
                      Sütun gizlətmə, sətir seçimi, çeşidləmə, səhifələmə və UTF-8 CSV ixrac dəstəyi ilə.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={tableColumns}
                      data={MOCK_PRODUCTS}
                      enableRowSelection={true}
                      pageSize={5}
                      exportFilename="brend_house_mehsullar.csv"
                    />

                    <div className="pt-4 border-t border-border space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Müstəqil Səhifələmə Komponenti (Pagination):
                      </span>
                      <Pagination
                        currentPage={page}
                        totalPages={10}
                        totalItems={96}
                        pageSize={10}
                        onPageChange={setPage}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Permission Gate Demo */}
                <Card>
                  <CardHeader>
                    <CardTitle>İcazə Qapısı (PermissionGate UX)</CardTitle>
                    <CardDescription>
                      Cari aktiv istifadəçi rolu: <strong>{user?.role}</strong>. Yuxarı sağ menyudan rolu dəyişib yoxlaya bilərsiniz.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Test üçün rolu dəyiş:</span>
                      {(['superadmin', 'cashier', 'warehouse_keeper'] as UserRole[]).map((r) => (
                        <Button
                          key={r}
                          size="sm"
                          variant={user?.role === r ? 'default' : 'outline'}
                          onClick={() => switchRoleForDemo(r)}
                        >
                          {r}
                        </Button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="p-4 rounded border border-border bg-card">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Yalnız Superadmin / Admin üçün görünən hissə:
                        </span>
                        <div className="mt-2">
                          <PermissionGate
                            role={['superadmin', 'general_manager']}
                            fallback={
                              <div className="p-3 bg-danger/10 border border-danger/20 rounded text-xs text-danger flex items-center gap-2">
                                <Lock className="h-4 w-4" />
                                <span>Bu blok yalnız adminlər üçün açıqdır (Gizlədilib).</span>
                              </div>
                            }
                          >
                            <div className="p-3 bg-success/10 border border-success/20 rounded text-xs text-success flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Siz superadmin/adminsiniz: Maliyyə konfiqurasiyasına giriş icazəniz var.</span>
                            </div>
                          </PermissionGate>
                        </div>
                      </div>

                      <div className="p-4 rounded border border-border bg-card">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Satış Yaratma İcazəsi (sales:create):
                        </span>
                        <div className="mt-2">
                          <PermissionGate
                            permission="sales:create"
                            fallback={
                              <div className="p-3 bg-muted rounded text-xs text-muted-foreground">
                                Satış səlahiyyətiniz yoxdur.
                              </div>
                            }
                          >
                            <Button size="sm" variant="default">
                              POS Satışını Başlat
                            </Button>
                          </PermissionGate>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
      />

      {/* Modal Instance */}
      <Modal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Yeni Məhsul Qeydiyyatı"
        description="Məhsulun ilkin texniki parametrlərini daxil edin."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Ləğv et
            </Button>
            <Button
              onClick={() => {
                success('Məhsul yadda saxlanıldı!');
                setIsModalOpen(false);
              }}
            >
              Yadda saxla
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormField label="SKU / Artikul">
            <Input placeholder="Məs: TH-2026-M" />
          </FormField>
          <FormField label="İlkin Qalıq">
            <NumberInput defaultValue={10} min={1} />
          </FormField>
        </div>
      </Modal>

      {/* Drawer Instance */}
      <Drawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        title="Filial Detalları"
        description="Nizami (Baş Filial) cari operativ məlumatları"
        footer={
          <Button variant="default" className="w-full" onClick={() => setIsDrawerOpen(false)}>
            Tamamlandı
          </Button>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="p-3 rounded border border-border bg-muted/40 space-y-1">
            <span className="text-xs text-muted-foreground">Ünvan:</span>
            <p className="font-medium">Nizami küçəsi 84, Bakı</p>
          </div>
          <div className="p-3 rounded border border-border bg-muted/40 space-y-1">
            <span className="text-xs text-muted-foreground">Menecer:</span>
            <p className="font-medium">Rəşad Əliyev</p>
          </div>
          <div className="p-3 rounded border border-border bg-muted/40 space-y-1">
            <span className="text-xs text-muted-foreground">Əlaqə:</span>
            <p className="font-medium">+994 (12) 498-10-20</p>
          </div>
        </div>
      </Drawer>

      {/* ConfirmDialog Instance */}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        variant="danger"
        title="Məhsulu silmək istədiyinizdən əminsiniz?"
        description="Bu əməliyyat geri qaytarılmır. Məhsul kataloqdan və stok siyahısından silinəcəkdir."
        showReasonField={confirmWithReason}
        reasonRequired={true}
        reasonLabel="Silinmə səbəbini mütləq qeyd edin:"
        onConfirm={(reason) => {
          success('Məhsul silindi', `Səbəb qeydə alındı: ${reason}`);
          setIsConfirmOpen(false);
        }}
      />
    </div>
  );
};
