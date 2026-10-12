import { SodRule, SodViolation } from '../types/permissionsAdvanced';

export const STANDARD_SOD_RULES: SodRule[] = [
  {
    id: 'sod-finance-1',
    code: 'SOD-FIN-01',
    titleAz: 'Ödəniş Açılışı və Təsdiqi Ziddiyyəti',
    descriptionAz:
      'Eyni rol həm xərc/ödəniş qeydiyyatı apara bilməz, həm də həmin ödənişi təsdiqləyə bilməz. Bu, icazəsiz vəsait çıxarışı riskini artırır.',
    riskLevel: 'critical',
    conflictingPermissions: ['finance.expense.create', 'finance.expense.approve'],
    mitigationGuideAz:
      'Ödəniş təsdiqi səlahiyyətini Filial Menecerindən və ya Mühasibdən ayırıb yalnız Baş Menecerə həvalə edin.',
  },
  {
    id: 'sod-inventory-1',
    code: 'SOD-INV-01',
    titleAz: 'Stok Düzəlişi və Sayım Təsdiqi Ziddiyyəti',
    descriptionAz:
      'Eyni rol həm inventar qalığına əl ilə düzəliş (silinmə/əlavə) edə bilməz, həm də sayım nəticələrini və ya transfer qəbulunu təsdiq edə bilməz.',
    riskLevel: 'high',
    conflictingPermissions: ['inventory.stock.adjust', 'inventory.stock.count_approve'],
    mitigationGuideAz:
      'Anbardar yalnız fiziki hərəkətləri qeyd etməli, sayım fərqlərinin rəsmi silinməsini isə audit komissiyası təsdiqləməlidir.',
  },
  {
    id: 'sod-inventory-transfer',
    code: 'SOD-INV-02',
    titleAz: 'Stok Düzəlişi və Transfer Təsdiqi Ziddiyyəti',
    descriptionAz:
      'Eyni rol həm inventar qalığına əl ilə düzəliş (silinmə/əlavə) edə bilməz, həm də anbarlararası transfer qəbulunu təsdiq edə bilməz.',
    riskLevel: 'high',
    conflictingPermissions: ['inventory.stock.adjust', 'inventory.transfer.approve'],
    mitigationGuideAz:
      'Anbardar yalnız fiziki hərəkətləri qeyd etməli, sayım fərqlərinin rəsmi silinməsini isə audit komissiyası təsdiqləməlidir.',
  },
  {
    id: 'sod-3',
    code: 'SOD-PUR-01',
    titleAz: 'Satınalma Sifarişi və Maliyyə Təsdiqi Ziddiyyəti',
    descriptionAz:
      'Təchizatçı ilə sifariş açan şəxs eyni zamanda həmin sifarişin bank ödənişini təsdiqləyə bilməz.',
    riskLevel: 'critical',
    conflictingPermissions: ['procurement.orders.create', 'finance.expense.approve'],
    mitigationGuideAz:
      'Satınalma menecerinin yalnız sifariş tərtib etməsinə icazə verilməli, ödəməni Maliyyə direktoru təsdiqləməlidir.',
  },
  {
    id: 'sod-4',
    code: 'SOD-ADM-01',
    titleAz: 'Rol Dəyişmə və İstifadəçi İdarəetməsi Ziddiyyəti',
    descriptionAz:
      'İstifadəçilərə rol təyin edən administrator həm də rolun daxilindəki icazələr matrisini sərbəst artıra bilərsə, özünə tam hüquq verə bilər.',
    riskLevel: 'critical',
    conflictingPermissions: ['admin.users.manage', 'admin.roles.manage'],
    mitigationGuideAz:
      'Rolların tərkibinin dəyişdirilməsi yalnız Təhlükəsizlik Administratoruna (Superadmin), istifadəçi təyinatı isə HR/Ofis Menecerinə verilməlidir.',
  },
  {
    id: 'sod-5',
    code: 'SOD-POS-01',
    titleAz: 'Kassa Qaytarılması və Bank/Kassa Üzləşməsi Ziddiyyəti',
    descriptionAz:
      'Müştəriyə kassa üzrə pul qaytaran şəxs eyni zamanda gün sonu kassa və bank çıxarışı üzləşməsini apara bilməz.',
    riskLevel: 'high',
    conflictingPermissions: ['sales.refund.process', 'finance.reconcile'],
    mitigationGuideAz:
      'Qaytarılmanı kassir və ya filial administratoru icra etməli, lakin kassa audit və üzləşməsini mühasibatlıq aparmalıdır.',
  },
  {
    id: 'sod-6',
    code: 'SOD-MKT-01',
    titleAz: 'Qiymət Dəyişmə və Aksiya Qaydaları Ziddiyyəti',
    descriptionAz:
      'POS-da əl ilə sərbəst qiymət azaldan işçi həm də kütləvi endirim və aksiya limitlərini təyin edə bilməz.',
    riskLevel: 'high',
    conflictingPermissions: ['pos.price.override', 'marketing.discounts.manage'],
    mitigationGuideAz:
      'Aksiyaları Marketinq şöbəsi mərkəzləşdirilmiş təyin etməli, kassa qiymət override-ı isə yalnız menecer PIN ilə edilməlidir.',
  },
];

/**
 * Checks a list of permissions for Segregation of Duties (SoD) conflicts
 */
export function detectSodViolations(permissions: string[]): SodViolation[] {
  if (permissions.includes('*')) {
    // Superadmin wildcard is intentionally excluded from SoD warnings as it represents the root system role
    return [];
  }

  const permSet = new Set(permissions);
  const violations: SodViolation[] = [];

  for (const rule of STANDARD_SOD_RULES) {
    const [permA, permB] = rule.conflictingPermissions;
    if (permSet.has(permA) && permSet.has(permB)) {
      violations.push({
        rule,
        ruleId: rule.id,
        presentPermissions: [permA, permB],
      });
    }
  }

  return violations;
}
