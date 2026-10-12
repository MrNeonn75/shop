import { test, expect } from '@playwright/test';

test.describe('POS Terminal Module E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Log in as Cashier with redirect to full-screen POS terminal
    await page.goto('/auth/login?redirect=/pos');
    const cashierBtn = page.locator('button:has-text("Kassir")');
    await cashierBtn.click();
    await page.waitForURL('/pos');
    await expect(page.locator('header:has-text("POS")')).toBeVisible();

    // Ensure register has an open shift (re-opens if a previous test closed it)
    const openShiftBtn = page.locator('button:has-text("Növbəni Aç")');
    if (await openShiftBtn.isVisible()) {
      await openShiftBtn.click();
      await page.locator('button:has-text("Sayımı Təsdiq Et və Növbəni Aç")').click();
    }
  });

  test('1. Scan / Add Product and Pay Cash (Happy Path Receipt)', async ({ page }) => {
    // Check shift header visibility
    await expect(page.locator('header')).toContainText('Gənclik Mall Filialı');
    await expect(page.locator('header')).toContainText('Aytən Həsənova');

    // Add a product by clicking "+ Əlavə et" on the catalog panel
    const addProductBtn = page.locator('button:has-text("+ Əlavə et")').first();
    await addProductBtn.click();

    // Verify item is added to the cart on right pane
    await expect(page.locator('text=Ara Cəmi')).toBeVisible();
    await expect(page.locator('text=Yekun Məbləğ')).toBeVisible();

    // Click big Pay (F10) button
    const payBtn = page.locator('button:has-text("ÖDƏNİŞ (F10)")');
    await expect(payBtn).toBeEnabled();
    await payBtn.click();

    // Payment modal appears
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('text=Satışın Ödənişi')).toBeVisible();

    // Choose exact quick cash or add tender
    const exactCashBtn = page.locator('button:has-text("Dəqiq Məbləğ")');
    if (await exactCashBtn.isVisible()) {
      await exactCashBtn.click();
    }

    const addTenderBtn = page.locator('button:has-text("Ödəniş Əlavə Et")');
    if (await addTenderBtn.isVisible()) {
      await addTenderBtn.click();
    }

    // Finalize sale
    const finalizeBtn = page.locator('button:has-text("Satışı Tamamla və Çek Çap Et")');
    await expect(finalizeBtn).toBeEnabled();
    await finalizeBtn.click();

    // Thermal receipt dialog shown with receipt number
    await expect(page.locator('text=Satış Uğurla Tamamlandı')).toBeVisible();
    await expect(page.locator('text=FİSKAL SATIŞ ÇEKİ')).toBeVisible();

    // Click "Növbəti Satış" to return to a fresh cart
    await page.locator('button:has-text("Növbəti Satış")').click();
    await expect(page.locator('text=Səbət boşdur')).toBeVisible();
  });

  test('2. Split Payment Flow (Cash + External Card Tender)', async ({ page }) => {
    // Add 2 products
    const addProductButtons = page.locator('button:has-text("+ Əlavə et")');
    await addProductButtons.nth(0).click();
    await addProductButtons.nth(1).click();

    // Open Payment Modal
    await page.locator('button:has-text("ÖDƏNİŞ (F10)")').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter partial cash amount (e.g. 50 AZN)
    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.fill('50');

    // Add cash tender
    await page.locator('button:has-text("Ödəniş Əlavə Et")').click();

    // Verify 50.00 AZN added in tenders list
    await expect(page.locator('text=Daxil Edilən Ödənişlər:')).toBeVisible();
    await expect(page.getByText('Nağd Pul').first()).toBeVisible();

    // Switch tender type to Card
    await page.locator('button:has-text("Bank Kartı")').first().click();

    // Enter manual card approval reference / RRN
    const rrnInput = page.locator('input[placeholder*="RRN"]');
    if (await rrnInput.isVisible()) {
      await rrnInput.fill('RRN-776655');
    }

    // Add remaining card tender
    await page.locator('button:has-text("Ödəniş Əlavə Et")').click();

    // Finalize split payment
    const finalizeBtn = page.locator('button:has-text("Satışı Tamamla və Çek Çap Et")');
    await expect(finalizeBtn).toBeEnabled();
    await finalizeBtn.click();

    // Verify thermal receipt displays both tenders
    await expect(page.locator('text=FİSKAL SATIŞ ÇEKİ')).toBeVisible();
    await expect(page.locator('#thermal-receipt')).toContainText('Nağd Pul');
    await expect(page.locator('#thermal-receipt')).toContainText('Bank Kartı');
  });

  test('3. Discount Exceeding Cashier Limit Requires Manager PIN Approval', async ({ page }) => {
    // Add product
    await page.locator('button:has-text("+ Əlavə et")').first().click();

    // Open Discount Modal (F4)
    await page.locator('button:has-text("Endirim (F4)")').click();
    await expect(page.locator('text=Xüsusi Endirim Tətbiqi')).toBeVisible();

    // Enter 20% discount (exceeds cashier limit of 5%)
    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('20');

    // Verify Manager Approval notice is displayed
    await expect(page.locator('text=Menecer təsdiqi tələb olunur')).toBeVisible();

    // Attempt apply without PIN
    await page.locator('button:has-text("Tətbiq Et")').click();
    await expect(page.locator('text=Menecer PIN kodu yanlışdır')).toBeVisible();

    // Enter valid Manager PIN (9999)
    const pinInput = page.locator('input[placeholder*="PIN"]');
    await pinInput.fill('9999');

    // Apply discount successfully
    await page.locator('button:has-text("Tətbiq Et")').click();

    // Verify discount is visible in the cart summary
    await expect(page.locator('text=Xüsusi Çek Endirimi (20%)')).toBeVisible();
  });

  test('4. Suspend (Park) and Recall Cart Workflow', async ({ page }) => {
    // Add product to cart
    await page.locator('button:has-text("+ Əlavə et")').first().click();
    await expect(page.locator('text=Ara Cəmi')).toBeVisible();

    // Click Suspend (F8)
    await page.locator('button:has-text("Gözlət (F8)")').click();
    await expect(page.locator('text=Səbəti Gözləməyə Al (F8)')).toBeVisible();

    // Fill label and submit
    const labelInput = page.locator('input[placeholder*="Qara köynəkli"]');
    await labelInput.fill('Test Parked Cart #99');
    await page.locator('button:has-text("Gözlət və Təmizlə")').click();

    // Cart is now cleared for next customer
    await expect(page.locator('text=Səbət boşdur')).toBeVisible();

    // Click Recall (F9)
    await page.locator('button:has-text("Geri Çağır (F9)")').click();
    await expect(page.locator('text=Gözləmədəki Səbətlər (F9)')).toBeVisible();
    await expect(page.locator('text=Test Parked Cart #99')).toBeVisible();

    // Click "Bərpa Et" to recall the parked cart
    await page.locator('button:has-text("Bərpa Et")').first().click();

    // Verify cart is restored with items intact
    await expect(page.locator('text=Ara Cəmi')).toBeVisible();
  });

  test('5. Close Shift with Cash Variance Requiring Explanation', async ({ page }) => {
    // Click "Növbəni Bağla (Z)" in header
    await page.locator('button:has-text("Növbəni Bağla (Z)")').click();
    await expect(page.locator('text=Növbəni Bağla (Z-Hesabat)')).toBeVisible();

    // Without entering denominations, counted cash will be 0 vs expected > 0 (variance > ±5.00 AZN)
    await expect(page.locator('text=Kassa Fərqinin Səbəbi')).toBeVisible();

    // Attempting to close without explanation fails
    await page.locator('button:has-text("Z-Hesabatı Çap Et və Növbəni Bağla")').click();
    await expect(page.locator('text=Fərqin səbəbi mütləq qeyd edilməlidir')).toBeVisible();

    // Enter variance explanation
    const reasonTextarea = page.locator('textarea[placeholder*="Kassa fərqinin səbəbini"]');
    await reasonTextarea.fill('İnkassasiya öncəsi sınaq fərqi izahı');

    // Confirm and close shift
    await page.locator('button:has-text("Z-Hesabatı Çap Et və Növbəni Bağla")').click();

    // Z-Report is generated
    await expect(page.locator('text=GÜNLÜK YEKUN Z-HESABAT')).toBeVisible();
    await expect(page.locator('text=NÖVBƏ RƏSMİ BAĞLANMIŞDIR')).toBeVisible();

    // Finish dialog
    await page.locator('button:has-text("Tamamla")').click();

    // Register is now locked
    await expect(page.locator('text=Kassa Bağlıdır')).toBeVisible();
  });

  test('6. Double-Click on Finalize Sale Does Not Create Two Sales (Idempotency Protection)', async ({
    page,
  }) => {
    // Add product
    await page.locator('button:has-text("+ Əlavə et")').first().click();

    // Open Payment Modal
    await page.locator('button:has-text("ÖDƏNİŞ (F10)")').click();

    // Add exact cash
    await page.locator('button:has-text("Dəqiq Məbləğ")').click();
    await page.locator('button:has-text("Ödəniş Əlavə Et")').click();

    const finalizeBtn = page.locator('button:has-text("Satışı Tamamla və Çek Çap Et")');
    await expect(finalizeBtn).toBeEnabled();

    // Double-click rapidly
    await Promise.all([
      finalizeBtn.click({ clickCount: 2 }),
    ]);

    // Single receipt shown without duplicate error
    await expect(page.locator('text=FİSKAL SATIŞ ÇEKİ')).toBeVisible();
  });
});
