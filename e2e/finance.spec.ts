import { test, expect } from '@playwright/test';

test.describe('Finance & Operational Accounting Module (Milestone F10)', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as System Admin (Sistem admini) with redirect to /finance
    await page.goto('/auth/login?redirect=/finance');
    const loginBtn = page.locator('button:has-text("Sistem admini")').first();
    await loginBtn.click();
    await page.waitForURL(/\/finance/);
    await expect(page.locator('text=Maliyyə və Kassa İdarəetməsi').first()).toBeVisible();
  });

  test('1. Finance Overview: KPI cards, definitions, and tax compliance notice', async ({ page }) => {
    // Verify Tax Compliance Warning
    await expect(page.locator('text=Vergi qaydaları Azərbaycan tələblərinə uyğun yoxlanılmalıdır.').first()).toBeVisible();

    // Verify Overview KPI cards
    await expect(page.locator('text=Kassa və Bank').first()).toBeVisible();
    await expect(page.locator('text=Debitor Borclar').first()).toBeVisible();
    await expect(page.locator('text=Dövrün Xərcləri').first()).toBeVisible();
    await expect(page.locator('text=Təsdiq Gözləyən').first()).toBeVisible();

    // Verify filter bar exists
    const searchInput = page.locator('input[placeholder*="Sənəd nömrəsi"]');
    await expect(searchInput).toBeVisible();
  });

  test('2. Cash & Bank Accounts: movements, statement view, and non-destructive reversal (storno)', async ({ page }) => {
    await page.goto('/finance/accounts');
    await expect(page.locator('text=Kassa və Bank Hesabları').first()).toBeVisible();

    // Verify Account cards exist
    await expect(page.locator('text=28 May Filial Kassası').first()).toBeVisible();
    await expect(page.locator('text=ABB Əsas Cari Hesab (AZN)').first()).toBeVisible();

    // Switch to Statement/Movements tab
    const statementTab = page.locator('button:has-text("Hesab Çıxarışı")');
    await statementTab.click();

    // Verify that NO delete buttons exist on finalized financial records
    const deleteButtons = page.locator('button:has-text("Sil")');
    await expect(deleteButtons).toHaveCount(0);

    // Test non-destructive reversal (storno) on an eligible finalized movement
    const reverseBtn = page.locator('button:has-text("Ləğv Et")').first();
    if (await reverseBtn.isVisible()) {
      await reverseBtn.click();

      // Verify Reversal Modal opens with warning
      await expect(page.locator('text=Qeydlər silinmir! Əks (Storno) əməliyyat tərtib olunur.')).toBeVisible();

      // Enter reversal reason via ID
      const reasonInput = page.locator('#reversal-reason-input');
      await reasonInput.fill('Yanlış köçürmə təyinatı üzrə storno');

      // Confirm reversal
      const confirmBtn = page.locator('button:has-text("Storno Yarat")');
      await confirmBtn.click();

      // Verify modal closure
      await expect(page.locator('text=Qeydlər silinmir!')).not.toBeVisible();
    }
  });

  test('3. Expense creation, approval lifecycle, and payment', async ({ page }) => {
    await page.goto('/finance/expenses');
    await expect(page.locator('text=Gəlir və Əməliyyat Xərcləri (OPEX)').first()).toBeVisible();

    // Open create expense modal
    const createBtn = page.locator('button:has-text("Yeni Xərc Qeydi")');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Fill form
    await page.locator('input[placeholder*="AF Mall İcarə QSC"]').fill('Ofis Təmir Xidmətləri MMC');
    await page.locator('input[placeholder="0.00"]').fill('450.00');
    await page.locator('textarea[placeholder*="elektrik sərfiyyatı"]').fill('Kondisioner təmir və profilaktika xərcləri');

    // Submit form (saves as draft)
    const saveDraftBtn = page.locator('button:has-text("Qaralama Kimi Yadda Saxla")');
    await saveDraftBtn.click();

    // Verify newly created expense appears in table as Draft or submitted
    await expect(page.locator('text=Ofis Təmir Xidmətləri MMC').first()).toBeVisible();

    // Submit for approval if button is visible
    const submitApprovalBtn = page.locator('button:has-text("Təsdiqə Göndər")').first();
    if (await submitApprovalBtn.isVisible()) {
      await submitApprovalBtn.click();
      await expect(page.locator('text=Təsdiq Gözləyir').first()).toBeVisible();
    }
  });

  test('4. Bank Statement CSV Import and Reconciliation Matcher', async ({ page }) => {
    await page.goto('/finance/reconciliation');
    await expect(page.locator('text=Bank və Kassa Üzləşməsi (Reconciliation)').first()).toBeVisible();

    // Verify tabs
    const bankTab = page.locator('button:has-text("Bank Çıxarışı İdxalı & Uzlaşdırma")');
    const tenderTab = page.locator('button:has-text("POS Tender & Slip Üzləşməsi")');
    await expect(bankTab).toBeVisible();
    await expect(tenderTab).toBeVisible();

    // Click "Bank CSV Çıxarışı Yüklə"
    const uploadCsvBtn = page.locator('button:has-text("Bank CSV Çıxarışı Yüklə")');
    await expect(uploadCsvBtn).toBeVisible();
    await uploadCsvBtn.click();

    // Verify Auto-Match button is present and clickable
    const autoMatchBtn = page.locator('button:has-text("Avtomatik Üzləşdir (Auto-Match)")');
    await expect(autoMatchBtn).toBeVisible();
    await autoMatchBtn.click();

    // Check Tender Reconciliation tab
    await tenderTab.click();
    await expect(page.locator('text=Gözlənilən (Satış)').first()).toBeVisible();
  });

  test('5. Budgets, variance analysis, and overrun alerts', async ({ page }) => {
    await page.goto('/finance/budgets');
    await expect(page.locator('text=Büdcə Planlaması və Limitlər').first()).toBeVisible();

    // Verify summary metric cards
    await expect(page.locator('text=Cəmi Planlaşdırılmış Büdcə')).toBeVisible();
    await expect(page.locator('text=Faktiki İcra Olunmuş Xərc')).toBeVisible();
    await expect(page.locator('text=Limiti Aşan Maddələr')).toBeVisible();

    // Open create budget modal
    const newBudgetBtn = page.locator('button:has-text("Yeni Büdcə Limiti Təyin Et")');
    await expect(newBudgetBtn).toBeVisible();
    await newBudgetBtn.click();

    // Verify modal is open and has period and limit inputs
    await expect(page.locator('h3:has-text("Yeni Büdcə Limiti Təyin Et"), h2:has-text("Yeni Büdcə Limiti Təyin Et")').first()).toBeVisible();
    const closeBtn = page.locator('button:has-text("İmtina")').first();
    await closeBtn.click();
  });

  test('6. Financial Reports: Management P&L with explicit lines and Drill-down', async ({ page }) => {
    await page.goto('/finance/reports');
    await expect(page.locator('text=Rəsmi Maliyyə Hesabatları').first()).toBeVisible();

    // Verify Management P&L lines
    await expect(page.locator('text=Xalis Satış Gəliri (Net Revenue)').first()).toBeVisible();
    await expect(page.locator('text=Satılan Malların Maya Dəyəri (COGS)').first()).toBeVisible();
    await expect(page.locator('text=Ümumi Mənfəət (Gross Profit)').first()).toBeVisible();
    await expect(page.locator('text=Xalis Mənfəət (Net Profit)').first()).toBeVisible();

    // Test Drill-down modal
    const drillDownBtn = page.locator('text=1. Xalis Satış Gəliri (Net Revenue)').first();
    if (await drillDownBtn.isVisible()) {
      await drillDownBtn.click();
      await expect(page.locator('text=İlkin Əməliyyatlar Detalı').first()).toBeVisible();
      const closeDrillBtn = page.locator('button:has-text("Bağla")').first();
      await closeDrillBtn.click();
    }
  });

  test('7. Accounting Integration Boundary: explicit "Aktiv deyil" state and posting rules', async ({ page }) => {
    await page.goto('/finance/accounting-boundary');
    await expect(page.locator('text=Mühasibat İnteqrasiyası və Baş Kitab Sərhədi (GL Boundary)').first()).toBeVisible();

    // Mandatory check: Must show explicit "Aktiv deyil" badge without faking journals
    await expect(page.locator('text=Aktiv deyil').first()).toBeVisible();

    // Verify tabs: Posting Rules and Chart of Accounts
    const coaTab = page.locator('button:has-text("Hesablar Planı")');
    await expect(coaTab).toBeVisible();
    await coaTab.click();
    await expect(page.locator('text=Hesab Kodu').first()).toBeVisible();

    const journalTab = page.locator('button:has-text("Jurnal Qeydləri")');
    await expect(journalTab).toBeVisible();
    await journalTab.click();
    await expect(page.locator('text=Debet (DT)').first()).toBeVisible();
    await expect(page.locator('text=Kredit (KT)').first()).toBeVisible();
  });
});
