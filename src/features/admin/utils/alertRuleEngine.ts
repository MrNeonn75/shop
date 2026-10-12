import { AlertRule } from '../types/notifications';

export interface AlertRuleValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateAlertRule(rule: Partial<AlertRule>): AlertRuleValidationResult {
  const errors: string[] = [];

  if (!rule.name || rule.name.trim().length < 3) {
    errors.push('Qayda adı ən azı 3 simvol olmalıdır.');
  }

  if (!rule.triggerType) {
    errors.push('Tətikləyici hadisə növü seçilməlidir.');
  }

  if (rule.thresholdValue === undefined || rule.thresholdValue === null || rule.thresholdValue < 0) {
    errors.push('Hədd dəyəri (threshold) 0 və ya daha böyük ədəd olmalıdır.');
  }

  if (!rule.recipientRoles || rule.recipientRoles.length === 0) {
    errors.push('Ən azı 1 alıcı rolu seçilməlidir.');
  }

  if (rule.escalationMinutes !== undefined && rule.escalationMinutes < 0) {
    errors.push('Eskalasiya müddəti mənfi ola bilməz.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function formatTriggerDescription(rule: AlertRule): string {
  switch (rule.triggerType) {
    case 'low_stock':
      return `Qalıq sayı ${rule.thresholdValue} ədəddən aşağı düşdükdə`;
    case 'overdue_payment':
      return `Təchizatçı ödənişi ${rule.thresholdValue} gündən çox gecikdikdə`;
    case 'po_delay':
      return `PO təhvil tarixi ${rule.thresholdValue} gündən çox keçdikdə`;
    case 'transfer_transit_delayed':
      return `Transfer tranzitdə ${rule.thresholdValue} gündən çox qaldıqda`;
    case 'register_variance':
      return `Kassa Fərqi: gün sonu kənarlaşması ${rule.thresholdValue} ${rule.thresholdUnit || '₼'} keçdikdə`;
    case 'large_refund':
      return `Qaytarılma məbləği ${rule.thresholdValue} AZN-dən böyük olduqda`;
    case 'failed_integration':
      return `İnteqrasiya ardıcıl ${rule.thresholdValue} dəfə xəta verdikdə`;
    case 'backup_failure':
      return `Ehtiyat nüsxə ${rule.thresholdValue} saatdan çox icra olunmadıqda`;
    case 'document_expiry':
      return `Müqavilənin bitməsinə ${rule.thresholdValue} gün qaldıqda`;
    default:
      return 'Təyin olunmamış qayda';
  }
}
