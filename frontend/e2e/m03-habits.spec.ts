import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

/**
 * M03 Habits: spec scenarios 1–7 (+ 409 and error-state extras). Needs the API on
 * http://localhost:5080. The DB is shared, so every habit created here has a unique run prefix
 * and is deleted in afterAll; the empty state is checked with a stubbed empty list.
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M03-${Date.now().toString(36)}`;

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const TODAY = localDate(0);

const DAILY = `${RUN} Drink water`;
const WEEKLY = `${RUN} Long run`;

interface HabitDto {
  id: number;
  name: string;
  description: string | null;
  frequency: 'Daily' | 'Weekly';
  isActive: boolean;
  completedToday: boolean;
  completedForCurrentPeriod: boolean;
  currentStreak: number;
}

async function apiCreate(request: APIRequestContext, data: Record<string, unknown>): Promise<HabitDto> {
  const res = await request.post(`${API}/api/habits?today=${TODAY}`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

async function apiGet(request: APIRequestContext, id: number): Promise<HabitDto> {
  const res = await request.get(`${API}/api/habits/${id}?today=${TODAY}`);
  expect(res.status()).toBe(200);
  return res.json();
}

async function completionsToday(request: APIRequestContext, id: number): Promise<number> {
  const res = await request.get(`${API}/api/habits/${id}/completions?from=${TODAY}&to=${TODAY}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as unknown[]).length;
}

const cards = (page: Page) => page.getByTestId('habit-card');
const card = (page: Page, name: string): Locator =>
  cards(page).filter({ has: page.getByText(name, { exact: true }) });
const toggle = (page: Page, name: string) =>
  card(page, name).getByRole('checkbox', { name: `Mark ${name} as done today` });
const toast = (page: Page, text: string) => page.getByTestId('toast-host').getByText(text);
const idOf = async (page: Page, name: string) => Number(await card(page, name).getAttribute('data-habit-id'));

async function openHabits(page: Page) {
  await page.goto('/habits');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Habits');
}

test.describe.configure({ mode: 'serial' });

test.describe('M03 habits', () => {
  test.afterAll(async ({ request }) => {
    const res = await request.get(`${API}/api/habits`);
    if (!res.ok()) return;
    for (const h of (await res.json()) as HabitDto[]) {
      if (h.name.startsWith(RUN)) await request.delete(`${API}/api/habits/${h.id}`);
    }
  });

  test('1. page loads; an empty list shows the "Add Habit" empty state', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    // Real API: the list request succeeds with today's local date and no `active` filter.
    const list = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/habits');
    await openHabits(page);
    const res = await list;
    expect(res.status()).toBe(200);
    const url = new URL(res.url());
    expect(url.searchParams.get('today')).toBe(TODAY);
    expect(url.searchParams.has('active')).toBe(false);
    expect(errors).toEqual([]);

    // Fresh DB (stubbed empty list): empty state with an "Add Habit" call to action.
    await page.route(
      (u) => u.pathname === '/api/habits',
      (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback()),
    );
    await page.reload();
    const empty = page.getByTestId('empty-state');
    await expect(empty).toContainText('No habits yet');
    await empty.getByRole('button', { name: 'Add Habit' }).click();
    await expect(page.getByRole('dialog', { name: 'Add Habit' })).toBeVisible();
  });

  test('2. create daily and weekly habits (labels shown); an empty name shows a validation error', async ({ page }) => {
    await openHabits(page);
    await page.locator('.page-header').getByRole('button', { name: 'Add Habit' }).click();
    let dialog = page.getByRole('dialog', { name: 'Add Habit' });
    await expect(dialog).toBeVisible();

    // Empty and whitespace-only names are rejected on the client.
    await dialog.getByRole('button', { name: 'Add Habit' }).click();
    await expect(dialog.getByText('Name is required.')).toBeVisible();
    await dialog.getByLabel('Name').fill('   ');
    await dialog.getByRole('button', { name: 'Add Habit' }).click();
    await expect(dialog.getByText('Name is required.')).toBeVisible();
    await expect(dialog).toBeVisible();

    // Daily (the default frequency).
    await expect(dialog.getByLabel('Frequency')).toHaveValue('Daily');
    await dialog.getByLabel('Name').fill(DAILY);
    await dialog.getByLabel('Description').fill('8 glasses');
    await dialog.getByRole('button', { name: 'Add Habit' }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Habit created')).toBeVisible();
    const daily = card(page, DAILY);
    await expect(daily).toBeVisible();
    await expect(daily.getByTestId('habit-frequency')).toHaveText('Daily');
    await expect(daily).toContainText('8 glasses');
    await expect(daily.getByTestId('habit-streak')).toHaveText('Streak: 0 days');
    await expect(daily.getByTestId('habit-week')).toHaveCount(0);
    await expect(toggle(page, DAILY)).not.toBeChecked();

    // Weekly.
    await page.locator('.page-header').getByRole('button', { name: 'Add Habit' }).click();
    dialog = page.getByRole('dialog', { name: 'Add Habit' });
    await expect(dialog.getByLabel('Name')).toHaveValue('');
    await dialog.getByLabel('Name').fill(WEEKLY);
    await dialog.getByLabel('Frequency').selectOption('Weekly');
    await dialog.getByRole('button', { name: 'Add Habit' }).click();
    await expect(dialog).toBeHidden();
    const weekly = card(page, WEEKLY);
    await expect(weekly.getByTestId('habit-frequency')).toHaveText('Weekly');
    await expect(weekly.getByTestId('habit-week')).toHaveText('Not done this week');
    await expect(weekly.getByTestId('habit-streak')).toHaveText('Streak: 0 weeks');
  });

  test('3. toggle on → done with streak 1; toggle off → undone', async ({ page, request }) => {
    await openHabits(page);
    const box = toggle(page, DAILY);
    const daily = card(page, DAILY);
    const id = await idOf(page, DAILY);

    await box.check();
    await expect(toast(page, 'Marked as done today')).toBeVisible();
    await expect(box).toBeChecked();
    await expect(daily).toHaveClass(/habit--done/);
    await expect(daily.getByTestId('habit-streak')).toHaveText('Streak: 1 day');
    let api = await apiGet(request, id);
    expect([api.completedToday, api.currentStreak]).toEqual([true, 1]);

    await box.uncheck();
    await expect(toast(page, 'Marked as not done today')).toBeVisible();
    await expect(box).not.toBeChecked();
    await expect(daily).not.toHaveClass(/habit--done/);
    await expect(daily.getByTestId('habit-streak')).toHaveText('Streak: 0 days');
    api = await apiGet(request, id);
    expect([api.completedToday, api.currentStreak]).toEqual([false, 0]);
    expect(await completionsToday(request, id)).toBe(0);

    // Weekly: toggling today also marks the week done.
    await toggle(page, WEEKLY).check();
    const weekly = card(page, WEEKLY);
    await expect(weekly.getByTestId('habit-week')).toHaveText('Done this week');
    await expect(weekly.getByTestId('habit-streak')).toHaveText('Streak: 1 week');
    await toggle(page, WEEKLY).uncheck();
    await expect(weekly.getByTestId('habit-week')).toHaveText('Not done this week');
  });

  test('4. toggle on, reload → still done, recorded exactly once', async ({ page, request }) => {
    await openHabits(page);
    const id = await idOf(page, DAILY);
    await toggle(page, DAILY).check();
    await expect(toast(page, 'Marked as done today')).toBeVisible();

    await page.reload();
    await expect(toggle(page, DAILY)).toBeChecked();
    await expect(card(page, DAILY).getByTestId('habit-streak')).toHaveText('Streak: 1 day');
    expect(await completionsToday(request, id)).toBe(1);
    // The API refuses a second completion for the same day (BR-07).
    const dup = await request.post(`${API}/api/habits/${id}/completions?today=${TODAY}`);
    expect(dup.status()).toBe(409);
    expect(await completionsToday(request, id)).toBe(1);
  });

  test('5. edit a habit; changes are visible', async ({ page }) => {
    const renamed = `${DAILY} edited`;
    await openHabits(page);
    await card(page, DAILY).getByRole('button', { name: `Edit ${DAILY}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Habit' });
    await expect(dialog.getByLabel('Name')).toHaveValue(DAILY);
    await expect(dialog.getByLabel('Description')).toHaveValue('8 glasses');
    await expect(dialog.getByLabel('Frequency')).toHaveValue('Daily');

    await dialog.getByLabel('Name').fill(renamed);
    await dialog.getByLabel('Description').fill('10 glasses');
    await dialog.getByLabel('Frequency').selectOption('Weekly');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Habit updated')).toBeVisible();

    const c = card(page, renamed);
    await expect(c.getByTestId('habit-frequency')).toHaveText('Weekly');
    await expect(c).toContainText('10 glasses');
    await expect(c.getByTestId('habit-week')).toHaveText('Done this week'); // today's completion counts for the week
    await expect(card(page, DAILY)).toHaveCount(0);

    // Back to the original name/frequency for the following scenarios.
    await c.getByRole('button', { name: `Edit ${renamed}` }).click();
    await dialog.getByLabel('Name').fill(DAILY);
    await dialog.getByLabel('Frequency').selectOption('Daily');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(card(page, DAILY).getByTestId('habit-frequency')).toHaveText('Daily');
  });

  test('6. deactivate → dimmed with the toggle disabled; activate → restored', async ({ page, request }) => {
    await openHabits(page);
    const id = await idOf(page, WEEKLY);
    await card(page, WEEKLY).getByRole('button', { name: `Deactivate ${WEEKLY}` }).click();
    await expect(toast(page, 'Habit deactivated')).toBeVisible();

    const inactive = page.getByTestId('inactive-habits');
    const c = inactive.getByTestId('habit-card').filter({ hasText: WEEKLY });
    await expect(c).toBeVisible();
    await expect(c).toHaveClass(/habit--inactive/);
    await expect(c.getByTestId('habit-inactive')).toHaveText('Inactive');
    await expect(toggle(page, WEEKLY)).toBeDisabled();
    expect(Number(await c.locator('.habit__main').evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
    expect((await apiGet(request, id)).isActive).toBe(false);

    await page.reload(); // inactive habits come back in the default list
    await expect(page.getByTestId('inactive-habits').getByText(WEEKLY, { exact: true })).toBeVisible();
    await expect(toggle(page, WEEKLY)).toBeDisabled();

    await card(page, WEEKLY).getByRole('button', { name: `Activate ${WEEKLY}` }).click();
    await expect(toast(page, 'Habit activated')).toBeVisible();
    await expect(card(page, WEEKLY)).not.toHaveClass(/habit--inactive/);
    await expect(toggle(page, WEEKLY)).toBeEnabled();
    await expect(page.getByTestId('inactive-habits').getByText(WEEKLY, { exact: true })).toHaveCount(0);
    await expect(card(page, WEEKLY).getByRole('button', { name: `Deactivate ${WEEKLY}` })).toBeVisible();
    expect((await apiGet(request, id)).isActive).toBe(true);
  });

  test('7. remove with confirmation → gone', async ({ page, request }) => {
    await openHabits(page);
    const id = await idOf(page, WEEKLY);

    // Cancel keeps it.
    await card(page, WEEKLY).getByRole('button', { name: `Remove ${WEEKLY}` }).click();
    let confirm = page.getByRole('dialog', { name: 'Remove habit?' });
    await expect(confirm).toContainText(WEEKLY);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(card(page, WEEKLY)).toBeVisible();

    await card(page, WEEKLY).getByRole('button', { name: `Remove ${WEEKLY}` }).click();
    confirm = page.getByRole('dialog', { name: 'Remove habit?' });
    await confirm.getByRole('button', { name: 'Remove' }).click();
    await expect(toast(page, 'Habit removed')).toBeVisible();
    await expect(card(page, WEEKLY)).toHaveCount(0);
    expect((await request.get(`${API}/api/habits/${id}`)).status()).toBe(404);
    await page.reload();
    await expect(card(page, DAILY)).toBeVisible();
    await expect(card(page, WEEKLY)).toHaveCount(0);
  });

  test('extra: toggle on when already done elsewhere (409) shows done without an error', async ({ page, request }) => {
    const name = `${RUN} Stale toggle`;
    const created = await apiCreate(request, { name, frequency: 'Daily' });
    await openHabits(page);
    await expect(toggle(page, name)).not.toBeChecked();

    // Complete it behind the page's back, then toggle on in the stale UI.
    expect((await request.post(`${API}/api/habits/${created.id}/completions?today=${TODAY}`)).status()).toBe(201);
    const conflict = page.waitForResponse(
      (r) => r.url().includes(`/api/habits/${created.id}/completions`) && r.request().method() === 'POST',
    );
    await toggle(page, name).check();
    expect((await conflict).status()).toBe(409);
    await expect(toast(page, 'Marked as done today')).toBeVisible();
    await expect(toggle(page, name)).toBeChecked();
    await expect(card(page, name).getByTestId('habit-streak')).toHaveText('Streak: 1 day');
    await expect(page.getByTestId('toast-host').locator('.toast--error')).toHaveCount(0);
    expect(await completionsToday(request, created.id)).toBe(1);
  });

  test('extra: list error shows the error state and Retry recovers', async ({ page }) => {
    let fail = true;
    await page.route(
      (u) => u.pathname === '/api/habits',
      (route) =>
        fail && route.request().method() === 'GET'
          ? route.fulfill({ status: 500, json: { title: 'Server exploded', status: 500 } })
          : route.fallback(),
    );
    await page.goto('/habits');
    const error = page.getByTestId('error-state');
    await expect(error).toContainText("Couldn't load habits");
    await expect(error).toContainText('Server exploded');
    fail = false;
    await error.getByRole('button', { name: 'Try again' }).click();
    await expect(error).toBeHidden();
    await expect(page.getByTestId('habits-summary')).toBeVisible();
  });
});
