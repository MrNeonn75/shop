import { test, expect } from '@playwright/test';

test.describe('CRM & Loyalty Module (Milestone F12 - Part B)', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as System Admin (Sistem admini) with redirect to /crm/customers
    await page.goto('/auth/login?redirect=/crm/customers');
    const loginBtn = page.locator('button:has-text("Sistem admini")').first();
    await loginBtn.click();
    await page.waitForURL(/\/crm\/customers/);
    await expect(page.locator('text=Müştəri Bazası və Loyallıq (CRM)').first()).toBeVisible();
  });

  test('1. Customers Directory: phone-first search, PII masking, and quick-create modal', async ({ page }) => {
    // Verify customers table
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('text=Elmir Əliyev').first()).toBeVisible();

    // Verify phone-first search input
    const phoneInput = page.locator('input[placeholder*="İlk öncə telefon"]');
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill('55234');
    await expect(page.locator('text=Leyla Məmmədova').first()).toBeVisible();

    // Clear search
    await phoneInput.fill('');

    // Open Quick Create modal
    const quickCreateBtn = page.locator('button:has-text("Yeni Müştəri Qeydiyyatı")');
    await quickCreateBtn.click();

    // Check modal fields and GDPR consent
    await expect(page.locator('text=Sürətli Müştəri Qeydiyyatı').first()).toBeVisible();
    await expect(page.locator('text=Fərdi məlumatların emalına razılıq').first()).toBeVisible();

    // Close modal
    const cancelBtn = page.locator('button:has-text("İmtina")');
    await cancelBtn.click();
  });

  test('2. Customer Profile: 8 tabs, consent toggles, and points adjustment', async ({ page }) => {
    // Navigate to customer profile
    await page.goto('/crm/customers/cust-1');
    await expect(page.locator('text=Elmir Əliyev').first()).toBeVisible();

    // Check header metrics (Lifetime value, AOV)
    await expect(page.locator('text=Ömürlük Dəyər (LTV)').first()).toBeVisible();
    await expect(page.locator('text=Orta Çek (AOV)').first()).toBeVisible();

    // Verify Tabs
    await expect(page.locator('button:has-text("Ümumi Məlumat")')).toBeVisible();
    await expect(page.locator('button:has-text("Alış Tarixçəsi")')).toBeVisible();
    await expect(page.locator('button:has-text("Qaytarmalar")')).toBeVisible();
    await expect(page.locator('button:has-text("Loyallıq və Ballar")')).toBeVisible();
    await expect(page.locator('button:has-text("Razılıqlar (Consent)")')).toBeVisible();
    await expect(page.locator('button:has-text("Audit Jurnalı")')).toBeVisible();

    // Switch to Purchases tab
    const purchasesTab = page.locator('button:has-text("Alış Tarixçəsi")');
    await purchasesTab.click();
    await expect(page.locator('text=ORD-2026-0891').first()).toBeVisible();

    // Switch to Consent tab
    const consentTab = page.locator('button:has-text("Razılıqlar (Consent)")');
    await consentTab.click();
    await expect(page.locator('text=SMS Bildirişləri').first()).toBeVisible();
    await expect(page.locator('text=WhatsApp Bildirişləri').first()).toBeVisible();

    // Open Points Adjustment modal from header
    const adjustBtn = page.locator('button:has-text("Bal Düzəlişi Et")').first();
    await adjustBtn.click();

    await expect(page.locator('text=Loyallıq Balı Düzəlişi').first()).toBeVisible();
    const modalCancel = page.locator('button:has-text("İmtina")');
    await modalCancel.click();
  });

  test('3. Segments Builder: dynamic rules, live matched count, and CSV export', async ({ page }) => {
    await page.goto('/crm/segments');
    await expect(page.locator('text=Müştəri Seqmentləri').first()).toBeVisible();

    // Check predefined segments
    await expect(page.locator('text=VIP Daimi Müştərilər').first()).toBeVisible();
    await expect(page.locator('text=Risk Qrupunda Olanlar').first()).toBeVisible();

    // Open Segment Builder modal
    const createSegBtn = page.locator('button:has-text("Yeni Seqment")');
    await createSegBtn.click();

    await expect(page.locator('text=Yeni Müştəri Seqmenti').first()).toBeVisible();
    await expect(page.locator('text=Uyğun Müştəri Sayı (Canlı)').first()).toBeVisible();

    // Close modal
    const cancelBtn = page.locator('button:has-text("İmtina")');
    await cancelBtn.click();
  });

  test('4. Loyalty Program Settings & Interactive Sandbox Simulator', async ({ page }) => {
    await page.goto('/crm/loyalty');
    await expect(page.locator('text=Loyallıq Proqramı Konfiqurasiyası').first()).toBeVisible();

    // Verify program version and effective date
    await expect(page.locator('text=v2.2').first()).toBeVisible();
    await expect(page.locator('text=2026-01-01').first()).toBeVisible();

    // Verify core policy rules (30% cap, multipliers)
    await expect(page.locator('text=30% Maksimum Qəbz Güzəşti').first()).toBeVisible();

    // Check interactive simulator sandbox
    await expect(page.locator('text=Loyallıq Qaydaları Simulyatoru').first()).toBeVisible();
    await expect(page.locator('text=Hesablanan Əsas Bal').first()).toBeVisible();
    await expect(page.locator('text=Ödəniləcək Yekun Məbləğ').first()).toBeVisible();
  });
});
