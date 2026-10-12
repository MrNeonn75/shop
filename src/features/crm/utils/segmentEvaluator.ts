import { Customer, CustomerSegmentRules } from '../types';

/**
 * Evaluates whether a customer matches the given segment filter rules
 */
export function matchesSegmentRules(
  customer: Customer,
  rules: CustomerSegmentRules,
  currentDate = new Date()
): boolean {
  if (customer.isAnonymized) return false;

  // 1. Spend check
  if (rules.minSpendQapik !== undefined && customer.totalSpentQapik < rules.minSpendQapik) {
    return false;
  }
  if (rules.maxSpendQapik !== undefined && customer.totalSpentQapik > rules.maxSpendQapik) {
    return false;
  }

  // 2. Orders count
  if (rules.minOrdersCount !== undefined && customer.ordersCount < rules.minOrdersCount) {
    return false;
  }

  // 3. Recency (last visit within X days)
  if (rules.lastVisitWithinDays !== undefined) {
    if (!customer.lastPurchaseDate) return false;
    const lastDate = new Date(customer.lastPurchaseDate);
    const diffDays = Math.floor(
      (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays > rules.lastVisitWithinDays) return false;
  }

  // 4. Tier filter
  if (rules.tiers && rules.tiers.length > 0) {
    if (!rules.tiers.includes(customer.tier)) return false;
  }

  // 5. Branch filter
  if (rules.branches && rules.branches.length > 0 && !rules.branches.includes('*')) {
    if (!rules.branches.includes(customer.primaryBranchId)) return false;
  }

  // 6. Consent channel restriction (CRITICAL: Consent-awareness)
  if (rules.requiredConsentChannel) {
    if (rules.requiredConsentChannel === 'sms' && !customer.consent.smsMarketing) {
      return false;
    }
    if (rules.requiredConsentChannel === 'email' && !customer.consent.emailMarketing) {
      return false;
    }
    if (rules.requiredConsentChannel === 'whatsapp' && !customer.consent.whatsappMarketing) {
      return false;
    }
  }

  // 7. Category interest
  if (rules.categoryInterest && rules.categoryInterest.length > 0) {
    const hasCategory = rules.categoryInterest.some((cat) =>
      customer.preferredCategories.includes(cat)
    );
    if (!hasCategory) return false;
  }

  return true;
}

/**
 * Filter list of customers by segment rules
 */
export function filterCustomersBySegment(
  customers: Customer[],
  rules: CustomerSegmentRules
): Customer[] {
  return customers.filter((c) => matchesSegmentRules(c, rules));
}

/**
 * Duplicate customer detector by phone or email
 */
export function findPotentialDuplicates(
  target: { phone: string; email?: string; id?: string },
  customers: Customer[]
): Customer[] {
  const normPhone = target.phone.replace(/\D/g, '');
  const normEmail = target.email?.trim().toLowerCase();

  return customers.filter((c) => {
    if (target.id && c.id === target.id) return false;
    const cPhone = c.phone.replace(/\D/g, '');
    const phoneMatch = normPhone.length >= 7 && cPhone.endsWith(normPhone.slice(-7));
    const emailMatch = Boolean(
      normEmail && c.email && c.email.trim().toLowerCase() === normEmail
    );
    return phoneMatch || emailMatch;
  });
}

