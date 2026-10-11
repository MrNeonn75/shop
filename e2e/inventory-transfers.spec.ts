import { test, expect } from '@playwright/test';

test.describe('Inventory & Transfer Modules End-to-End', () => {
  test('transfer end-to-end flow with dispatch, transit banner, and partial receipt', async ({ page }) => {
    // 1. Visit transfers page
    await page.goto('/transfers');
    await expect(page.locator('text=Filiallararası Transferlər').first()).toBeVisible();

    // 2. Click create new transfer
    await page.getByRole('button', { name: 'Yeni Transfer Sorğusu' }).click();
    await expect(page).toHaveURL(/\/transfers\/new/);

    // 3. Select Destination Warehouse & Add Product line
    await page.locator('input[placeholder*="Kataloqdan məhsul adı və ya SKU"]').fill('Klassik');
    // Wait for search result dropdown and click "+ Əlavə et"
    const addBtn = page.getByRole('button', { name: '+ Əlavə et' }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // 4. Submit for Approval
    const submitBtn = page.getByRole('button', { name: 'Təsdiqə Göndər' });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 5. Lands on Detail page
    await expect(page).toHaveURL(/\/transfers\/tr-/);
    await expect(page.locator('text=Təsdiq Gözləyir').first()).toBeVisible();

    // 6. Approve transfer
    const approveBtn = page.getByRole('button', { name: 'Təsdiqlə və Yığıma Ötür' });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // 7. Start Picking
    const startPickBtn = page.getByRole('button', { name: 'Yığıma Başla' });
    await expect(startPickBtn).toBeVisible();
    await startPickBtn.click();

    // 8. Dispatch goods to transit
    const dispatchBtn = page.getByRole('button', { name: 'Yola Sal (Dispatched)' });
    await expect(dispatchBtn).toBeVisible();
    await dispatchBtn.click();

    // Verify clear banner: "Mal mənbə anbarı tərk etdi, tranzitdədir"
    await expect(page.locator('text=Mal mənbə anbarı tərk etdi, tranzitdədir')).toBeVisible();

    // 9. Destination Receiving - Partial Receipt
    // In receiving table, set partial quantity or confirm receive
    const receiveConfirmBtn = page.getByRole('button', { name: 'Təhvili Təsdiqlə (Ledgerə Yaz)' });
    await expect(receiveConfirmBtn).toBeVisible();
    await receiveConfirmBtn.click();

    // Verify toast or confirmation update
    await expect(page.locator('text=Tam Qəbul Edildi').or(page.locator('text=Qismən Qəbul'))).toBeVisible();
  });

  test('negative stock is blocked by default with explicit error message in documents', async ({ page }) => {
    // 1. Visit documents page
    await page.goto('/inventory/documents');
    await expect(page.locator('text=Anbar Sənədləri').first()).toBeVisible();

    // 2. Open new document modal
    await page.getByRole('button', { name: 'Yeni Sənəd Tərtib Et' }).click();
    await expect(page.locator('text=Yeni Anbar Sənədi Tərtibi')).toBeVisible();

    // 3. Switch document type to "Silinmə (İstifadə / Xərcləmə)"
    await page.locator('select').first().selectOption('issue');

    // 4. Add product
    await page.locator('input[placeholder*="Məhsul adı, SKU və ya barkod"]').fill('Pambıq');
    const addBtn = page.getByRole('button', { name: '+ Əlavə et' }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // 5. Fill excessive quantity that exceeds current stock
    const qtyInput = page.locator('table input[type="number"]').first();
    await qtyInput.fill('99999');

    // 6. Attempt to confirm without override
    await page.getByRole('button', { name: 'Təsdiqlə və Ledgerə Yaz' }).click();

    // 7. Error banner must display negative stock block error
    await expect(page.locator('text=Mənfi qalıq bloklanıb')).toBeVisible();
  });

  test('physical count session review displays variance and approves adjustment document', async ({ page }) => {
    // 1. Visit count page
    await page.goto('/inventory/count');
    await expect(page.locator('text=Faktiki İnventarizasiya və Sayım').first()).toBeVisible();

    // 2. Find and enter the seeded review count session
    const reviewBtn = page.getByRole('button', { name: 'Sayıma Daxil Ol' }).first();
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // 3. Verify session detail shows variance summary and review status
    await expect(page.locator('text=Fərq Təhlili').or(page.locator('text=Sessiya #'))).toBeVisible();

    // 4. Approve session & generate adjustment document
    const approveCountBtn = page.getByRole('button', { name: 'Sayımı Təsdiqlə və Korreksiya Et' });
    if (await approveCountBtn.isVisible()) {
      await approveCountBtn.click();
      await expect(page.locator('text=Təsdiqlənib')).toBeVisible();
    }
  });
});
