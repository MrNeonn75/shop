import { ProductVariant, ProductType } from '../types/catalog';
import { generateEan13 } from './barcode';
import { Qapik } from '../../../shared/utils/money';

export interface ColorOption {
  name: string;
  hex: string;
  slug: string;
}

export const STANDARD_COLORS: ColorOption[] = [
  { name: 'Qara', hex: '#111827', slug: 'BLK' },
  { name: 'Ağ', hex: '#FFFFFF', slug: 'WHT' },
  { name: 'Boz', hex: '#6B7280', slug: 'GRY' },
  { name: 'Göy', hex: '#2563EB', slug: 'BLU' },
  { name: 'Tünd Göy', hex: '#1E3A8A', slug: 'NVY' },
  { name: 'Qırmızı', hex: '#DC2626', slug: 'RED' },
  { name: 'Bej', hex: '#D4B996', slug: 'BEI' },
  { name: 'Qəhvəyi', hex: '#78350F', slug: 'BRN' },
  { name: 'Yaşıl', hex: '#16A34A', slug: 'GRN' },
  { name: 'Zümrüd Yaşılı', hex: '#065F46', slug: 'EMR' },
  { name: 'Bordo', hex: '#831843', slug: 'BRD' },
  { name: 'Krem', hex: '#FDFBF7', slug: 'CRM' },
  { name: 'Melanj', hex: '#9CA3AF', slug: 'MLN' },
  { name: 'Haki', hex: '#4B5320', slug: 'KHK' },
  { name: 'Sarı', hex: '#EAB308', slug: 'YLW' },
  { name: 'Çəhrayı', hex: '#EC4899', slug: 'PNK' },
];

export const PRESET_SIZES_BY_TYPE: Record<ProductType, string[]> = {
  geyim: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  ayaqqabi: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  aksesuar: ['Standart'],
};

export const KIDS_SIZES = ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-11Y', '12-13Y'];

export function slugify(text: string): string {
  const map: Record<string, string> = {
    ə: 'e',
    ı: 'i',
    ö: 'o',
    ü: 'u',
    ç: 'c',
    ş: 's',
    ğ: 'g',
    Ə: 'E',
    İ: 'I',
    Ö: 'O',
    Ü: 'U',
    Ç: 'C',
    Ş: 'S',
    Ğ: 'G',
  };
  return text
    .split('')
    .map((c) => map[c] || c)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function getColorSlug(colorName: string): string {
  const found = STANDARD_COLORS.find(
    (c) => c.name.toLowerCase() === colorName.toLowerCase()
  );
  if (found) return found.slug;
  const slug = slugify(colorName).slice(0, 3);
  return slug || 'CLR';
}

export interface GenerateMatrixParams {
  productId?: string;
  baseSku: string;
  sizes: string[];
  colors: string[];
  existingVariants?: ProductVariant[];
  basePriceQapik?: Qapik;
  baseCostPriceQapik?: Qapik;
}

/**
 * Generates or merges a fashion Size × Color matrix.
 * Preserves existing variants if they already exist for the given (size, color) pair.
 */
export function generateVariantMatrix({
  productId = 'new',
  baseSku,
  sizes,
  colors,
  existingVariants = [],
}: GenerateMatrixParams): ProductVariant[] {
  const cleanBaseSku = baseSku.trim() || 'BH-ITEM';
  const result: ProductVariant[] = [];

  const existingMap = new Map<string, ProductVariant>();
  existingVariants.forEach((v) => {
    const key = `${v.size.trim().toLowerCase()}::${v.color.trim().toLowerCase()}`;
    existingMap.set(key, v);
  });

  const effectiveSizes = sizes.length > 0 ? sizes : ['Standart'];
  const effectiveColors = colors.length > 0 ? colors : ['Standart'];

  effectiveColors.forEach((color) => {
    const colorSlug = getColorSlug(color);

    effectiveSizes.forEach((size) => {
      const key = `${size.trim().toLowerCase()}::${color.trim().toLowerCase()}`;
      const existing = existingMap.get(key);

      if (existing) {
        result.push({ ...existing });
      } else {
        const sizeSlug = slugify(size).slice(0, 4) || 'STD';
        const suggestedSku = `${cleanBaseSku}-${colorSlug}-${sizeSlug}`;
        const newBarcode = generateEan13();

        result.push({
          id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId,
          sku: suggestedSku,
          barcode: newBarcode,
          size,
          color,
          stockQty: 0,
          status: 'active',
        });
      }
    });
  });

  return result;
}

export interface MatrixValidationResult {
  isValid: boolean;
  duplicateSkusInMatrix: string[];
  duplicateBarcodesInMatrix: string[];
  conflictingDatabaseSkus: string[];
  conflictingDatabaseBarcodes: string[];
  errorMessages: string[];
}

/**
 * Checks for duplicate SKUs and barcodes within the current matrix
 * and against external registered identifiers.
 */
export function validateMatrixDuplicates(
  variants: ProductVariant[],
  registeredSkus: Set<string> = new Set(),
  registeredBarcodes: Set<string> = new Set()
): MatrixValidationResult {
  const skuCounts = new Map<string, number>();
  const barcodeCounts = new Map<string, number>();
  const duplicateSkusInMatrix: string[] = [];
  const duplicateBarcodesInMatrix: string[] = [];
  const conflictingDatabaseSkus: string[] = [];
  const conflictingDatabaseBarcodes: string[] = [];
  const errorMessages: string[] = [];

  variants.forEach((v) => {
    const s = v.sku.trim().toUpperCase();
    const b = v.barcode.trim();

    if (s) {
      skuCounts.set(s, (skuCounts.get(s) || 0) + 1);
      if (registeredSkus.has(s)) {
        conflictingDatabaseSkus.push(s);
      }
    }

    if (b) {
      barcodeCounts.set(b, (barcodeCounts.get(b) || 0) + 1);
      if (registeredBarcodes.has(b)) {
        conflictingDatabaseBarcodes.push(b);
      }
    }
  });

  skuCounts.forEach((count, sku) => {
    if (count > 1) {
      duplicateSkusInMatrix.push(sku);
    }
  });

  barcodeCounts.forEach((count, barcode) => {
    if (count > 1) {
      duplicateBarcodesInMatrix.push(barcode);
    }
  });

  if (duplicateSkusInMatrix.length > 0) {
    errorMessages.push(
      `Variantlar arasında təkrarlanan SKU aşkar edildi: ${duplicateSkusInMatrix.join(', ')}`
    );
  }

  if (duplicateBarcodesInMatrix.length > 0) {
    errorMessages.push(
      `Variantlar arasında təkrarlanan barkod aşkar edildi: ${duplicateBarcodesInMatrix.join(', ')}`
    );
  }

  if (conflictingDatabaseSkus.length > 0) {
    errorMessages.push(
      `SKU artıq başqa məhsulda qeydiyyatdadır: ${conflictingDatabaseSkus.join(', ')}`
    );
  }

  if (conflictingDatabaseBarcodes.length > 0) {
    errorMessages.push(
      `Barkod artıq başqa məhsulda qeydiyyatdadır: ${conflictingDatabaseBarcodes.join(', ')}`
    );
  }

  return {
    isValid: errorMessages.length === 0,
    duplicateSkusInMatrix,
    duplicateBarcodesInMatrix,
    conflictingDatabaseSkus,
    conflictingDatabaseBarcodes,
    errorMessages,
  };
}

