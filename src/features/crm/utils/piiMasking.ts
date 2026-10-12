/**
 * BRAND HOUSE CRM — PII Masking Utilities
 * Protects personally identifiable customer information based on user permissions.
 */

export function maskPhone(phone: string | undefined | null, canView: boolean): string {
  if (!phone) return '-';
  if (canView) return phone;

  // Preserve prefix (+994 or 050) and last 2 digits, mask middle
  const cleaned = phone.trim();
  if (cleaned.length <= 6) return '***';

  const prefix = cleaned.slice(0, 6);
  const suffix = cleaned.slice(-2);
  return `${prefix} *** ** ${suffix}`;
}

export function maskEmail(email: string | undefined | null, canView: boolean): string {
  if (!email) return '-';
  if (canView) return email;

  const parts = email.split('@');
  if (parts.length !== 2) return '***@***.***';

  const [username, domain] = parts;
  const maskedUser =
    username.length > 2
      ? `${username[0]}***${username[username.length - 1]}`
      : `${username[0]}***`;

  return `${maskedUser}@${domain}`;
}

