/**
 * Utility functions for masking sensitive personal and salary data
 * in compliance with field-level privacy requirements.
 */

export function maskSalary(salaryText: string, unmasked = false): string {
  if (unmasked) return salaryText;
  return '•••••• ₼';
}

export function maskFinCode(fin: string, unmasked = false): string {
  if (unmasked || !fin) return fin;
  if (fin.length <= 2) return '•••••••';
  return `${fin.slice(0, 1)}•••••${fin.slice(-1)}`;
}

export function maskPhone(phone: string, unmasked = false): string {
  if (unmasked || !phone) return phone;
  const cleaned = phone.trim();
  if (cleaned.length < 6) return '••••••••';
  const last2 = cleaned.slice(-2);
  const prefix = cleaned.slice(0, 7);
  return `${prefix} ••• •• ${last2}`;
}

export function maskIban(iban: string, unmasked = false): string {
  if (unmasked || !iban) return iban;
  if (iban.length <= 8) return '••••••••••••••••••••••••••••';
  return `${iban.slice(0, 4)} •••• •••• •••• 9991`;
}

export function maskIdCard(idNumber: string, unmasked = false): string {
  if (unmasked || !idNumber) return idNumber;
  if (idNumber.length <= 4) return '••••••••';
  return `${idNumber.slice(0, 3)}••••••${idNumber.slice(-2)}`;
}

export const maskIdCardNumber = maskIdCard;

export function maskEmail(email: string, unmasked = false): string {
  if (unmasked || !email) return email;
  const parts = email.split('@');
  if (parts.length !== 2) return '•••••@••••.••';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 2 ? `${name[0]}${'•'.repeat(name.length - 2)}${name[name.length - 1]}` : '••';
  return `${maskedName}@${domain}`;
}
