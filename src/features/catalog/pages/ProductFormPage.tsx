import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { catalogRepository } from '../../../shared/adapters';
import {
  productFormSchema,
  ProductFormValues,
} from '../schemas/productSchema';
import {
  ProductVariant,
} from '../types/catalog';
import {
  STANDARD_COLORS,
  PRESET_SIZES_BY_TYPE,
  generateVariantMatrix,
  validateMatrixDuplicates,
} from '../utils/matrixGenerator';
import { generateEan13 } from '../utils/barcode';
import { toQapik } from '../../../shared/utils/money';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import {
  Save,
  ArrowLeft,
  Tag,
  DollarSign,
  Grid,
  Truck,
  Image as ImageIcon,
  History,
  Globe,
  Sparkles,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  Upload,
  Info,
} from 'lucide-react';
import { useToast } from '../../../components/ui';

type TabKey = 'general' | 'pricing' | 'variants' | 'suppliers' | 'images' | 'history' | 'web';

const DRAFT_STORAGE_KEY = 'bh_catalog_product_draft';

export const ProductFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id && id !== 'new');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError, info } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('general');

  // Matrix generation state
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['M', 'L']);
  const [selectedColors, setSelectedColors] = useState<string[]>(['Qara', 'Ağ']);

  // Fetch dropdown options
  const { data: categories = [] } = useQuery({
    queryKey: ['catalog-categories-list'],
    queryFn: () => catalogRepository.getCategories(),
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['catalog-brands-list'],
    queryFn: () => catalogRepository.getBrands(),
  });

  // Fetch existing product if editing
  const { data: existingProduct, isLoading: isLoadingProduct } = useQuery({
    queryKey: ['catalog-product', id],
    queryFn: () => (isEditing && id ? catalogRepository.getProductById(id) : null),
    enabled: isEditing,
  });

  const defaultValues: ProductFormValues = useMemo(() => {
    if (existingProduct) {
      return {
        name: existingProduct.name,
        description: existingProduct.description || '',
        sku: existingProduct.sku,
        barcode: existingProduct.barcode,
        section: existingProduct.section,
        type: existingProduct.type,
        categoryId: existingProduct.categoryId,
        subcategoryId: existingProduct.subcategoryId || '',
        brandId: existingProduct.brandId,
        unit: existingProduct.unit || 'ədəd',
        taxClassId: existingProduct.taxClassId || 'tax-standard',
        minStockLevel: existingProduct.minStockLevel || 5,
        status: existingProduct.status,
        priceQapik: existingProduct.priceQapik,
        costPriceQapik: existingProduct.costPriceQapik,
        effectiveFrom: new Date().toISOString().slice(0, 16),
        priceChangeReason: '',
        variants: existingProduct.variants || [],
        suppliers: existingProduct.suppliers || [],
        images: existingProduct.images || [],
      };
    }

    // Try draft restore for new product
    const savedDraft = !isEditing ? localStorage.getItem(DRAFT_STORAGE_KEY) : null;
    if (savedDraft) {
      try {
        return JSON.parse(savedDraft);
      } catch {
        // ignore
      }
    }

    return {
      name: '',
      description: '',
      sku: '',
      barcode: generateEan13(),
      section: 'kisi',
      type: 'geyim',
      categoryId: '',
      subcategoryId: '',
      brandId: '',
      unit: 'ədəd',
      taxClassId: 'tax-standard',
      minStockLevel: 5,
      status: 'active',
      priceQapik: toQapik(0),
      costPriceQapik: toQapik(0),
      effectiveFrom: new Date().toISOString().slice(0, 16),
      priceChangeReason: '',
      variants: [
        {
          sku: 'BH-ITEM-01',
          barcode: generateEan13(),
          size: 'M',
          color: 'Qara',
          stockQty: 0,
          status: 'active',
        },
      ],
      suppliers: [],
      images: [],
    };
  }, [existingProduct, isEditing]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues,
  });

  useEffect(() => {
    if (existingProduct) {
      reset(defaultValues);
    }
  }, [existingProduct, defaultValues, reset]);

  // Autosave draft locally
  useEffect(() => {
    if (!isEditing && isDirty) {
      const subscription = watch((value) => {
        try {
          localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
        } catch {
          // ignore storage limit
        }
      });
      return () => subscription.unsubscribe();
    }
  }, [watch, isDirty, isEditing]);

  // Manage variant array
  const {
    fields: variantFields,
    append: appendVariant,
    remove: removeVariant,
    replace: replaceVariants,
  } = useFieldArray({
    control,
    name: 'variants',
  });

  // Watch fields for live financial calculations
  const watchedPriceQapik = watch('priceQapik') || 0;
  const watchedCostPriceQapik = watch('costPriceQapik') || 0;
  const watchedType = watch('type');
  const watchedSection = watch('section');
  const watchedBaseSku = watch('sku');
  const watchedRawVariants = watch('variants');
  const watchedVariants = useMemo(() => watchedRawVariants || [], [watchedRawVariants]);

  // Live Margin % and Markup % calculation
  const financialMetrics = useMemo(() => {
    const price = watchedPriceQapik;
    const cost = watchedCostPriceQapik;

    if (price <= 0) {
      return { marginPercent: 0, markupPercent: 0, grossProfitQapik: 0 };
    }

    const profit = price - cost;
    const margin = (profit / price) * 100;
    const markup = cost > 0 ? (profit / cost) * 100 : 100;

    return {
      marginPercent: Math.round(margin * 10) / 10,
      markupPercent: Math.round(markup * 10) / 10,
      grossProfitQapik: profit,
    };
  }, [watchedPriceQapik, watchedCostPriceQapik]);

  // Variant inline duplicate validation
  const matrixValidation = useMemo(() => {
    return validateMatrixDuplicates(watchedVariants as ProductVariant[]);
  }, [watchedVariants]);

  // Mutation for creating / updating product
  const saveMutation = useMutation({
    mutationFn: async (formData: ProductFormValues) => {
      // Find category and brand names
      const cat = categories.find((c) => c.id === formData.categoryId);
      const brand = brands.find((b) => b.id === formData.brandId);

      const categoryName = cat?.name || 'Ümumi';
      const brandName = brand?.name || 'Brend House';

      const variants: ProductVariant[] = formData.variants.map((v, i) => ({
        ...v,
        id: v.id || `var-${Date.now()}-${i}`,
        productId: id || 'new',
        priceOverrideQapik:
          typeof v.priceOverrideQapik === 'number'
            ? toQapik(v.priceOverrideQapik)
            : undefined,
        costPriceOverrideQapik:
          typeof v.costPriceOverrideQapik === 'number'
            ? toQapik(v.costPriceOverrideQapik)
            : undefined,
        stockQty: v.stockQty || 0,
        status: v.status || 'active',
      }));

      const suppliers: import('../types/catalog').ProductSupplierLink[] = (
        formData.suppliers || []
      ).map((s) => ({
        ...s,
        lastPurchasePriceQapik: toQapik(s.lastPurchasePriceQapik),
      }));

      if (isEditing && id) {
        // Price change detection: if price changed, record in history
        let priceHistory = existingProduct?.priceHistory || [];
        if (existingProduct && existingProduct.priceQapik !== formData.priceQapik) {
          priceHistory = [
            ...priceHistory,
            {
              id: `ph-${Date.now()}`,
              effectiveFrom: new Date(formData.effectiveFrom).toISOString(),
              priceQapik: toQapik(formData.priceQapik),
              oldPriceQapik: existingProduct.priceQapik,
              changedBy: 'İnzibatçı',
              reason: formData.priceChangeReason || 'Dövri qiymət korreksiyası',
              createdAt: new Date().toISOString(),
            },
          ];
        }

        return catalogRepository.updateProduct(id, {
          ...formData,
          variants,
          suppliers,
          priceQapik: toQapik(formData.priceQapik),
          costPriceQapik: toQapik(formData.costPriceQapik),
          categoryName,
          brandName,
          priceHistory,
        });
      } else {
        const now = new Date().toISOString();
        return catalogRepository.createProduct({
          ...formData,
          variants,
          suppliers,
          priceQapik: toQapik(formData.priceQapik),
          costPriceQapik: toQapik(formData.costPriceQapik),
          categoryName,
          brandName,
          stockQty: 0,
          priceHistory: [
            {
              id: `ph-${Date.now()}`,
              effectiveFrom: new Date(formData.effectiveFrom).toISOString(),
              priceQapik: toQapik(formData.priceQapik),
              changedBy: 'İlkin Qeydiyyat',
              createdAt: now,
            },
          ],
          costHistory: [
            {
              id: `ch-${Date.now()}`,
              effectiveFrom: now,
              costPriceQapik: toQapik(formData.costPriceQapik),
              changedBy: 'İlkin Maya',
              createdAt: now,
            },
          ],
          syncStatus: 'not_configured',
        });
      }
    },
    onSuccess: (savedProduct) => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      success(
        isEditing
          ? `"${savedProduct.name}" məhsulu uğurla yeniləndi.`
          : `Yeni məhsul "${savedProduct.name}" kataloqa əlavə edildi.`
      );
      navigate('/catalog');
    },
    onError: (err: Error) => {
      // Map 409 unique-identifier errors to exact fields
      const msg = err.message || '';
      if (msg.includes('SKU')) {
        setError('sku', { type: 'manual', message: msg });
        setActiveTab('general');
      } else if (msg.includes('Barkod')) {
        setError('barcode', { type: 'manual', message: msg });
        setActiveTab('general');
      }
      toastError(msg || 'Məhsulu yadda saxlayarkən xəta baş verdi.');
    },
  });

  // Handler for Matrix Generation Button
  const handleGenerateMatrix = () => {
    if (!watchedBaseSku) {
      toastError('Əvvəlcə Əsas tabında baza SKU kodunu daxil edin.');
      setActiveTab('general');
      return;
    }

    const generated = generateVariantMatrix({
      productId: id || 'new',
      baseSku: watchedBaseSku,
      sizes: selectedSizes,
      colors: selectedColors,
      existingVariants: watchedVariants as ProductVariant[],
    });

    replaceVariants(generated);
    success(`${generated.length} variantlı ölçü × rəng matrisi yaradıldı.`);
  };

  const onSubmit = (data: ProductFormValues) => {
    if (!matrixValidation.isValid) {
      setActiveTab('variants');
      toastError('Variantlar arasında təkrarlanan SKU və ya barkod xətaları var.');
      return;
    }
    saveMutation.mutate(data);
  };

  if (isEditing && isLoadingProduct) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Məhsul məlumatları yüklənir...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-20">
      <PageHeader
        title={isEditing ? `Məhsul: ${existingProduct?.name || ''}` : 'Yeni Məhsul Kartı'}
        description="Məhsulun əsas rekvizitləri, qiymət tarixi qorunması, variant matrisi və inteqrasiyalar."
        breadcrumbs={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Kataloq', href: '/catalog' },
          { label: isEditing ? 'Redaktə' : 'Yeni Məhsul' },
        ]}
        badge={
          isDirty ? (
            <Badge variant="warning" size="sm">
              Yadda saxlanılmamış dəyişikliklər
            </Badge>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => {
                if (isDirty && !confirm('Yadda saxlanılmamış dəyişikliklər itəcək. Çıxmaq istəyirsiniz?')) {
                  return;
                }
                navigate('/catalog');
              }}
            >
              Geri
            </Button>
            <Button
              type="submit"
              size="sm"
              leftIcon={<Save className="h-4 w-4" />}
              isLoading={saveMutation.isPending}
            >
              Yadda Saxla
            </Button>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="border-b border-border bg-card rounded-t-lg">
        <nav className="flex space-x-1 p-2 overflow-x-auto" aria-label="Tabs">
          {[
            { key: 'general', label: 'Əsas', icon: Tag, error: !!(errors.name || errors.sku || errors.barcode || errors.categoryId || errors.brandId) },
            { key: 'pricing', label: 'Qiymət və Maya', icon: DollarSign, error: !!(errors.priceQapik || errors.effectiveFrom) },
            { key: 'variants', label: `Variantlar (${variantFields.length})`, icon: Grid, error: !!errors.variants || !matrixValidation.isValid },
            { key: 'suppliers', label: 'Təchizatçılar', icon: Truck, error: !!errors.suppliers },
            { key: 'images', label: 'Şəkillər', icon: ImageIcon, error: !!errors.images },
            { key: 'history', label: 'Qiymət Tarixçəsi', icon: History, error: false },
            { key: 'web', label: 'Sayt İnteqrasiyası', icon: Globe, error: false },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key as TabKey)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
                {t.error && (
                  <span className="w-2 h-2 rounded-full bg-danger inline-block animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: ƏSAS */}
      {activeTab === 'general' && (
        <Card>
          <CardHeader>
            <CardTitle>Əsas Məlumatlar və Təsnifat</CardTitle>
            <CardDescription>
              Məhsulun sistem identifikatorları, kateqoriya mənsubiyyəti və qalıq limitləri.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Məhsulun Adı *</label>
                <Input
                  {...register('name')}
                  placeholder="məs: Klassik Pambıq Köynək Regular Fit"
                  className="mt-1"
                />
                {errors.name && (
                  <p className="text-xs text-danger mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Brend *</label>
                <Controller
                  name="brandId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: '', label: 'Brend seçin' },
                        ...brands.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
                      ]}
                      className="mt-1"
                    />
                  )}
                />
                {errors.brandId && (
                  <p className="text-xs text-danger mt-1">{errors.brandId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Bölmə *</label>
                <Controller
                  name="section"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: 'kisi', label: 'Kişi' },
                        { value: 'qadin', label: 'Qadın' },
                        { value: 'usaq', label: 'Uşaq' },
                        { value: 'diger', label: 'Digər' },
                      ]}
                      className="mt-1"
                    />
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Məhsul Tipi *</label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: 'geyim', label: 'Geyim' },
                        { value: 'ayaqqabi', label: 'Ayaqqabı' },
                        { value: 'aksesuar', label: 'Aksesuar' },
                      ]}
                      className="mt-1"
                    />
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Kateqoriya *</label>
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: '', label: 'Kateqoriya seçin' },
                        ...categories
                          .filter((c) => !watchedSection || c.section === watchedSection)
                          .map((c) => ({ value: c.id, label: c.name })),
                      ]}
                      className="mt-1"
                    />
                  )}
                />
                {errors.categoryId && (
                  <p className="text-xs text-danger mt-1">{errors.categoryId.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Status</label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: 'active', label: 'Aktiv (Satışda)' },
                        { value: 'archived', label: 'Dayandırılıb' },
                      ]}
                      className="mt-1"
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-border">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Baza SKU Kodu *</label>
                <Input
                  {...register('sku')}
                  placeholder="məs: TH-M-SH-101"
                  className="mt-1 font-mono uppercase"
                />
                {errors.sku && <p className="text-xs text-danger mt-1">{errors.sku.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">Əsas Barkod (EAN-13) *</label>
                  <button
                    type="button"
                    onClick={() => setValue('barcode', generateEan13(), { shouldDirty: true })}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="h-2.5 w-2.5" />
                    Yeni Gen
                  </button>
                </div>
                <Input
                  {...register('barcode')}
                  placeholder="4760012390112"
                  className="mt-1 font-mono"
                />
                {errors.barcode && (
                  <p className="text-xs text-danger mt-1">{errors.barcode.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Ölçü Vahidi</label>
                <Controller
                  name="unit"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: 'ədəd', label: 'ədəd' },
                        { value: 'cüt', label: 'cüt' },
                        { value: 'dəst', label: 'dəst' },
                        { value: 'metr', label: 'metr' },
                        { value: 'kq', label: 'kq' },
                      ]}
                      className="mt-1"
                    />
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Minimum Stok Həddi</label>
                <Controller
                  name="minStockLevel"
                  control={control}
                  render={({ field }) => (
                    <NumberInput
                      value={field.value}
                      onChange={field.onChange}
                      min={0}
                      className="mt-1"
                    />
                  )}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Məhsul Təsviri</label>
              <Textarea
                {...register('description')}
                placeholder="Məhsulun tərkibi, parça xüsusiyyətləri, yuyulma qaydaları və digər qeydlər..."
                rows={3}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: QİYMƏT VƏ MAYA */}
      {activeTab === 'pricing' && (
        <Card>
          <CardHeader>
            <CardTitle>Qiymət Siyasəti və Marja Hesablanması</CardTitle>
            <CardDescription>
              Satış qiyməti, maya dəyəri və qüvvəyə minmə tarixi. Qayda: Qiymət dəyişiklikləri
              keçmiş sənədlərin qiymətini yenidən yazmır.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Pərakəndə Satış Qiyməti (AZN) *
                  </label>
                  <Controller
                    name="priceQapik"
                    control={control}
                    render={({ field }) => (
                      <MoneyInput
                        value={field.value}
                        onMoneyChange={(val) => field.onChange(val.qapik)}
                        className="mt-1"
                      />
                    )}
                  />
                  {errors.priceQapik && (
                    <p className="text-xs text-danger mt-1">{errors.priceQapik.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    İlkin Maya Dəyəri (AZN)
                  </label>
                  <Controller
                    name="costPriceQapik"
                    control={control}
                    render={({ field }) => (
                      <MoneyInput
                        value={field.value}
                        onMoneyChange={(val) => field.onChange(val.qapik)}
                        className="mt-1"
                      />
                    )}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Qüvvəyə Minmə Tarixi və Vaxtı *
                  </label>
                  <Input
                    type="datetime-local"
                    {...register('effectiveFrom')}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Bu tarixdən sonrakı bütün yeni POS qəbzləri və sifarişlər bu qiymətlə rəsmiləşdiriləcək.
                  </p>
                </div>

                {isEditing && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Qiymət Dəyişikliyi Səbəbi
                    </label>
                    <Input
                      {...register('priceChangeReason')}
                      placeholder="məs: Mövsüm endirimi, təchizatçı maya artımı..."
                      className="mt-1"
                    />
                  </div>
                )}
              </div>

              {/* Live Margin & Markup Card */}
              <div className="bg-muted/30 border border-border rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Canlı Rentabellik Göstəriciləri
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-background p-3 rounded-lg border border-border">
                      <div className="text-xs text-muted-foreground">Marja Faizi</div>
                      <div className="text-2xl font-black text-foreground mt-1">
                        {financialMetrics.marginPercent}%
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        (Satış - Maya) / Satış
                      </div>
                    </div>

                    <div className="bg-background p-3 rounded-lg border border-border">
                      <div className="text-xs text-muted-foreground">Üstəgəl (Markup)</div>
                      <div className="text-2xl font-black text-foreground mt-1">
                        {financialMetrics.markupPercent}%
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        (Satış - Maya) / Maya
                      </div>
                    </div>
                  </div>

                  <div className="bg-background p-3 rounded-lg border border-border mt-3">
                    <div className="text-xs text-muted-foreground">Vahid Üzrə Məcmu Mənfəət</div>
                    <div className="text-lg font-bold text-success mt-1">
                      {formatMoney(financialMetrics.grossProfitQapik)}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/20">
                  <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <span>
                    Bütün maliyyə hesablamaları integer <strong>Qəpik</strong> formatında aparılır.
                    Dəyirmi kəsr xətaları və itkilər istisna olunur.
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: VARIANTLAR (SIZE X COLOR MATRIX) */}
      {activeTab === 'variants' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Ölçü × Rəng Matrisi Generatoru</span>
                <Badge variant="neutral" size="sm">
                  {watchedType.toUpperCase()}
                </Badge>
              </CardTitle>
              <CardDescription>
                Pərakəndə moda sektoru üçün sürətli ölçü və rəng kombinasiyası generatoru.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Size preset chips */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    1. Ölçülər ({watchedType === 'ayaqqabi' ? 'Rəqəmsal 36-46' : 'XS-XXL'})
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() =>
                        setSelectedSizes(
                          watchedType === 'ayaqqabi'
                            ? PRESET_SIZES_BY_TYPE.ayaqqabi
                            : PRESET_SIZES_BY_TYPE.geyim
                        )
                      }
                    >
                      Bütün Ölçülər
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:underline"
                      onClick={() => setSelectedSizes([])}
                    >
                      Təmizlə
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(watchedType === 'ayaqqabi'
                    ? PRESET_SIZES_BY_TYPE.ayaqqabi
                    : watchedType === 'aksesuar'
                    ? PRESET_SIZES_BY_TYPE.aksesuar
                    : PRESET_SIZES_BY_TYPE.geyim
                  ).map((sz) => {
                    const isSelected = selectedSizes.includes(sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() =>
                          setSelectedSizes((prev) =>
                            isSelected ? prev.filter((s) => s !== sz) : [...prev, sz]
                          )
                        }
                        className={`px-3 py-1 rounded-md text-xs font-semibold border transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color chips with swatches */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    2. Rənglər
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => setSelectedColors(STANDARD_COLORS.map((c) => c.name))}
                    >
                      Bütün Rənglər
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:underline"
                      onClick={() => setSelectedColors([])}
                    >
                      Təmizlə
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {STANDARD_COLORS.map((col) => {
                    const isSelected = selectedColors.includes(col.name);
                    return (
                      <button
                        key={col.name}
                        type="button"
                        onClick={() =>
                          setSelectedColors((prev) =>
                            isSelected ? prev.filter((c) => c !== col.name) : [...prev, col.name]
                          )
                        }
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                          isSelected
                            ? 'bg-background text-foreground border-primary shadow-sm ring-1 ring-primary'
                            : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-black/20"
                          style={{ backgroundColor: col.hex }}
                        />
                        <span>{col.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Generate Matrix Button */}
              <div className="pt-2 flex items-center justify-between border-t border-border">
                <div className="text-xs text-muted-foreground">
                  Yaradılacaq variant sayı:{' '}
                  <strong className="text-foreground">
                    {selectedSizes.length * selectedColors.length} sətir
                  </strong>
                </div>
                <Button
                  type="button"
                  size="sm"
                  leftIcon={<Sparkles className="h-4 w-4" />}
                  onClick={handleGenerateMatrix}
                >
                  Matrisi Yarat / Yenilə
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Matrix Table with inline duplicate detection */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Məhsul Variantları Cədvəli</CardTitle>
                  <CardDescription>
                    Hər bir ölçü və rəng üçün unikal SKU və EAN-13 barkod təyin edin.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() =>
                    appendVariant({
                      sku: `${watchedBaseSku || 'BH-ITEM'}-VAR-${variantFields.length + 1}`,
                      barcode: generateEan13(),
                      size: 'M',
                      color: 'Qara',
                      stockQty: 0,
                      status: 'active',
                    })
                  }
                >
                  Sətir Əlavə Et
                </Button>
              </div>

              {/* Error warning if matrix has duplicates */}
              {!matrixValidation.isValid && (
                <div className="mt-2 p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs space-y-1">
                  {matrixValidation.errorMessages.map((msg, i) => (
                    <div key={i} className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-2.5">Ölçü</th>
                      <th className="p-2.5">Rəng</th>
                      <th className="p-2.5">Variant SKU *</th>
                      <th className="p-2.5">Barkod (EAN-13) *</th>
                      <th className="p-2.5">Fərqli Qiymət (AZN)</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Sil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {variantFields.map((field, index) => {
                      const vSku = watch(`variants.${index}.sku`);
                      const vBarcode = watch(`variants.${index}.barcode`);
                      const hasDuplicateSku = matrixValidation.duplicateSkusInMatrix.includes(
                        (vSku || '').toUpperCase()
                      );
                      const hasDuplicateBarcode = matrixValidation.duplicateBarcodesInMatrix.includes(
                        vBarcode || ''
                      );

                      return (
                        <tr key={field.id} className="hover:bg-muted/30">
                          <td className="p-2.5 font-semibold">
                            <Input
                              {...register(`variants.${index}.size`)}
                              className="h-8 w-20 text-xs"
                            />
                          </td>
                          <td className="p-2.5">
                            <Input
                              {...register(`variants.${index}.color`)}
                              className="h-8 w-24 text-xs"
                            />
                          </td>
                          <td className="p-2.5 font-mono">
                            <Input
                              {...register(`variants.${index}.sku`)}
                              className={`h-8 w-44 text-xs font-mono uppercase ${
                                hasDuplicateSku ? 'border-danger focus:ring-danger' : ''
                              }`}
                            />
                            {hasDuplicateSku && (
                              <span className="text-[10px] text-danger block mt-0.5">
                                Təkrarlanan SKU
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono">
                            <div className="flex items-center gap-1">
                              <Input
                                {...register(`variants.${index}.barcode`)}
                                className={`h-8 w-40 text-xs font-mono ${
                                  hasDuplicateBarcode ? 'border-danger focus:ring-danger' : ''
                                }`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Yeni EAN-13 barkod yarat"
                                onClick={() =>
                                  setValue(`variants.${index}.barcode`, generateEan13(), {
                                    shouldDirty: true,
                                  })
                                }
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {hasDuplicateBarcode && (
                              <span className="text-[10px] text-danger block mt-0.5">
                                Təkrarlanan Barkod
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <Controller
                              name={`variants.${index}.priceOverrideQapik`}
                              control={control}
                              render={({ field: pField }) => (
                                <MoneyInput
                                  value={pField.value ?? watchedPriceQapik}
                                  onMoneyChange={(val) => pField.onChange(val.qapik)}
                                  className="h-8 w-28 text-xs"
                                />
                              )}
                            />
                          </td>
                          <td className="p-2.5">
                            <Controller
                              name={`variants.${index}.status`}
                              control={control}
                              render={({ field: sField }) => (
                                <Select
                                  value={sField.value}
                                  onValueChange={sField.onChange}
                                  options={[
                                    { value: 'active', label: 'Aktiv' },
                                    { value: 'archived', label: 'Dayandırılıb' },
                                  ]}
                                  className="h-8 w-24 text-xs"
                                />
                              )}
                            />
                          </td>
                          <td className="p-2.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-danger"
                              disabled={variantFields.length <= 1}
                              onClick={() => removeVariant(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: TƏCHİZATÇILAR */}
      {activeTab === 'suppliers' && (
        <Card>
          <CardHeader>
            <CardTitle>Təchizatçı Əlaqələri</CardTitle>
            <CardDescription>
              Bu məhsulun tədarük olunduğu xarici və ya yerli tərəfdaş şirkətlər və təchizatçı SKU kodları.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-2.5">Təchizatçı Şirkət</th>
                    <th className="p-2.5">Təchizatçı SKU</th>
                    <th className="p-2.5">Son Maya Qiyməti (AZN)</th>
                    <th className="p-2.5">Əsas Təchizatçı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(existingProduct?.suppliers && existingProduct.suppliers.length > 0) ? (
                    existingProduct.suppliers.map((sup, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="p-2.5 font-medium">{sup.supplierName}</td>
                        <td className="p-2.5 font-mono">{sup.supplierSku}</td>
                        <td className="p-2.5 font-semibold">
                          {formatMoney(sup.lastPurchasePriceQapik)}
                        </td>
                        <td className="p-2.5">
                          {sup.isPrimary ? (
                            <Badge variant="success" size="sm" hasDot>
                              Bəli (Əsas)
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Xeyr
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        Hələlik heç bir təchizatçı əlaqəsi qeydə alınmayıb.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 5: ŞƏKİLLƏR */}
      {activeTab === 'images' && (
        <Card>
          <CardHeader>
            <CardTitle>Məhsulun Şəkilləri</CardTitle>
            <CardDescription>
              POS terminalı və elektron kataloq üçün fotoşəkillər (JPG, PNG, WebP; maksimum 5MB).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center flex flex-col items-center justify-center bg-muted/20">
              <Upload className="h-10 w-10 text-muted-foreground mb-2" />
              <div className="text-sm font-semibold text-foreground">
                Şəkilləri yükləmək üçün seçin
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                İlk şəkil avtomatik olaraq əsas şəkil kimi təyin edilir.
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => info('Şəkil yükləmə dialoqu açıldı.')}
              >
                Şəkil Seç
              </Button>
            </div>

            {existingProduct?.images && existingProduct.images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                {existingProduct.images.map((img) => (
                  <div
                    key={img.id}
                    className="relative group rounded-lg overflow-hidden border border-border bg-card"
                  >
                    <img src={img.url} alt={img.name} className="w-full h-36 object-cover" />
                    {img.isPrimary && (
                      <div className="absolute top-2 left-2 bg-black text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        ƏSAS ŞƏKİL
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 6: TARİXÇƏ (PRICE & COST TIMELINE) */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <span>Qiymət və Maya Tarixçəsi Timeline</span>
            </CardTitle>
            <CardDescription>
              Bu məhsul üçün tətbiq edilmiş bütün qiymət dəyişiklikləri və audit qeydləri (Yalnız oxunur).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Satış Qiyməti Dəyişiklikləri
              </div>
              {existingProduct?.priceHistory && existingProduct.priceHistory.length > 0 ? (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {existingProduct.priceHistory.map((ph) => (
                    <div key={ph.id} className="relative flex items-start gap-3">
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div className="bg-muted/30 border border-border rounded-lg p-3 flex-1 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground text-sm">
                            {formatMoney(ph.priceQapik)}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDateTime(ph.effectiveFrom)}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          Dəyişən: <strong className="text-foreground">{ph.changedBy}</strong>
                        </div>
                        {ph.reason && (
                          <div className="text-foreground italic bg-background p-1.5 rounded border border-border/50">
                            Səbəb: {ph.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground py-4">
                  Qiymət tarixçəsi qeydi mövcud deyil.
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Maya Dəyəri Dəyişiklikləri
              </div>
              {existingProduct?.costHistory && existingProduct.costHistory.length > 0 ? (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {existingProduct.costHistory.map((ch) => (
                    <div key={ch.id} className="relative flex items-start gap-3">
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-muted-foreground border-2 border-background" />
                      <div className="bg-muted/30 border border-border rounded-lg p-3 flex-1 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground text-sm">
                            {formatMoney(ch.costPriceQapik)}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDateTime(ch.effectiveFrom)}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          Qeydiyyatçı: <strong className="text-foreground">{ch.changedBy}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground py-2">
                  Maya tarixçəsi qeydi mövcud deyil.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 7: SAYT İNTEQRASİYASI */}
      {activeTab === 'web' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <span>brendhouse.az Sayt İnteqrasiyası</span>
            </CardTitle>
            <CardDescription>
              Məhsulun brendhouse.az rəsmi onlayn mağazasında dərc edilmə və sinxronizasiya statusu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border text-sm">
              <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0">
                <Globe className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Sinxronizasiya Statusu:</span>
                  <Badge variant="warning" size="sm">
                    Konfiqurasiya olunmayıb
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  brendhouse.az rəsmi API inteqrasiyası hazırda aktiv deyil. Bu mərhələdə bütün
                  məlumatlar ERP daxili yaddaşında saxlanılır və xarici e-ticarət servislərinə
                  ötürülmür.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-dashed border-border bg-card text-xs space-y-2">
              <div className="font-semibold text-foreground">Sinxronizasiya Parametrləri:</div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>Saytda dərc et: <strong>Aktiv</strong></div>
                <div>Stok sinxronu: <strong>Avtomatik (Hər 15 dəqiqə)</strong></div>
                <div>Qiymət sinxronu: <strong>Real-vaxt</strong></div>
                <div>Sayt Kateqoriyası: <strong>Köynəklər</strong></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </form>
  );
};

