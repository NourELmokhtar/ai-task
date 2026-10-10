import { APIRequestContext, expect, Page, test } from '@playwright/test';

/**
 * M05 Settings: spec scenarios 1–5 (+ backend-down fallback extra). Needs the API on
 * http://localhost:5080. Settings are ONE shared row, so every test restores the defaults
 * (no name, notifications on, Dashboard) afterwards; other specs (m01: `/` → `/dashboard`) rely on them.
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M05-${Date.now().toString(36)}`;
const DEFAULTS = { displayName: null, planStartNotificationsEnabled: true, defaultView: 'Dashboard' };

interface Settings {
  displayName: string | null;
  planStartNotificationsEnabled: boolean;
  defaultView: string;
  updatedAt: string;
}

async function apiGet(request: APIRequestContext): Promise<Settings> {
  const res = await request.get(`${API}/api/settings`);
  expect(res.status()).toBe(200);
  return res.json();
}

async function apiPut(request: APIRequestContext, body: object): Promise<void> {
  const res = await request.put(`${API}/api/settings`, { data: body });
  expect(res.status()).toBe(200);
}

const nameInput = (page: Page) => page.getByLabel('Display name');
const notifications = (page: Page) => page.getByLabel('Plan start notifications');
const defaultView = (page: Page) => page.getByLabel('Default view');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save settings' });
const toast = (page: Page, text: string) => page.getByTestId('toast-host').getByText(text);
const isPut = (r: { url(): string; request(): { method(): string } }) =>
  new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'PUT';

async function openSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(saveButton(page)).toBeVisible();
}

async function save(page: Page) {
  const put = page.waitForResponse(isPut);
  await saveButton(page).click();
  expect((await put).status()).toBe(200);
  await expect(toast(page, 'Settings saved')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('M05 settings', () => {
  test.beforeAll(async ({ request }) => {
    await apiPut(request, DEFAULTS);
  });

  test.afterEach(async ({ request }) => {
    await apiPut(request, DEFAULTS);
  });

  test.afterAll(async ({ request }) => {
    await apiPut(request, DEFAULTS);
    const s = await apiGet(request);
    expect(s).toEqual(expect.objectContaining(DEFAULTS));
  });

  test('1. page loads showing the current values', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await apiPut(request, { displayName: `${RUN} Seeded`, planStartNotificationsEnabled: false, defaultView: 'Habits' });

    const get = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'GET',
    );
    await openSettings(page);
    expect((await get).status()).toBe(200);

    await expect(page.getByRole('heading', { level: 2, name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Preferences' })).toBeVisible();
    await expect(nameInput(page)).toHaveValue(`${RUN} Seeded`);
    await expect(notifications(page)).not.toBeChecked();
    await expect(defaultView(page)).toHaveValue('Habits');
    await expect(defaultView(page).locator('option')).toHaveText([
      'Dashboard',
      'Tasks',
      'Habits',
      'Learning Resources',
      'Todo Plans',
      'Settings',
    ]);
    expect(errors).toEqual([]);
  });

  test('2. change the display name → Save → toast; persists after reload', async ({ page, request }) => {
    await openSettings(page);
    await expect(nameInput(page)).toHaveValue('');
    const name = `${RUN} Nour`;
    await nameInput(page).fill(`  ${name}  `);

    const put = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/settings' && r.method() === 'PUT');
    await save(page);
    expect((await put).postDataJSON()).toEqual({
      displayName: name,
      planStartNotificationsEnabled: true,
      defaultView: 'Dashboard',
    });
    await expect(nameInput(page)).toHaveValue(name);

    await page.reload();
    await expect(nameInput(page)).toHaveValue(name);
    expect((await apiGet(request)).displayName).toBe(name);

    // Clearing the name saves null.
    await nameInput(page).fill('');
    await save(page);
    await page.reload();
    await expect(nameInput(page)).toHaveValue('');
    expect((await apiGet(request)).displayName).toBeNull();
  });

  test('3. notifications toggle persists after reload', async ({ page, request }) => {
    await openSettings(page);
    await expect(notifications(page)).toBeChecked();

    await notifications(page).uncheck();
    await save(page);
    await page.reload();
    await expect(notifications(page)).not.toBeChecked();
    expect((await apiGet(request)).planStartNotificationsEnabled).toBe(false);

    await notifications(page).check();
    await save(page);
    await page.reload();
    await expect(notifications(page)).toBeChecked();
    expect((await apiGet(request)).planStartNotificationsEnabled).toBe(true);
  });

  test('4. default view Tasks → / lands on Tasks; reset → / lands on Dashboard', async ({ page, request }) => {
    await openSettings(page);
    await defaultView(page).selectOption({ label: 'Tasks' });
    await save(page);
    expect((await apiGet(request)).defaultView).toBe('Tasks');

    await page.goto('/');
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');

    // Other routes are unaffected.
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');

    await openSettings(page);
    await expect(defaultView(page)).toHaveValue('Tasks');
    await defaultView(page).selectOption({ label: 'Dashboard' });
    await save(page);

    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  });

  test('4b. the saved default view applies in-app without a reload', async ({ page }) => {
    await openSettings(page);
    await defaultView(page).selectOption({ label: 'Learning Resources' });
    await save(page);
    // Client-side navigation to `/` uses the refreshed app-wide store.
    await page.evaluate(() => {
      history.pushState({}, '', '/');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/learning$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learning Resources');
  });

  test('5. a 101-character name shows a validation error and is not saved', async ({ page, request }) => {
    const before = await apiGet(request);
    let puts = 0;
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/settings' && r.method() === 'PUT') puts++;
    });
    await openSettings(page);
    await nameInput(page).fill('x'.repeat(101));
    const fieldError = page.locator('#settings-display-name-errors');
    await expect(fieldError).toHaveText('Display name must be at most 100 characters.');
    await expect(nameInput(page)).toHaveAttribute('aria-describedby', /settings-display-name-errors/);

    await saveButton(page).click();
    await expect(page.getByTestId('form-error')).toContainText('Please fix the highlighted fields.');
    await expect(toast(page, 'Settings saved')).toHaveCount(0);
    expect(puts).toBe(0);
    expect((await apiGet(request)).displayName).toBe(before.displayName);

    // Back to 100 characters: the error clears and saving works.
    await nameInput(page).fill('x'.repeat(100));
    await expect(fieldError).toHaveCount(0);
    await save(page);
    expect((await apiGet(request)).displayName).toBe('x'.repeat(100));
  });

  test('extra: settings unavailable → / falls back to Dashboard; page shows an error state', async ({ page }) => {
    await page.route('**/api/settings', (route) => route.abort('connectionrefused'));
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByTestId('error-state')).toContainText("Couldn't load settings");

    await page.unroute('**/api/settings');
    await page.getByTestId('error-state').getByRole('button', { name: 'Try again' }).click();
    await expect(saveButton(page)).toBeVisible();
    await expect(defaultView(page)).toHaveValue('Dashboard');
  });
});
