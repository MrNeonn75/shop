import { z } from 'zod';

export const campaignSchema = z.object({
  name: z.string().min(3, 'Kampaniyanın adı ən azı 3 simvol olmalıdır'),
  objective: z.enum([
    'brand_awareness',
    'traffic',
    'sales_volume',
    'clearance',
    'loyalty_engagement',
    'new_collection',
  ]),
  type: z.enum([
    'seasonal',
    'product',
    'category',
    'brand',
    'branch_specific',
    'loyalty',
    'promo_code',
  ]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Başlanğıc tarixi düzgün formatda deyil (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitmə tarixi düzgün formatda deyil (YYYY-MM-DD)'),
  budgetAzn: z.number().min(0, 'Büdcə mənfi ola bilməz'),
  targetBranchIds: z.array(z.string()).min(1, 'Ən azı 1 filial seçilməlidir'),
  targetSegmentIds: z.array(z.string()).default(['*']),
  eligibleBrandIds: z.array(z.string()).default([]),
  eligibleCategoryIds: z.array(z.string()).default([]),
  eligibleProductIds: z.array(z.string()).default([]),
  excludedProductIds: z.array(z.string()).default([]),
  description: z.string().optional().default(''),
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
  message: 'Başlanğıc tarixi bitmə tarixindən sonra ola bilməz',
  path: ['endDate'],
});

export type CampaignFormData = z.infer<typeof campaignSchema>;

export const promotionRuleSchema = z.object({
  name: z.string().min(3, 'Qaydanın adı ən azı 3 simvol olmalıdır'),
  ruleType: z.enum([
    'percentage',
    'fixed_amount',
    'bogo',
    'quantity_tier',
    'bundle',
    'loyalty_discount',
  ]),
  priorityRank: z.number().int().min(1, 'Prioritet dərəcəsi ən azı 1 olmalıdır'),
  canStack: z.boolean().default(false),
  isExclusive: z.boolean().default(false),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarix formatı YYYY-MM-DD olmalıdır'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarix formatı YYYY-MM-DD olmalıdır'),
  targetBranchIds: z.array(z.string()).min(1, 'Filial seçilməlidir'),
  minCartAmountAzn: z.number().min(0).optional().default(0),
  maxDiscountAmountAzn: z.number().min(0).optional(),
  
  // Specific inputs
  discountPercent: z.number().min(1).max(100).optional(),
  discountAmountAzn: z.number().min(0.01).optional(),
  bogoBuyQty: z.number().int().min(1).optional(),
  bogoGetQty: z.number().int().min(1).optional(),
  bogoDiscountPercent: z.number().min(1).max(100).optional(),
  
  eligibleProductIds: z.array(z.string()).default([]),
  eligibleCategoryIds: z.array(z.string()).default([]),
  eligibleBrandIds: z.array(z.string()).default([]),
  excludedProductIds: z.array(z.string()).default([]),
  description: z.string().optional().default(''),
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
  message: 'Başlanğıc tarixi bitmə tarixindən sonra ola bilməz',
  path: ['endDate'],
});

export type PromotionRuleFormData = z.infer<typeof promotionRuleSchema>;

export const promoCodeSchema = z.object({
  code: z.string()
    .min(3, 'Promokod ən azı 3 simvol olmalıdır')
    .max(20, 'Promokod maksimum 20 simvol ola bilər')
    .regex(/^[A-Z0-9_-]+$/i, 'Promokod yalnız hərflər, rəqəmlər və tire/alt xətt ola bilər'),
  promotionRuleId: z.string().min(1, 'Endirim qaydası seçilməlidir'),
  discountDescription: z.string().min(3, 'Təsvir qeyd edilməlidir'),
  totalUsageLimit: z.number().int().min(1, 'Ümumi istifadə sayı ən azı 1 olmalıdır'),
  perCustomerLimit: z.number().int().min(1, 'Müştəri üzrə limit ən azı 1 olmalıdır'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarix formatı YYYY-MM-DD olmalıdır'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarix formatı YYYY-MM-DD olmalıdır'),
  targetBranchIds: z.array(z.string()).default(['*']),
  targetSegmentIds: z.array(z.string()).default(['*']),
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
  message: 'Başlanğıc tarixi bitmə tarixindən sonra ola bilməz',
  path: ['endDate'],
});

export type PromoCodeFormData = z.infer<typeof promoCodeSchema>;

export const communicationTemplateSchema = z.object({
  name: z.string().min(3, 'Şablon adı ən azı 3 simvol olmalıdır'),
  channel: z.enum(['sms', 'email', 'whatsapp']),
  subject: z.string().optional(),
  body: z.string().min(5, 'Mesaj mətni ən azı 5 simvol olmalıdır'),
  category: z.enum(['promotional', 'transactional', 'loyalty']),
});

export type CommunicationTemplateFormData = z.infer<typeof communicationTemplateSchema>;

