import { test, expect } from '@playwright/test';

test.describe('Dashboard & Role-Based Variants E2E Tests', () => {
  test('Executive Dashboard loads for Admin with all KPIs and widgets', async ({ page }) => {
    // 1. Log in as System Admin
    await page.goto('/auth/login');
    await page.locator('button:has-text("Sistem admini")').click();
    await expect(page).toHaveURL('/');

    // 2. Check Dashboard Page Elements
    await expect(page.locator('h1')).toContainText('İdarəetmə Paneli');
    await expect(page.locator('text=DEMO Rejimi')).toBeVisible();

    // 3. Verify KPI Cards are rendered
    await expect(page.locator('[data-testid="kpi-card-totalSales"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-grossProfit"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-netProfit"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-inventoryValue"]')).toBeVisible();

    // 4. Check formula tooltip on Total Sales KPI
    const tooltipTrigger = page.locator('[data-testid="kpi-tooltip-trigger-totalSales"]');
    await expect(tooltipTrigger).toBeVisible();
    await tooltipTrigger.hover();
    await expect(page.locator('text=Brutto Satış Məbləği − Qaytarılan Çeklərin Məbləği')).toBeVisible();

    // 5. Verify Core Widgets rendered
    await expect(page.locator('[data-testid="widget-sales-trend"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-sales-by-branch"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-sales-by-section-type"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-top-products"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-payment-methods"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-low-stock-alerts"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-slow-moving-stock"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-expense-trend"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-open-orders-transfers"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-cash-registers-today"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-recent-activities"]')).toBeVisible();
  });

  test('Preset buttons update URL query params and widget headings', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('button:has-text("Sistem admini")').click();
    await expect(page).toHaveURL('/');

    // Click "Bu gün" preset button
    const todayBtn = page.locator('[data-testid="preset-today"]');
    await expect(todayBtn).toBeVisible();
    await todayBtn.click();

    // URL updates with preset=today
    await expect(page).toHaveURL(/preset=today/);

    // Sales trend changes to hourly heading
    await expect(page.locator('text=Günlük Saatlıq Satış Dinamikası')).toBeVisible();

    // Click "7 gün" preset button
    const weekBtn = page.locator('[data-testid="preset-last_7_days"]');
    await weekBtn.click();
    await expect(page).toHaveURL(/preset=last_7_days/);
    await expect(page.locator('text=Dövri Satış Dinamikası')).toBeVisible();
  });

  test('Cashier role sees Shift Summary only (restricted KPIs and widgets)', async ({ page }) => {
    await page.goto('/auth/login');
    // Log in as Kassir
    await page.locator('button:has-text("Kassir")').click();
    await expect(page).toHaveURL('/');

    // Cashier subtitle
    await expect(page.locator('text=Kassa növbəsi, cari satışlar və kassa qalıqlarının operativ icmalı.')).toBeVisible();

    // Cashier sees Sales and AOV
    await expect(page.locator('[data-testid="kpi-card-totalSales"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-averageOrderValue"]')).toBeVisible();

    // Cashier does NOT see Gross Profit or Net Profit or Inventory Turnover
    await expect(page.locator('[data-testid="kpi-card-grossProfit"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="kpi-card-netProfit"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="kpi-card-inventoryTurnover"]')).toHaveCount(0);

    // Cashier sees registers and payments
    await expect(page.locator('[data-testid="widget-sales-trend"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-cash-registers-today"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-payment-methods"]')).toBeVisible();

    // Cashier does NOT see Expense Trend
    await expect(page.locator('[data-testid="widget-expense-trend"]')).toHaveCount(0);
  });

  test('Warehouse Keeper role sees Stock & Logistics view', async ({ page }) => {
    await page.goto('/auth/login');
    // Log in as Anbardar
    await page.locator('button:has-text("Anbardar")').click();
    await expect(page).toHaveURL('/');

    // Anbar description
    await expect(page.locator('text=Anbar ehtiyatları, dövriyyə sürəti, yolda olan transferlər və kritik stoklar.')).toBeVisible();

    // Stock KPIs visible
    await expect(page.locator('[data-testid="kpi-card-inventoryValue"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-inventoryTurnover"]')).toBeVisible();

    // Financial KPIs hidden
    await expect(page.locator('[data-testid="kpi-card-grossProfit"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="kpi-card-supplierLiabilities"]')).toHaveCount(0);

    // Stock Widgets visible
    await expect(page.locator('[data-testid="widget-low-stock-alerts"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-slow-moving-stock"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-open-orders-transfers"]')).toBeVisible();

    // Register / Cash discrepancies hidden for warehouse keeper
    await expect(page.locator('[data-testid="widget-cash-registers-today"]')).toHaveCount(0);
  });

  test('Accountant role sees Financial Intelligence view', async ({ page }) => {
    await page.goto('/auth/login');
    // Log in as Mühasib
    await page.locator('button:has-text("Mühasib")').click();
    await expect(page).toHaveURL('/');

    // Finance description
    await expect(page.locator('text=Maliyyə balansı, gəlirlər, maya dəyəri (COGS), xərclər və təchizatçı öhdəlikləri.')).toBeVisible();

    // Financial KPIs visible
    await expect(page.locator('[data-testid="kpi-card-totalSales"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-grossProfit"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-netProfit"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-card-supplierLiabilities"]')).toBeVisible();

    // Finance Widgets visible
    await expect(page.locator('[data-testid="widget-expense-trend"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-cash-registers-today"]')).toBeVisible();
    await expect(page.locator('[data-testid="widget-open-orders-transfers"]')).toBeVisible();
  });
});

