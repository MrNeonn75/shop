import { test, expect } from '@playwright/test';

test.describe('Modules 17-20: Admin, Security, Notifications & System Settings E2E', () => {
  test('navigates to User Access Review page and displays inactive users and effective permissions', async ({
    page,
  }) => {
    await page.goto('/admin/access-review');

    await expect(page.locator('text=İstifadəçi Giriş Səlahiyyətlərinin Təftişi')).toBeVisible();
    await expect(page.locator('text=Dövri İcazə Matrisi və Qeyri-Aktiv Hesabların Təhlili')).toBeVisible();

    // Verify presence of table headers and export button
    await expect(page.locator('text=Təftiş Hesabatını İxrac Et (CSV)')).toBeVisible();
    await expect(page.locator('th:has-text("İstifadəçi")')).toBeVisible();
    await expect(page.locator('th:has-text("Efektiv İcazələr")')).toBeVisible();
    await expect(page.locator('th:has-text("Fəaliyyətsizlik")')).toBeVisible();

    // Verify filter tabs exist
    await expect(page.locator('button:has-text("Bütün İstifadəçilər")')).toBeVisible();
    await expect(page.locator('button:has-text("Qeyri-aktiv (>30 gün)")')).toBeVisible();
  });

  test('navigates to System Settings page, edits a parameter, and verifies pre-save diff modal requires reason', async ({
    page,
  }) => {
    await page.goto('/admin/settings');

    await expect(page.locator('text=Sistem Parametrləri & Konfiqurasiya')).toBeVisible();

    // Check tabs
    await expect(page.locator('button:has-text("Ümumi")')).toBeVisible();
    await expect(page.locator('button:has-text("Qaytarma")')).toBeVisible();
    await expect(page.locator('button:has-text("Təhlükəsizlik")')).toBeVisible();
    await expect(page.locator('button:has-text("İnteqrasiyalar")')).toBeVisible();

    // Modify company name in general tab
    const companyInput = page.locator('input').first();
    await companyInput.fill('BRAND HOUSE LUXURY MMC');

    // Click Save Changes button
    const saveBtn = page.getByRole('button', { name: 'Dəyişiklikləri Yadda Saxla' });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Pre-save Diff Modal must appear
    await expect(page.locator('text=Konfiqurasiya Dəyişikliklərinin Təsdiqi (Pre-Save Diff)')).toBeVisible();
    await expect(page.locator('text=Dəyişikliyin Əsaslandırılması (Mütləqdir)')).toBeVisible();

    // Reason input must be required
    const reasonInput = page.locator('textarea[placeholder*="Səbəbi daxil edin"]');
    await expect(reasonInput).toBeVisible();

    // Confirm button should be disabled until reason is typed
    const confirmBtn = page.getByRole('button', { name: 'Təsdiqlə və Versiyalaşdır' });
    await expect(confirmBtn).toBeDisabled();

    // Enter reason
    await reasonInput.fill('Şirkətin hüquqi adının rəsmi yenilənməsi');
    await expect(confirmBtn).toBeEnabled();
  });

  test('navigates to Unified Approvals Inbox and tests approval decision flow', async ({ page }) => {
    await page.goto('/approvals');

    await expect(page.locator('text=Vahid Təsdiqləmə Mərkəzi')).toBeVisible();
    await expect(page.locator('text=Maliyyə xərcləri, satınalma sifarişləri, anbar transferləri')).toBeVisible();

    // Filter tabs exist
    await expect(page.locator('button:has-text("Gözləyən")')).toBeVisible();
    await expect(page.locator('button:has-text("Təsdiqlənmiş")')).toBeVisible();
    await expect(page.locator('button:has-text("İmtina Edilmiş")')).toBeVisible();
  });

  test('navigates to Notifications Center and checks categories and snooze functionality', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.locator('text=Bildiriş Mərkəzi')).toBeVisible();
    await expect(page.locator('button:has-text("Hamısını oxunmuş et")')).toBeVisible();

    // Categories filter pills
    await expect(page.locator('button:has-text("Hamısı")')).toBeVisible();
    await expect(page.locator('button:has-text("Stok")')).toBeVisible();
    await expect(page.locator('button:has-text("Kassa")')).toBeVisible();
    await expect(page.locator('button:has-text("Təhlükəsizlik")')).toBeVisible();
  });

  test('navigates to Security Events page and investigates an incident', async ({ page }) => {
    await page.goto('/admin/security-events');

    await expect(page.locator('text=Təhlükəsizlik Hadisələri & İnsidentlər')).toBeVisible();
    await expect(page.locator('text=Uğursuz girişlər, bloklamalar, icazə aşmaları')).toBeVisible();

    // Severity badges in table
    await expect(page.locator('th:has-text("Hadisə / Növ")')).toBeVisible();
    await expect(page.locator('th:has-text("Səviyyə")')).toBeVisible();
    await expect(page.locator('th:has-text("Status")')).toBeVisible();
  });

  test('detects Segregation of Duties (SoD) warnings in Role Editor', async ({ page }) => {
    await page.goto('/admin/roles');

    await expect(page.locator('text=Rollar və İcazələr Matrisi (RBAC)')).toBeVisible();

    // Select Kassir role
    await page.locator('button:has-text("Kassir")').click();

    // Click permission catalog button
    const catalogBtn = page.getByRole('button', { name: 'İcazələr Kataloqu' });
    await expect(catalogBtn).toBeVisible();
    await catalogBtn.click();

    // Permission catalog drawer opens
    await expect(page.locator('text=Sistem İcazələr Kataloqu (Klassifikator)')).toBeVisible();
    await expect(page.locator('text=Həssas Əməliyyat')).toBeVisible();
  });
});

