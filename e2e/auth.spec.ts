import { test, expect } from '@playwright/test';

test.describe('Authentication & Session Flows', () => {
  test('login page loads with branding and Azerbaijani labels', async ({ page }) => {
    await page.goto('/auth/login');

    // Brand and Title
    await expect(page.locator('text=BRAND HOUSE')).toBeVisible();
    await expect(page.locator('text=Sistemə Giriş')).toBeVisible();
    await expect(page.locator('text=İstifadəçi adı və ya Email')).toBeVisible();
    await expect(page.locator('text=Şifrə')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Daxil Ol' })).toBeVisible();

    // 6 Demo Users Quick Buttons
    await expect(page.locator('text=Sınaq İstifadəçiləri (1-Klik Giriş)')).toBeVisible();
    await expect(page.locator('text=Sistem admini')).toBeVisible();
    await expect(page.locator('text=Kassir')).toBeVisible();
    await expect(page.locator('text=Anbardar')).toBeVisible();
    await expect(page.locator('text=Mühasib')).toBeVisible();
  });

  test('toggles password visibility', async ({ page }) => {
    await page.goto('/auth/login');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle button
    const toggleButton = page.getByRole('button', { name: 'Şifrəni göstər' });
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    const hideButton = page.getByRole('button', { name: 'Şifrəni gizlət' });
    await hideButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('shows error message on incorrect login credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.locator('#identifier').fill('nonexistent.user');
    await page.locator('#password').fill('WrongPassword!');
    await page.getByRole('button', { name: 'Daxil Ol' }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('[role="alert"]')).toContainText('İstifadəçi adı və ya şifrə yanlışdır');
  });

  test('logs in with 1-click demo button and redirects to home', async ({ page }) => {
    await page.goto('/auth/login');

    // Click Kassir demo quick-login button
    await page.locator('button:has-text("Kassir")').click();

    // Redirected to dashboard
    await expect(page).toHaveURL('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=Aytən Həsənova')).toBeVisible();
  });

  test('forgot password flow presents simulation link to reset page', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    await expect(page.locator('text=Şifrənin Sıfırlanması')).toBeVisible();
    await page.locator('#email').fill('admin@brendhouse.az');
    await page.getByRole('button', { name: 'Sıfırlama Linki Göndər' }).click();

    await expect(page.locator('text=Təsdiq E-poçtu Göndərildi!')).toBeVisible();
    await expect(page.locator('text=Yeni şifrə təyin etmə səhifəsinə keç')).toBeVisible();
  });
});

