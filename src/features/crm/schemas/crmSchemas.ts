import { z } from 'zod';

export const customerQuickCreateSchema = z.object({
  firstName: z.string().min(2, 'Ad ən azı 2 simvol olmalıdır'),
  lastName: z.string().min(2, 'Soyad ən azı 2 simvol olmalıdır'),
  phone: z
    .string()
    .min(9, 'Telefon nömrəsi düzgün deyil')
    .regex(/^(\+?994|0)?(50|51|55|70|77|99|10)\d{7}$/, 'Düzgün Azərbaycan mobil nömrəsi daxil edin (məs: +994501234567)'),
  email: z.string().email('Düzgün email ünvanı daxil edin').optional().or(z.literal('')),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarix formatı YYYY-MM-DD olmalıdır')
    .optional()
    .or(z.literal('')),
  primaryBranchId: z.string().min(1, 'Filial seçilməlidir'),
  // Consent checkboxes
  smsMarketing: z.boolean().default(false),
  emailMarketing: z.boolean().default(false),
  whatsappMarketing: z.boolean().default(false),
  dataProcessing: z.boolean().refine((val) => val === true, {
    message: 'Fərdi məlumatların qorunması qaydalarına razılıq verilməlidir',
  }),
});

export type CustomerQuickCreateFormData = z.infer<typeof customerQuickCreateSchema>;

export const customerEditSchema = z.object({
  firstName: z.string().min(2, 'Ad ən azı 2 simvol olmalıdır'),
  lastName: z.string().min(2, 'Soyad ən azı 2 simvol olmalıdır'),
  phone: z
    .string()
    .min(9, 'Telefon nömrəsi düzgün deyil')
    .regex(/^(\+?994|0)?(50|51|55|70|77|99|10)\d{7}$/, 'Düzgün Azərbaycan mobil nömrəsi daxil edin'),
  email: z.string().email('Düzgün email ünvanı daxil edin').optional().or(z.literal('')),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarix formatı YYYY-MM-DD olmalıdır')
    .optional()
    .or(z.literal('')),
  primaryBranchId: z.string().min(1, 'Filial seçilməlidir'),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  segmentTags: z.array(z.string()).default([]),
  notes: z.string().optional().default(''),
});

export type CustomerEditFormData = z.infer<typeof customerEditSchema>;

export const pointsAdjustmentSchema = z.object({
  pointsDelta: z.number().int().refine((val) => val !== 0, {
    message: 'Bal miqdarı 0-dan fərqli olmalıdır (müsbət və ya mənfi)',
  }),
  reason: z.string().min(5, 'Bal dəyişikliyinin əsaslandırması ən azı 5 simvol olmalıdır'),
});

export type PointsAdjustmentFormData = z.infer<typeof pointsAdjustmentSchema>;

export const customerMergeSchema = z.object({
  sourceCustomerId: z.string().min(1, 'Birləşdiriləcək köməkçi müştəri seçilməlidir'),
  targetCustomerId: z.string().min(1, 'Əsas müştəri seçilməlidir'),
  auditReason: z.string().min(5, 'Birləşdirmə səbəbi qeyd olunmalıdır'),
}).refine((data) => data.sourceCustomerId !== data.targetCustomerId, {
  message: 'Eyni müştərini özü ilə birləşdirmək mümkün deyil',
  path: ['targetCustomerId'],
});

export type CustomerMergeFormData = z.infer<typeof customerMergeSchema>;

export const customerSegmentSchema = z.object({
  name: z.string().min(3, 'Seqmentin adı ən azı 3 simvol olmalıdır'),
  description: z.string().default(''),
  isDynamic: z.boolean().default(true),
  minSpendAzn: z.number().min(0).optional(),
  maxSpendAzn: z.number().min(0).optional(),
  minOrdersCount: z.number().int().min(0).optional(),
  lastVisitWithinDays: z.number().int().min(1).optional(),
  tiers: z.array(z.enum(['bronze', 'silver', 'gold', 'platinum'])).default([]),
  branches: z.array(z.string()).default([]),
  requiredConsentChannel: z.enum(['sms', 'email', 'whatsapp']).optional(),
});

export type CustomerSegmentFormData = z.infer<typeof customerSegmentSchema>;

