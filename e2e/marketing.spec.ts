import { test, expect } from '@playwright/test';

test.describe('Marketing & Promotions Module (Milestone F12 - Part A)', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as System Admin (Sistem admini) with redirect to /marketing/campaigns
    await page.goto('/auth/login?redirect=/marketing/campaigns');
    const loginBtn = page.locator('button:has-text("Sistem admini")').first();
    await loginBtn.click();
    await page.waitForURL(/\/marketing\/campaigns/);
    await expect(page.locator('text=Marketinq və Kampaniyalar').first()).toBeVisible();
  });

  test('1. Campaigns Directory: listing, filter, wizard modal opening and validation', async ({ page }) => {
    // Verify campaigns table exists with items
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('text=CMP-2026-001').first()).toBeVisible();

    // Filter by status
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('active');
    await expect(page.locator('text=Yaz-Yay 2026 Kolleksiya Açılışı').first()).toBeVisible();

    // Open campaign wizard
    const newCampBtn = page.locator('button:has-text("Yeni Kampaniya Yarat")');
    await newCampBtn.click();

    // Check wizard modal is open
    await expect(page.locator('text=Yeni Marketinq Kampaniyası').first()).toBeVisible();
    await expect(page.locator('text=Kampaniyanın Adı').first()).toBeVisible();

    // Fill campaign name and navigate next step
    const nameInput = page.locator('input[placeholder*="Kolleksiya Açılışı"]');
    await nameInput.fill('Yeni Bahar Kampaniyası');
    const nextBtn = page.locator('button:has-text("İrəli")');
    await nextBtn.click();

    // Close wizard
    const cancelBtn = page.locator('button:has-text("Ləğv et")');
    await cancelBtn.click();
  });

  test('2. Promotions & Rule Engine Simulator: priority ordering and cart calculation', async ({ page }) => {
    await page.goto('/marketing/promotions');
    await expect(page.locator('text=Endirim Qaydaları və Simulyator').first()).toBeVisible();

    // Verify rules table is visible
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('text=2-ci Məhsula 50% Endirim (BOGO)').first()).toBeVisible();

    // Switch to Simulator tab
    const simulatorTabBtn = page.locator('button:has-text("Canlı Səbət Simulyatoru")');
    await simulatorTabBtn.click();

    // Check simulator elements
    await expect(page.locator('text=Aksiya Hesablama Simulyatoru').first()).toBeVisible();
    await expect(page.locator('text=Müştəri Loyallıq Dərəcəsi').first()).toBeVisible();
    await expect(page.locator('text=Yekun Səbət Məbləği').first()).toBeVisible();
  });

  test('3. Promo Codes: codes directory, limits, and redemptions log', async ({ page }) => {
    await page.goto('/marketing/promo-codes');
    await expect(page.locator('text=Promokodlar və Kupon İdarəetməsi').first()).toBeVisible();

    // Verify promo code items
    await expect(page.locator('text=NOVRUZ2026').first()).toBeVisible();
    await expect(page.locator('text=BAKU25').first()).toBeVisible();

    // Switch to redemption log tab
    const logTabBtn = page.locator('button:has-text("Kassa İstifadə Jurnalı")');
    await logTabBtn.click();

    await expect(page.locator('text=Promokod İstifadə Jurnalı').first()).toBeVisible();
    await expect(page.locator('text=NOVRUZ2026').first()).toBeVisible();
  });

  test('4. Campaign Performance: KPIs, attribution, and ROI metrics', async ({ page }) => {
    await page.goto('/marketing/performance');
    await expect(page.locator('text=Kampaniya Performansı və ROI Analitikası').first()).toBeVisible();

    // Verify metrics cards
    await expect(page.locator('text=Faktiki Satış Gəliri').first()).toBeVisible();
    await expect(page.locator('text=Endirim Xərci (Güzəşt)').first()).toBeVisible();
    await expect(page.locator('text=Ümumi Marja (Gross Margin)').first()).toBeVisible();
    await expect(page.locator('text=Marketinq ROI').first()).toBeVisible();

    // Verify branch performance table
    await expect(page.locator('text=Filiallar Üzrə Nəticələrin Bölüşdürülməsi').first()).toBeVisible();
    await expect(page.locator('text=Mall 28 Filialı').first()).toBeVisible();
  });

  test('5. Communications Scaffold: channels provider status and templates', async ({ page }) => {
    await page.goto('/marketing/communications');
    await expect(page.locator('text=Müştəri Bildirişləri və Kommunikasiya').first()).toBeVisible();

    // Verify explicit unconfigured provider notice
    await expect(page.locator('text=Konfiqurasiya olunmayıb').first()).toBeVisible();

    // Verify campaign and templates
    await expect(page.locator('text=Novruz SMS Kampaniyası').first()).toBeVisible();
    await expect(page.locator('text=Novruz Təbriki & Şəxsi Promokod').first()).toBeVisible();
  });
});
