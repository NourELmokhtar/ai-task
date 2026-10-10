import { expect, Page, test } from '@playwright/test';

/**
 * M01 Foundation: app shell, navigation, routing, connectivity banner.
 * Needs the API on http://localhost:5080 (except the "backend actually stopped" check, which runs
 * only with QF_E2E_BACKEND_DOWN=1 while the API is stopped).
 */

const NAV = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Habits', path: '/habits' },
  { label: 'Learning Resources', path: '/learning' },
  { label: 'Todo Plans', path: '/plans' },
  { label: 'Settings', path: '/settings' },
];

const backendDown = process.env['QF_E2E_BACKEND_DOWN'] === '1';

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const banner = (page: Page) => page.getByTestId('connectivity-banner');

test.describe('M01 foundation (backend running)', () => {
  test.skip(backendDown, 'requires the API');

  test('app loads with no console errors on any page', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const health = page.waitForResponse((r) => r.url().endsWith('/api/health'));
    await page.goto('/');
    expect((await health).status()).toBe(200);
    for (const item of NAV) {
      await nav(page).getByRole('link', { name: item.label, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
    }
    expect(errors).toEqual([]);
  });

  test('navigation shows all six entries in PRD order', async ({ page }) => {
    await page.goto('/dashboard');
    const links = nav(page).getByRole('link');
    await expect(links).toHaveText(NAV.map((n) => n.label));
  });

  test('clicking each entry navigates and highlights only that entry', async ({ page }) => {
    await page.goto('/dashboard');
    for (const item of NAV) {
      const link = nav(page).getByRole('link', { name: item.label, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${item.path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(link).toHaveClass(/nav__link--active/);
      await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
    }
  });

  test('direct URL load works for each route', async ({ page }) => {
    for (const item of NAV) {
      await page.goto(item.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
      await expect(nav(page).getByRole('link', { name: item.label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page).toHaveTitle(`${item.label} · QuickFlow`);
    }
  });

  test('/ lands on Dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  });

  test('unknown URL shows the not-found page', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await page.getByRole('link', { name: 'Go to Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('no connectivity banner while the backend is healthy', async ({ page }) => {
    const health = page.waitForResponse((r) => r.url().endsWith('/api/health'));
    await page.goto('/dashboard');
    const res = await health;
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('Healthy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
    await expect(banner(page)).toHaveCount(0);
  });

  test('banner appears when the health check fails and clears on retry', async ({ page }) => {
    await page.route('**/api/health', (route) => route.abort('connectionrefused'));
    await page.goto('/tasks');
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText("Can't reach the QuickFlow server");
    // Non-blocking: navigation still works with the banner shown.
    await nav(page).getByRole('link', { name: 'Habits', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Habits');
    await expect(banner(page)).toBeVisible();

    await page.unroute('**/api/health');
    await banner(page).getByRole('button', { name: 'Retry' }).click();
    await expect(banner(page)).toHaveCount(0);
  });

  test('layout is usable on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto('/dashboard');
    const link = nav(page).getByRole('link', { name: 'Todo Plans', exact: true });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo Plans');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('M01 foundation (backend actually stopped)', () => {
  test.skip(!backendDown, 'set QF_E2E_BACKEND_DOWN=1 with the API stopped');

  test('banner appears when the API is not running', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(banner(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  });
});
