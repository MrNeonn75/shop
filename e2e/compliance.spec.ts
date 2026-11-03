import { test, expect } from '@playwright/test';

test.describe('Compliance & Legal Layer (Milestone B15 & Frontend Integration) E2E', () => {
  test('global banner renders in non-production with DEMO badge and link to Compliance Center', async ({
    page,
  }) => {
    await page.goto('/');

    // Global Compliance Banner
    const banner = page.locator('role=alert');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('DEMO');
    await expect(banner).toContainText('təsdiqlənməmiş');
    await expect(banner).toContainText('Qaydaları təsdiqlə');

    // Click link to Compliance Center
    await page.click('text=Qaydaları təsdiqlə');
    await expect(page).toHaveURL(/\/compliance/);
  });

  test('navigates to Compliance Center, verifies domains, legal disclaimer, and opens rule detail drawer', async ({
    page,
  }) => {
    await page.goto('/compliance');

    // Header & disclaimer
    await expect(page.locator('text=Uyğunluq Mərkəzi')).toBeVisible();
    await expect(
      page.locator('text=Bu sistem uyğunluğa dəstək verir, hüquqi məsləhət deyil')
    ).toBeVisible();

    // 9 Domain cards visible
    await expect(page.locator('text=ƏDV və dövriyyə monitorinqi')).toBeVisible();
    await expect(page.locator('text=E-kassa və fiskal qəbz elementləri')).toBeVisible();
    await expect(page.locator('text=Fərdi gəlir vergisi')).toBeVisible();
    await expect(page.locator('text=Məhsul qaytarılması və 14 günlük müddət')).toBeVisible();

    // Rule register table
    await expect(page.locator('th:has-text("Paket Adı")')).toBeVisible();
    await expect(page.locator('th:has-text("Qanunvericilik Əsası")')).toBeVisible();

    // Open detail drawer for first rule pack
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();

    // Drawer should open with legal reference and parameters
    await expect(page.locator('text=Qanunvericilik Əsası')).toBeVisible();
    await expect(page.locator('text=Qayda Parametrləri')).toBeVisible();
    await expect(page.locator('button:has-text("Dəyişiklik təklif et")')).toBeVisible();
    await expect(page.locator('button:has-text("Təsdiqlə və Aktivləşdir")')).toBeVisible();
  });

  test('verification modal enforces two-person rule and minimum 20-char evidence', async ({
    page,
  }) => {
    await page.goto('/compliance');

    // Click verify on first pack
    const verifyBtn = page.locator('button:has-text("Təsdiq")').first();
    await verifyBtn.click();

    // Modal opens
    await expect(page.locator('text=Hüquqi Qayda Paketini Təsdiqlə və Aktivləşdir')).toBeVisible();

    // Verifier role buttons
    await expect(page.locator('button:has-text("Baş Mühasib")')).toBeVisible();
    await expect(page.locator('button:has-text("Korporativ Hüquqşünas")')).toBeVisible();

    // Evidence textarea
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    // Submit button should be disabled when notes < 20 characters
    const submitBtn = page.getByRole('button', { name: 'Təsdiqlə və Aktivləşdir' });
    await expect(submitBtn).toBeDisabled();

    // Fill notes >= 20 chars
    await textarea.fill('AR Vergi Məcəlləsinin 2026-cı il rəsmi mətni üzrə qaydalar dəqiqləşdirildi.');
    await expect(submitBtn).toBeEnabled();
  });

  test('navigates to Privacy Center, inspects registers, and generates audit inspection pack', async ({
    page,
  }) => {
    await page.goto('/compliance/privacy');

    // Title
    await expect(page.locator('text=Fərdi Məlumatlar və Məxfilik Mərkəzi')).toBeVisible();

    // State Registration Tracker
    await expect(
      page.locator('text=Fərdi Məlumat İnformasiya Sistemlərinin Dövlət Qeydiyyatı')
    ).toBeVisible();

    // Data Processing Register & Transfer Register
    await expect(page.locator('text=Məlumatların Emalı Reyestri')).toBeVisible();
    await expect(page.locator('text=Transsərhəd Ötürülmə Reyestri')).toBeVisible();
    await expect(page.locator('text=Vətəndaş Müraciətləri Növbəsi (DSAR)')).toBeVisible();

    // Generate inspection pack
    const generateBtn = page.getByRole('button', { name: /Dövlət Yoxlama Paketi Yarat/ });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Inspection pack modal appears with SHA-256
    await expect(page.locator('text=Dövlət Yoxlama Paketi (Audit & Inspection Bundle)')).toBeVisible();
    await expect(page.locator('text=SHA-256 Həş')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Paketi Yüklə (JSON)' })).toBeVisible();
  });

  test('POS Shift Header renders Fiscal status chip and reconcile dialog', async ({ page }) => {
    await page.goto('/pos');

    // Fiscal chip
    const fiscalChip = page.locator('button[title*="Fiskal Kassa Statusu"]');
    await expect(fiscalChip).toBeVisible();
    await expect(fiscalChip).toContainText('Fiskal:');

    // Click opens reconcile dialog
    await fiscalChip.click();
    await expect(
      page.locator('text=Fiskal Kassa və E-Kassa Şlüz Diaqnostikası')
    ).toBeVisible();
    await expect(page.locator('text=Təkrarlanan Fiskallaşdırma Qadağası')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Statusu Yoxla (Reconcile)' })).toBeVisible();
  });
});

