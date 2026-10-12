import { z } from 'zod';

export const expenseFormSchema = z.object({
  categoryId: z.string().min(1, 'Xərc kateqoriyası seçilməlidir.'),
  subcategoryId: z.string().optional(),
  branchId: z.string().min(1, 'Filial seçilməlidir.'),
  supplierId: z.string().optional(),
  amountQapik: z.number().int().positive('Xərc məbləği 0-dan böyük tam qəpik olmalıdır.'),
  taxClassId: z.string().min(1, 'Vergi dərəcəsi seçilməlidir.').default('tax-1'),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'card']),
  paymentAccountId: z.string().optional(),
  date: z.string().min(1, 'Tarix qeyd edilməlidir.'),
  description: z.string().min(3, 'Təsvir ən azı 3 simvol olmalıdır.'),
});

export const movementFormSchema = z
  .object({
    type: z.enum(['transfer', 'deposit', 'withdrawal']),
    fromAccountId: z.string().optional(),
    toAccountId: z.string().optional(),
    amountQapik: z.number().int().positive('Məbləğ 0-dan böyük tam qəpik olmalıdır.'),
    date: z.string().min(1, 'Tarix qeyd edilməlidir.'),
    description: z.string().min(3, 'Təsvir ən azı 3 simvol olmalıdır.'),
    branchId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer') {
        return !!data.fromAccountId && !!data.toAccountId && data.fromAccountId !== data.toAccountId;
      }
      if (data.type === 'deposit') {
        return !!data.fromAccountId && !!data.toAccountId;
      }
      if (data.type === 'withdrawal') {
        return !!data.fromAccountId && !!data.toAccountId;
      }
      return true;
    },
    {
      message: 'Məxaric və mədaxil hesabları düzgün və fərqli seçilməlidir.',
      path: ['toAccountId'],
    }
  );

export const budgetPlanSchema = z.object({
  branchId: z.string().min(1, 'Filial seçilməlidir.'),
  period: z.string().min(1, 'Dövr seçilməlidir.'),
  categoryId: z.string().min(1, 'Kateqoriya seçilməlidir.'),
  budgetedAmountQapik: z.number().int().positive('Büdcə məbləği 0-dan böyük olmalıdır.'),
});

export const budgetRevisionSchema = z.object({
  newAmountQapik: z.number().int().positive('Yeni məbləğ 0-dan böyük olmalıdır.'),
  reason: z.string().min(5, 'Dəyişiklik səbəbi ən azı 5 simvol olmalıdır.'),
});

export const reversalActionSchema = z.object({
  reason: z.string().min(5, 'Ləğvetmə səbəbi ən azı 5 simvol olmalıdır.'),
});

export const sharedAllocationSchema = z.object({
  title: z.string().min(3, 'Başlıq daxil edilməlidir.'),
  totalAmountQapik: z.number().int().positive('Ümumi məbləğ 0-dan böyük olmalıdır.'),
  categoryId: z.string().min(1, 'Kateqoriya seçilməlidir.'),
  allocationRule: z.enum(['fixed_percentage', 'sales_proportional']),
  shares: z
    .array(
      z.object({
        branchId: z.string(),
        branchName: z.string(),
        percentage: z.number().min(0).max(100),
        allocatedAmountQapik: z.number().int().nonnegative(),
      })
    )
    .refine(
      (shares) => {
        const sum = Math.round(shares.reduce((acc, s) => acc + s.percentage, 0));
        return sum === 100;
      },
      { message: 'Filial paylarının faiz cəmi dəqiq 100% olmalıdır.' }
    ),
});

