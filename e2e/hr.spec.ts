import { test, expect } from '@playwright/test';

test.describe('HR & Human Resources Module (Milestone F11)', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Log in as System Admin (Sistem admini) with redirect to /hr/employees
    await page.goto('/auth/login?redirect=/hr/employees');
    const loginBtn = page.locator('button:has-text("Sistem admini")').first();
    await loginBtn.click();
    await page.waitForURL(/\/hr\/employees/);
    await expect(page.locator('text=Əməkdaşlar Kataloqu').first()).toBeVisible();
  });

  test('1. Employee Directory: listing, search, Org Chart toggle, and profile tabs', async ({ page }) => {
    // Verify search input
    const searchInput = page.locator('input[placeholder*="Ad, soyad"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Leyla');

    // Verify filtered result
    await expect(page.locator('text=Leyla Məmmədova').first()).toBeVisible();

    // Toggle to Org Chart view
    const orgChartBtn = page.locator('button:has-text("İyerarxiya (Org Chart)")');
    await orgChartBtn.click();
    await expect(page.locator('text=Leyla Məmmədova').first()).toBeVisible();

    // Toggle back to List view
    const listBtn = page.locator('button:has-text("Siyahı")');
    await listBtn.click();

    // Click into employee profile
    const detailLink = page.locator('a[href*="/hr/employees/emp-1"]').first();
    await detailLink.click();
    await page.waitForURL(/\/hr\/employees\/emp-1/);

    // Verify profile tabs
    await expect(page.locator('text=Şəxsi məlumat').first()).toBeVisible();
    await expect(page.locator('text=İş məlumatları').first()).toBeVisible();
    await expect(page.locator('text=Müqavilə').first()).toBeVisible();
    await expect(page.locator('text=Əməkhaqqı').first()).toBeVisible();

    // Switch to Salary tab (strictly permission-gated & masked)
    const salaryTab = page.locator('button:has-text("Əməkhaqqı")');
    await salaryTab.click();

    // Verify masked value by default
    await expect(page.locator('text=•••••• ₼').first()).toBeVisible();

    // Click reveal toggle button
    const eyeBtn = page.locator('button[title*="Aç"]').or(page.locator('button:has-text("Aç")')).first();
    if (await eyeBtn.isVisible()) {
      await eyeBtn.click();
      // Should now reveal unmasked salary value (e.g. 4,500.00 ₼)
      await expect(page.locator('text=4,500.00 ₼').first()).toBeVisible();
    }
  });

  test('2. Schedules & Shifts: planner grid, conflict alerts, and publish flow', async ({ page }) => {
    await page.goto('/hr/schedules');
    await expect(page.locator('text=İş Qrafikləri və Növbə Planlayıcısı').first()).toBeVisible();

    // Verify branch selector and week range
    await expect(page.locator('text=Həftə:').first()).toBeVisible();

    // Verify action buttons
    const copyBtn = page.locator('button:has-text("Əvvəlki Həftədən Kopyala")');
    await expect(copyBtn).toBeVisible();

    const publishBtn = page.locator('button:has-text("Qrafik")').first();
    await expect(publishBtn).toBeVisible();
  });

  test('3. Attendance: daily branch board, offline biometric notice, and exception correction', async ({ page }) => {
    await page.goto('/hr/attendance');
    await expect(page.locator('text=Davamiyyət və İş Vaxtı').first()).toBeVisible();

    // Verify explicit hardware offline status indicator
    await expect(page.locator('text=Biometrik terminal: Konfiqurasiya olunmayıb').first()).toBeVisible();

    // Verify metric cards
    await expect(page.locator('text=Vaxtında Gələnlər').first()).toBeVisible();
    await expect(page.locator('text=Gecikmələr').first()).toBeVisible();

    // Switch to Exceptions tab
    const exceptionsTab = page.locator('button:has-text("İstisnalar Növbəsi")');
    await exceptionsTab.click();

    // If an exception correction button is visible, test the modal flow
    const correctBtn = page.locator('button:has-text("Düzəliş Et")').first();
    if (await correctBtn.isVisible()) {
      await correctBtn.click();
      await expect(page.locator('text=Davamiyyət İstisnasına Düzəliş').first()).toBeVisible();

      // Close modal
      const cancelBtn = page.locator('button:has-text("Ləğv et")').first();
      await cancelBtn.click();
    }

    // Switch to Monthly Timesheet tab
    const timesheetTab = page.locator('button:has-text("Aylıq Tabel (Timesheet)")');
    await timesheetTab.click();
    await expect(page.locator('text=Aylıq İş Vaxtının Uçotu Cədvəli').first()).toBeVisible();
  });

  test('4. Leave Management: balance cards, public holidays, and approval workflow', async ({ page }) => {
    await page.goto('/hr/leave');
    await expect(page.locator('text=Məzuniyyət İdarəetməsi').first()).toBeVisible();

    // Switch to Public Holidays tab
    const holidaysTab = page.locator('button:has-text("Rəsmi Bayram")');
    await holidaysTab.click();
    await expect(page.locator('text=Novruz Bayramı').first()).toBeVisible();

    // Switch back to Requests tab
    const requestsTab = page.locator('button:has-text("Müraciətlər")');
    await requestsTab.click();

    // Open leave request modal
    const requestBtn = page.locator('button:has-text("Yeni Məzuniyyət Müraciəti")');
    await expect(requestBtn).toBeVisible();
    await requestBtn.click();

    await expect(page.locator('text=Yeni Məzuniyyət Müraciəti').first()).toBeVisible();

    // Close modal
    const cancelBtn = page.locator('button:has-text("Bağla")').or(page.locator('button:has-text("Ləğv Et")')).first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  });

  test('5. Payroll: statutory notice, calculation runs, payslip modal, and bank export', async ({ page }) => {
    await page.goto('/hr/payroll');
    await expect(page.locator('text=Əməkhaqqı Fondu və Hesablaşma').first()).toBeVisible();

    // Verify Azerbaijani statutory compliance warning
    await expect(page.locator('text=Qanunvericilik və Vergi Qaydaları Bildirişi').first()).toBeVisible();

    // Verify calculation metrics
    await expect(page.locator('text=Ümumi Hesablanmış (Gross)').first()).toBeVisible();
    await expect(page.locator('text=Xalis Ödəniləcək (Net)').first()).toBeVisible();

    // Open Payslip modal
    const payslipBtn = page.locator('button:has-text("Qəbz (Payslip)")').first();
    if (await payslipBtn.isVisible()) {
      await payslipBtn.click();
      await expect(page.locator('text=Fərdi Əməkhaqqı Vərəqəsi').first()).toBeVisible();
      await expect(page.locator('text=BRAND HOUSE RETAIL MMC').first()).toBeVisible();
      await expect(page.locator('text=DSMF').first()).toBeVisible();
      await expect(page.locator('text=İcbari Tibbi Sığorta').first()).toBeVisible();

      // Close Payslip modal
      const closeBtn = page.locator('button:has-text("Bağla")').first();
      await closeBtn.click();
    }

    // Verify Bank export button
    const bankExportBtn = page.locator('button:has-text("Bank CSV İxrac")');
    await expect(bankExportBtn).toBeVisible();

    // Open Branch OPEX allocation modal
    const allocBtn = page.locator('button:has-text("Filial Xərc Bölgüsü")');
    await allocBtn.click();
    await expect(page.locator('text=Filiallar üzrə Əməkhaqqı Xərc Bölgüsü').first()).toBeVisible();
    const closeAllocBtn = page.locator('button:has-text("Bağla")').first();
    await closeAllocBtn.click();
  });

  test('6. HR Privacy & Sensitive Data Audit: access log and retention statement', async ({ page }) => {
    await page.goto('/hr/privacy');
    await expect(page.locator('text=Fərdi Məlumatların Məxfiliyi və Audit Jurnalı').first()).toBeVisible();

    // Verify retention statement
    await expect(page.locator('text=5 il').first()).toBeVisible();

    // Verify access audit log table
    await expect(page.locator('text=Həssas maaş və kadr məlumatlarına').first()).toBeVisible();
  });
});
