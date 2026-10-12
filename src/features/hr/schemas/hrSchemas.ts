import { z } from 'zod';

export const employeeSchema = z.object({
  firstName: z.string().min(2, 'Ad ən azı 2 simvol olmalıdır'),
  lastName: z.string().min(2, 'Soyad ən azı 2 simvol olmalıdır'),
  jobTitle: z.string().min(2, 'Vəzifə mütləq seçilməlidir və ya qeyd edilməlidir'),
  department: z.string().min(2, 'Departament seçilməlidir'),
  branchId: z.string().min(1, 'Filial seçilməlidir'),
  managerId: z.string().optional(),
  status: z.enum(['active', 'on_leave', 'suspended', 'terminated']).default('active'),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Düzgün tarix formatı daxil edin (YYYY-MM-DD)'),

  // Personal minimal data
  finCode: z
    .string()
    .length(7, 'FİN kod tam 7 simvoldan ibarət olmalıdır')
    .regex(/^[A-Z0-9]{7}$/i, 'FİN yalnız rəqəm və latın hərflərindən ibarət olmalıdır'),
  idCardNumber: z.string().min(5, 'Şəxsiyyət vəsiqəsi seriya nömrəsi daxil edilməlidir'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Doğum tarixi daxil edilməlidir'),
  gender: z.enum(['male', 'female']),
  phone: z.string().min(9, 'Əlaqə nömrəsi daxil edilməlidir'),
  email: z.string().email('Düzgün e-poçt formatı daxil edin'),
  address: z.string().min(3, 'Faktiki yaşayış ünvanı qeyd edilməlidir'),
  emergencyContactName: z.string().min(2, 'Təcili əlaqədar şəxsin adı qeyd edilməlidir'),
  emergencyContactPhone: z.string().min(9, 'Təcili əlaqədar şəxsin nömrəsi daxil edilməlidir'),

  // Contract
  employmentType: z.enum(['full_time', 'part_time', 'shift', 'contract']),
  contractType: z.enum(['unlimited', 'fixed_term', 'probation']),
  contractNumber: z.string().min(2, 'Müqavilə nömrəsi daxil edilməlidir'),
  contractStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Müqavilə başlama tarixi daxil edilməlidir'),
  contractEndDate: z.string().optional(),
  workingHoursPerWeek: z.number().min(1).max(60).default(40),

  // Compensation
  compensationModel: z.enum(['fixed_monthly', 'hourly', 'commission_based', 'hybrid']),
  baseSalaryAzn: z.number().min(0, 'Maaş mənfi ola bilməz'),
  hourlyRateAzn: z.number().min(0, 'Saatlıq tarif mənfi ola bilməz').default(0),
  commissionRatePercent: z.number().min(0).max(100).default(0),
  monthlyBonusTargetAzn: z.number().min(0).default(0),
  overtimeAllowed: z.boolean().default(true),
  bankName: z.string().min(2, 'Bank adı qeyd edilməlidir'),
  bankIban: z.string().min(15, 'Düzgün bank IBAN hesabı qeyd edilməlidir'),
});

export type EmployeeFormData = z.infer<typeof employeeSchema>;

export const leaveRequestSchema = z.object({
  employeeId: z.string().min(1, 'Əməkdaş seçilməlidir'),
  leaveType: z.enum(['annual', 'unpaid', 'sick', 'maternity', 'study']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Başlama tarixi seçilməlidir'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitmə tarixi seçilməlidir'),
  reason: z.string().min(5, 'Səbəb ən azı 5 simvol olmalıdır'),
});

export type LeaveRequestFormData = z.infer<typeof leaveRequestSchema>;

export const attendanceCorrectionSchema = z.object({
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  reason: z.string().min(5, 'Düzəliş səbəbi ən azı 5 simvol olmalıdır'),
});

export type AttendanceCorrectionFormData = z.infer<typeof attendanceCorrectionSchema>;

export const offboardingSchema = z.object({
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Son iş günü seçilməlidir'),
  terminationReason: z.string().min(5, 'Ayrılma səbəbi ən azı 5 simvol olmalıdır'),
  assetsReturned: z.boolean(),
  keysReturned: z.boolean(),
  uniformReturned: z.boolean(),
  accessRevoked: z.boolean(),
  finalSettlementCalculated: z.boolean(),
  notes: z.string().optional(),
});

export type OffboardingFormData = z.infer<typeof offboardingSchema>;

