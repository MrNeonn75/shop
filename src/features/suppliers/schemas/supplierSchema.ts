import { z } from 'zod';
import { Supplier } from '../types';

export const supplierFormSchema = z.object({
  name: z.string().min(2, 'Təchizatçı adı ən azı 2 simvol olmalıdır'),
  legalName: z.string().min(2, 'Hüquqi ad mütləqdir'),
  taxId: z
    .string()
    .regex(/^\d{10}$/, 'VÖEN dəqiq 10 rəqəmdən ibarət olmalıdır (məs: 1405829141)'),
  contactPerson: z.string().min(2, 'Məsul şəxsin adı mütləqdir'),
  phone: z.string().min(7, 'Əlaqə nömrəsi düzgün formatda deyil'),
  email: z.string().email('Düzgün e-poçt ünvanı daxil edin'),
  address: z.string().min(3, 'Ünvan daxil edilməlidir'),
  city: z.string().default('Bakı'),
  country: z.string().default('Azərbaycan'),
  paymentTerms: z.enum(['immediate', 'net15', 'net30', 'net45', 'net60', 'custom']),
  customPaymentDays: z.number().optional(),
  currency: z.enum(['AZN', 'USD', 'EUR', 'TRY']).default('AZN'),
  leadTimeDays: z.number().min(0, 'Tədarük müddəti mənfi ola bilməz').default(7),
  notes: z.string().optional(),
  bankDetails: z
    .object({
      bankName: z.string().optional(),
      voen: z.string().optional(),
      iban: z.string().optional(),
      swift: z.string().optional(),
    })
    .optional(),
});

export type SupplierFormData = z.infer<typeof supplierFormSchema>;

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  field?: 'taxId' | 'name';
  duplicateField?: 'taxId' | 'name';
  message?: string;
  matchedSupplier?: Supplier;
}

/**
 * Checks for duplicate supplier by VÖEN (tax ID) or name.
 */
export function detectDuplicateSupplier(
  existingSuppliers: Supplier[],
  candidate: { taxId: string; name: string; currentId?: string }
): DuplicateCheckResult {
  const normTaxId = candidate.taxId.trim();
  const normName = candidate.name.trim().toLowerCase();

  for (const s of existingSuppliers) {
    if (candidate.currentId && s.id === candidate.currentId) {
      continue;
    }
    if (s.taxId.trim() === normTaxId) {
      return {
        hasDuplicate: true,
        field: 'taxId',
        duplicateField: 'taxId',
        message: `${normTaxId} VÖEN nömrəsi ilə təchizatçı artıq mövcuddur ("${s.name}")`,
        matchedSupplier: s,
      };
    }
    if (s.name.trim().toLowerCase() === normName) {
      return {
        hasDuplicate: true,
        field: 'name',
        duplicateField: 'name',
        message: `"${s.name}" adlı təchizatçı artıq mövcuddur`,
        matchedSupplier: s,
      };
    }
  }

  return { hasDuplicate: false };
}

