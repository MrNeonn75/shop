import { test, expect } from '@playwright/test';

test.describe('Purchasing & Supplier Management Module (Milestone F8)', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Log in as System Admin (Sistem admini) with redirect to /suppliers
    await page.goto('/auth/login?redirect=/suppliers');
    const loginBtn = page.locator('button:has-text("Sistem admini")').first();
    await loginBtn.click();
    await page.waitForURL(/\/suppliers/);
    await expect(page.locator('text=Təchizatçılar').first()).toBeVisible();
  });

  test('1. Supplier directory: listing, filtering, search, and detail tabs', async ({ page }) => {
    // Verify search input
    const searchInput = page.locator('input[placeholder*="Təchizatçı adı"]');
    await expect(searchInput).toBeVisible();

    // Filter by name
    await searchInput.fill('Baku Fashion');
    await expect(page.locator('text=Baku Fashion Textile MMC')).toBeVisible();

    // Navigate to Supplier detail page via "Kart" button
    const cardBtn = page.locator('button:has-text("Kart")').first();
    await expect(cardBtn).toBeVisible();
    await cardBtn.click();
    await page.waitForURL(/\/suppliers\/sup-1/);

    // Verify detail header has tax ID
    await expect(page.locator('text=1401234567')).toBeVisible();

    // Navigate through detail tabs
    const contractsTab = page.locator('button:has-text("Müqavilələr")');
    await expect(contractsTab).toBeVisible();
    await contractsTab.click();
    await expect(page.locator('text=Müqavilə').first()).toBeVisible();

    const productsTab = page.locator('button:has-text("Məhsullar")');
    await productsTab.click();
    await expect(page.locator('text=Təchizatçı Nomenklaturası və Son Alış Qiymətləri')).toBeVisible();

    const statementTab = page.locator('button:has-text("Borc Balansı")');
    await statementTab.click();
    await expect(page.locator('text=Hesab Ekstraktı (Statement Ledger)')).toBeVisible();

    const kpiTab = page.locator('button:has-text("Performans")');
    await kpiTab.click();
    await expect(page.locator('text=Vaxtında Çatdırılma')).toBeVisible();
  });

  test('2. Duplicate supplier detection by VÖEN and company name', async ({ page }) => {
    await page.goto('/suppliers');

    // Click "Yeni Təchizatçı" button to open modal
    const createBtn = page.locator('button:has-text("Yeni Təchizatçı")');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Enter existing VÖEN
    const voenInput = page.locator('input[placeholder*="1405829141"]').or(page.locator('label:has-text("VÖEN") + input')).first();
    await voenInput.fill('1401234567');

    const nameInput = page.locator('input[placeholder*="Baku Fashion Textile MMC"]').or(page.locator('label:has-text("Təchizatçı Adı") + input')).first();
    await nameInput.fill('Baku Fashion Textile MMC');

    // Verify duplicate warning banner is shown live
    await expect(page.locator('text=Təkrar Qeydiyyat Xəbərdarlığı')).toBeVisible();
    await expect(page.locator('text=artıq mövcuddur')).toBeVisible();

    // Close modal
    await page.locator('button:has-text("Ləğv et")').click();
  });

  test('3. Purchase Request: form, fashion variant grid, and suggested reorder helper', async ({ page }) => {
    await page.goto('/purchasing/requests');
    await expect(page.locator('text=Daxili Satınalma Tələbnamələri')).toBeVisible();

    // Open new request form
    const newReqBtn = page.locator('button:has-text("Yeni Tələbnamə")');
    await expect(newReqBtn).toBeVisible();
    await newReqBtn.click();
    await page.waitForURL('/purchasing/requests/new');

    // Verify header and fields
    await expect(page.locator('text=Yeni Daxili Satınalma Tələbnaməsi')).toBeVisible();

    // Fill request reason
    const reasonInput = page.locator('input[placeholder*="Vitrin"]').or(page.locator('label:has-text("Səbəbi") + input')).first();
    await reasonInput.fill('Yaz mövsümü üçün vitrin ehtiyatının artırılması');

    // Check Reorder Helper modal
    const helperBtn = page.locator('button:has-text("Ehtiyat Təklifləri (Reorder Helper)")');
    await expect(helperBtn).toBeVisible();
    await helperBtn.click();
    await expect(page.locator('text=Avtomatlaşdırılmış Sifariş Təklifləri')).toBeVisible();
    await expect(page.locator('text=display only')).toBeVisible();
    await page.locator('button:has-text("Bağla")').click();

    // Check Fashion Size x Color Matrix modal
    const matrixBtn = page.locator('button:has-text("Ölçü × Rəng Matrisi")');
    await expect(matrixBtn).toBeVisible();
    await matrixBtn.click();
    await expect(page.getByRole('heading', { name: /Moda Ölçü × Rəng Matrisi/ })).toBeVisible();
    await page.locator('div[role="dialog"] button:has-text("Bağla")').click();

    // Submit the request
    const submitBtn = page.locator('button:has-text("Təsdiqə Göndər")');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Redirected back to request list
    await page.waitForURL('/purchasing/requests');
    await expect(page.locator('text=Daxili Satınalma Tələbnamələri')).toBeVisible();
  });

  test('4. Purchase Order: detail view, stepper, print preview, and unconfigured email warning', async ({ page }) => {
    await page.goto('/purchasing/orders/po-1');

    // Verify document header & stepper
    await expect(page.getByRole('heading', { name: /PO-2026-0001/ })).toBeVisible();
    await expect(page.locator('text=Sifariş').first()).toBeVisible();

    // Click Print / PDF
    const printBtn = page.locator('button:has-text("Çap / PDF")');
    await expect(printBtn).toBeVisible();
    await printBtn.click();
    await expect(page.locator('text=SATINALMA SİFARİŞİ').first()).toBeVisible();
    await page.locator('button:has-text("Bağla")').click();

    // Click Email Send and verify unconfigured provider warning
    const emailBtn = page.locator('button:has-text("E-poçtla Göndər")');
    await expect(emailBtn).toBeVisible();
    await emailBtn.click();

    const sendConfirmBtn = page.locator('div[role="dialog"] button:has-text("Göndər")');
    await sendConfirmBtn.click();

    await expect(page.locator('text=Konfiqurasiya Olunmayıb').first()).toBeVisible();
    await expect(page.locator('text=SMTP/SendGrid').first()).toBeVisible();
    await page.locator('button:has-text("Ləğv et")').click();
  });

  test('5. Goods Receipt & Intake inspection', async ({ page }) => {
    await page.goto('/purchasing/goods-receipts');
    await expect(page.locator('text=Malların Mədaxili və Təhvil-Təslim')).toBeVisible();

    // Inspect existing receipt via "Baxış" button
    const viewBtn = page.locator('button:has-text("Baxış")').first();
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    await page.waitForURL(/\/purchasing\/goods-receipts\/gr-1/);

    // Verify goods receipt details
    await expect(page.locator('text=GR-2026-0001').first()).toBeVisible();
    await expect(page.locator('text=Təsdiqlənib (Anbara Mədaxil Olundu)').first()).toBeVisible();
    await expect(page.locator('text=Bu Aktla Qəbul').first()).toBeVisible();
    await expect(page.locator('text=Anbar Hərəkət Jurnalı Yeniləndi')).toBeVisible();
  });

  test('6. Three-Way Match panel inspection and dispute/hold actions', async ({ page }) => {
    await page.goto('/purchasing/invoices');
    await expect(page.locator('text=Təchizatçı Hesab-Fakturaları')).toBeVisible();

    // Switch to Three-Way Match Tab via "Yoxla" button on first invoice row
    const checkBtn = page.locator('button:has-text("Yoxla")').first();
    await expect(checkBtn).toBeVisible();
    await checkBtn.click();

    // Verify 3-way match comparison table
    await expect(page.locator('text=PO Sifariş Sayı')).toBeVisible();
    await expect(page.locator('text=GR Qəbul Sayı')).toBeVisible();
    await expect(page.locator('text=Faktura Sayı')).toBeVisible();
    await expect(page.locator('text=Say Fərqi')).toBeVisible();

    // Check match decision buttons
    await expect(page.locator('button:has-text("Saxla (Hold)")')).toBeVisible();
    await expect(page.locator('button:has-text("Mübahisə Aç (Dispute)")')).toBeVisible();
    await expect(page.locator('button:has-text("Ödənişə Təsdiqlə")')).toBeVisible();
  });

  test('7. Supplier Payments and Payables Aging view', async ({ page }) => {
    await page.goto('/purchasing/payments');
    await expect(page.getByRole('heading', { name: /Təchizatçı Ödənişləri/ })).toBeVisible();

    // Check Payables Aging tab
    const agingTab = page.locator('button:has-text("Kreditor Borclarının Yaşlanması")');
    await expect(agingTab).toBeVisible();
    await agingTab.click();

    // Verify 4 buckets are displayed
    await expect(page.locator('text=0–30 Gün').first()).toBeVisible();
    await expect(page.locator('text=31–60 Gün').first()).toBeVisible();
    await expect(page.locator('text=61–90 Gün').first()).toBeVisible();
    await expect(page.locator('text=90+ Gün').first()).toBeVisible();

    // Switch back to Payments tab and open New Payment modal
    await page.locator('button:has-text("Ödənişlər")').first().click();
    const newPaymentBtn = page.locator('button:has-text("Yeni Ödəniş Qeydi")');
    await expect(newPaymentBtn).toBeVisible();
    await newPaymentBtn.click();

    // Fill high amount (> 10,000 AZN) to trigger manager approval notice
    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.fill('15000');
    await expect(page.locator('text=rəhbərlik təsdiqinə göndəriləcək')).toBeVisible();

    // Close payment modal
    await page.locator('button:has-text("Ləğv et")').click();
  });
});
