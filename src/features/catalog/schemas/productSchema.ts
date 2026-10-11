import { z } from 'zod';
import { isValidEan13 } from '../utils/barcode';

export const productVariantSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional(),
  sku: z
    .string()
    .min(3, 'Variant SKU minimum 3 simvol olmalıdır.')
    .regex(/^[A-Za-z0-9-_]+$/, 'SKU yalnız hərf, rəqəm, tire və alt xətt ola bilər.'),
  barcode: z
    .string()
    .min(8, 'Barkod ən az 8 simvol olmalıdır.')
    .refine((val) => {
      // If 13 digits, validate EAN-13 checksum
      if (/^\d{13}$/.test(val)) {
        return isValidEan13(val);
      }
      return true; // allow custom alphanumeric / Code-128
    }, 'Daxil edilmiş 13 rəqəmli EAN-13 barkodunun nəzarət rəqəmi (checksum) yalnışdır.'),
  size: z.string().min(1, 'Ölçü seçilməlidir.'),
  color: z.string().min(1, 'Rəng seçilməlidir.'),
  priceOverrideQapik: z.number().int().nonnegative().optional(),
  costPriceOverrideQapik: z.number().int().nonnegative().optional(),
  stockQty: z.number().int().nonnegative().default(0),
  status: z.enum(['active', 'archived']).default('active'),
});

export const productSupplierSchema = z.object({
  supplierId: z.string().min(1, 'Təchizatçı seçilməlidir.'),
  supplierName: z.string().min(1, 'Təchizatçı adı tələb olunur.'),
  supplierSku: z.string().min(1, 'Təchizatçı SKU tələb olunur.'),
  lastPurchasePriceQapik: z.number().int().nonnegative('Maya qiyməti mənfi ola bilməz.'),
  isPrimary: z.boolean().default(false),
});

export const productImageSchema = z.object({
  id: z.string(),
  url: z.string().min(1, 'Şəkil ünvanı tələb olunur.'),
  name: z.string(),
  sizeBytes: z.number().max(5 * 1024 * 1024, 'Şəkil həcmi 5MB-dan çox ola bilməz.'),
  isPrimary: z.boolean().default(false),
  order: z.number().default(0),
});

export const productFormSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Məhsulun adı minimum 3 simvol olmalıdır.')
      .max(200, 'Məhsulun adı maksimum 200 simvol ola bilər.'),
    description: z.string().default(''),
    sku: z
      .string()
      .min(3, 'Əsas SKU minimum 3 simvol olmalıdır.')
      .regex(/^[A-Za-z0-9-_]+$/, 'SKU yalnız hərf, rəqəm, tire və alt xətt ola bilər.'),
    barcode: z
      .string()
      .min(8, 'Əsas barkod ən az 8 simvol olmalıdır.')
      .refine((val) => {
        if (/^\d{13}$/.test(val)) {
          return isValidEan13(val);
        }
        return true;
      }, 'EAN-13 nəzarət rəqəmi (checksum) yalnışdır.'),
    section: z.enum(['kisi', 'qadin', 'usaq', 'diger'], {
      required_error: 'Bölmə seçilməlidir.',
    }),
    type: z.enum(['geyim', 'ayaqqabi', 'aksesuar'], {
      required_error: 'Məhsul tipi seçilməlidir.',
    }),
    categoryId: z.string().min(1, 'Kateqoriya seçilməlidir.'),
    subcategoryId: z.string().optional(),
    brandId: z.string().min(1, 'Brend seçilməlidir.'),
    unit: z.string().min(1, 'Ölçü vahidi seçilməlidir.').default('ədəd'),
    taxClassId: z.string().min(1, 'Vergi dərəcəsi seçilməlidir.').default('tax-standard'),
    minStockLevel: z.coerce.number().int().nonnegative('Minimum stok mənfi ola bilməz.').default(5),
    status: z.enum(['active', 'archived']).default('active'),
    // Financials in Qapik
    priceQapik: z.coerce
      .number()
      .int()
      .positive('Satış qiyməti 0-dan böyük olmalıdır.'),
    costPriceQapik: z.coerce
      .number()
      .int()
      .nonnegative('Maya qiyməti 0 və ya daha böyük olmalıdır.')
      .default(0),
    effectiveFrom: z.string().min(1, 'Qiymətin qüvvəyə minmə tarixi tələb olunur.'),
    priceChangeReason: z.string().optional(),
    // Arrays
    variants: z.array(productVariantSchema).min(1, 'Ən az bir variant (ölçü və ya rəng) olmalıdır.'),
    suppliers: z.array(productSupplierSchema).default([]),
    images: z.array(productImageSchema).default([]),
  })
  .superRefine((data, ctx) => {
    // Check variant SKU uniqueness within this product
    const skus = new Set<string>();
    const barcodes = new Set<string>();

    data.variants.forEach((v, index) => {
      const s = v.sku.trim().toUpperCase();
      const b = v.barcode.trim();

      if (skus.has(s)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Təkrarlanan variant SKU: ${v.sku}`,
          path: ['variants', index, 'sku'],
        });
      }
      skus.add(s);

      if (barcodes.has(b)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Təkrarlanan variant barkod: ${v.barcode}`,
          path: ['variants', index, 'barcode'],
        });
      }
      barcodes.add(b);
    });
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

