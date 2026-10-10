import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

/**
 * M07 Plan Tracking: spec scenarios 1–7. Needs the API on http://localhost:5080.
 * Plans really start on the server (real waiting, no clock mocking): every start is scheduled
 * 25–80 s ahead and the waits allow ≥ 2 minutes. The DB is shared: everything carries the run prefix
 * and is deleted in afterAll; the single settings row is restored to the defaults.
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M07-${Date.now().toString(36)}`;
const DEFAULTS = { displayName: null, planStartNotificationsEnabled: true, defaultView: 'Dashboard' };
const CARD_TITLES = [`${RUN} card 1`, `${RUN} card 2`, `${RUN} card 3`];
const S1 = `${RUN} Starts soon`;
const S4A = `${RUN} Past A`;
const S4B = `${RUN} Past B`;
const S5 = `${RUN} Active`;
const S6 = `${RUN} Silent start`;
const S7 = `${RUN} Start elsewhere`;
const MIN = 60_000;

interface PlanItem {
  id: number;
  isDone: boolean;
}
interface Plan {
  id: number;
  title: string;
  status: 'NotStarted' | 'InProgress' | 'Completed';
  restTimeSeconds: number | null;
  serverNow: string;
  startDateTime: string;
  progressPercent: number;
  items: PlanItem[];
}

const cardIds: number[] = [];

async function createPlan(
  request: APIRequestContext,
  title: string,
  startMs: number,
  endMs: number,
  cards: number[] = [cardIds[0]],
  priorityOrder = 1,
): Promise<Plan> {
  const res = await request.post(`${API}/api/plans`, {
    data: {
      title,
      estimatedDurationMinutes: 30,
      startDateTime: new Date(startMs).toISOString(),
      endDateTime: new Date(endMs).toISOString(),
      priorityOrder,
      items: cards.map((sourceId) => ({ sourceType: 'LearningResource', sourceId })),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

async function getPlan(request: APIRequestContext, id: number): Promise<Plan> {
  const res = await request.get(`${API}/api/plans/${id}`);
  expect(res.status()).toBe(200);
  return res.json();
}

async function putSettings(request: APIRequestContext, body: object): Promise<void> {
  const res = await request.put(`${API}/api/settings`, { data: body });
  expect(res.status()).toBe(200);
}

const entry = (page: Page, title: string): Locator =>
  page.getByTestId('plan-entry').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const inGroup = (page: Page, group: 'plans-active' | 'plans-upcoming' | 'plans-completed', title: string): Locator =>
  page.getByTestId(group).getByTestId('plan-entry').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const startToast = (page: Page, title: string) => page.getByTestId('toast-host').getByText(`Plan '${title}' has started`);
const restSeconds = async (e: Locator) => Number(await e.getByTestId('plan-rest-time').getAttribute('data-seconds'));

async function openPlans(page: Page) {
  await page.goto('/plans');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo Plans');
  await expect(page.getByTestId('plans-group-current')).toBeVisible();
}

/** The browser's own rendering of a local date-time (same format as the app). */
const localDateTime = (page: Page, iso: string) =>
  page.evaluate((v) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)), iso);

test.describe.configure({ mode: 'serial' });

test.describe('M07 plan tracking', () => {
  let s1: Plan;

  test.beforeAll(async ({ request }) => {
    await putSettings(request, DEFAULTS);
    for (const title of CARD_TITLES) {
      const res = await request.post(`${API}/api/learning-cards`, { data: { title, description: null } });
      expect(res.status()).toBe(201);
      cardIds.push((await res.json()).id);
    }
  });

  test.afterEach(async ({ request }) => {
    await putSettings(request, DEFAULTS);
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get(`${API}/api/plans`);
    if (res.ok()) {
      for (const p of (await res.json()) as Plan[]) {
        if (p.title.startsWith(RUN)) await request.delete(`${API}/api/plans/${p.id}`);
      }
    }
    for (const id of cardIds) await request.delete(`${API}/api/learning-cards/${id}`);
    await putSettings(request, DEFAULTS);
  });

  test('1. a plan starting ~75 s ahead is under Upcoming with its scheduled start and no rest time', async ({ page, request }) => {
    const now = Date.now();
    s1 = await createPlan(request, S1, now + 75_000, now + 30 * MIN);
    expect(s1.status).toBe('NotStarted');
    expect(s1.restTimeSeconds).toBeNull();

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openPlans(page);
    const e = inGroup(page, 'plans-upcoming', S1);
    await expect(e).toBeVisible();
    await expect(e.getByTestId('plan-status')).toHaveText('Not started');
    await expect(e.getByTestId('plan-starts')).toHaveText(`Starts ${await localDateTime(page, s1.startDateTime)}`);
    await expect(e.getByTestId('plan-rest-time')).toHaveCount(0);
    await expect(inGroup(page, 'plans-active', S1)).toHaveCount(0);
    await expect(page.getByTestId('plans-group-current').getByRole('heading', { name: 'Upcoming', level: 3 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('2. when the start arrives: toast, highlight, moves to Active, rest time visible', async ({ page, request }) => {
    test.setTimeout(240_000);
    await openPlans(page);
    const startsInMs = Date.parse(s1.startDateTime) - Date.now();
    if (startsInMs > 3_000) await expect(inGroup(page, 'plans-upcoming', S1)).toBeVisible();

    await expect(startToast(page, S1)).toBeVisible({ timeout: 180_000 });
    // The plan truly started on the server.
    const server = await getPlan(request, s1.id);
    expect(server.status).toBe('InProgress');

    const e = inGroup(page, 'plans-active', S1);
    await expect(e).toBeVisible();
    await expect(e).toHaveAttribute('data-highlighted', 'true');
    await expect(e.getByTestId('plan-status')).toHaveText('In progress');
    await expect(e.getByTestId('plan-rest-time')).toBeVisible();
    await expect(e.getByTestId('plan-rest-time')).toContainText(/Rest time\s*00:2\d:\d\d/);
    await expect(inGroup(page, 'plans-upcoming', S1)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/plans');
  });

  test('3. the rest time decreases between two observations', async ({ page, request }) => {
    await openPlans(page);
    const e = inGroup(page, 'plans-active', S1);
    await expect(e.getByTestId('plan-rest-time')).toBeVisible();
    const text = (await e.getByTestId('plan-rest-time').locator('.rest__value').textContent())!.trim();
    expect(text).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    const first = await restSeconds(e);
    // Matches the server's rest time (within a few seconds).
    const server = await getPlan(request, s1.id);
    expect(Math.abs(first - server.restTimeSeconds!)).toBeLessThanOrEqual(5);

    await page.waitForTimeout(3_000);
    const second = await restSeconds(e);
    expect(second).toBeLessThan(first);
    expect(first - second).toBeGreaterThanOrEqual(2);
    expect(first - second).toBeLessThanOrEqual(5);
  });

  test('4. plans with a past window are in Completed / History with their completion %, end date desc', async ({ page, request }) => {
    const now = Date.now();
    const a = await createPlan(request, S4A, now - 4 * 60 * MIN, now - 3 * 60 * MIN, cardIds);
    const b = await createPlan(request, S4B, now - 3 * 60 * MIN, now - 2 * 60 * MIN, cardIds);
    expect(a.status).toBe('Completed');
    const patch = await request.patch(`${API}/api/plans/${a.id}/items/${a.items[0].id}`, { data: { isDone: true } });
    expect(patch.status()).toBe(200);
    expect((await patch.json()).progressPercent).toBe(33);

    await openPlans(page);
    const e = inGroup(page, 'plans-completed', S4A);
    await expect(e).toBeVisible();
    await expect(e.getByTestId('plan-status')).toHaveText('Completed');
    await expect(e.getByTestId('plan-progress-text')).toHaveText('33% · 1/3');
    await expect(e.getByTestId('plan-ended')).toContainText('Ended');
    await expect(e.getByTestId('plan-ended')).toContainText('33% complete');
    await expect(e.getByTestId('plan-rest-time')).toHaveCount(0);
    await expect(inGroup(page, 'plans-completed', S4B).getByTestId('plan-progress-text')).toHaveText('0% · 0/3');

    // History order: end date desc (B ended later than A).
    const titles = (await page.getByTestId('plans-completed').getByRole('heading', { level: 2 }).allTextContents())
      .map((t) => t.trim())
      .filter((t) => t === S4A || t === S4B);
    expect(titles).toEqual([S4B, S4A]);
    expect(b.id).toBeGreaterThan(0);
  });

  test('5. toggling all items of an active plan moves it to Completed; un-toggling moves it back', async ({ page, request }) => {
    const now = Date.now();
    const plan = await createPlan(request, S5, now - 10 * MIN, now + 60 * MIN, [cardIds[0], cardIds[1]]);
    expect(plan.status).toBe('InProgress');
    await openPlans(page);
    await page.evaluate(() => ((window as unknown as { __m07: boolean }).__m07 = true));

    const e = entry(page, S5);
    await expect(inGroup(page, 'plans-active', S5)).toBeVisible();
    const box = (i: number) => e.getByRole('checkbox', { name: `Mark ${CARD_TITLES[i]} as done` });
    const isPatch = (r: { request(): { method(): string } }) => r.request().method() === 'PATCH';

    let patched = page.waitForResponse(isPatch);
    await box(0).check();
    expect((await patched).status()).toBe(200);
    await expect(inGroup(page, 'plans-active', S5)).toBeVisible();
    await expect(e.getByTestId('plan-progress-text')).toHaveText('50% · 1/2');

    patched = page.waitForResponse(isPatch);
    await box(1).check();
    expect((await patched).status()).toBe(200);
    await expect(inGroup(page, 'plans-completed', S5)).toBeVisible();
    await expect(inGroup(page, 'plans-active', S5)).toHaveCount(0);
    await expect(e.getByTestId('plan-status')).toHaveText('Completed');
    await expect(e.getByTestId('plan-progress-text')).toHaveText('100% · 2/2');
    await expect(e.getByTestId('plan-rest-time')).toHaveCount(0);
    expect((await getPlan(request, plan.id)).status).toBe('Completed');

    patched = page.waitForResponse(isPatch);
    await box(1).uncheck();
    expect((await patched).status()).toBe(200);
    await expect(inGroup(page, 'plans-active', S5)).toBeVisible();
    await expect(inGroup(page, 'plans-completed', S5)).toHaveCount(0);
    await expect(e.getByTestId('plan-status')).toHaveText('In progress');
    await expect(e.getByTestId('plan-rest-time')).toBeVisible();
    expect((await getPlan(request, plan.id)).status).toBe('InProgress');
    // Same document: the moves came from the PATCH responses, not a reload.
    expect(await page.evaluate(() => (window as unknown as { __m07?: boolean }).__m07)).toBe(true);
  });

  test('6. with notifications disabled in Settings, the next start shows no toast (status/highlight still update)', async ({ page, request }) => {
    test.setTimeout(240_000);
    const s6 = await createPlan(request, S6, Date.now() + 40_000, Date.now() + 30 * MIN);
    expect(s6.status).toBe('NotStarted');

    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await expect(page.getByLabel('Plan start notifications')).toBeChecked();
    await page.getByLabel('Plan start notifications').uncheck();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByTestId('toast-host').getByText('Settings saved')).toBeVisible();
    const saved = await (await request.get(`${API}/api/settings`)).json();
    expect(saved.planStartNotificationsEnabled).toBe(false);

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Todo Plans' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo Plans');
    await expect(inGroup(page, 'plans-upcoming', S6)).toBeVisible();

    const active = inGroup(page, 'plans-active', S6);
    await expect(active).toBeVisible({ timeout: 180_000 });
    expect((await getPlan(request, s6.id)).status).toBe('InProgress');
    await expect(active).toHaveAttribute('data-highlighted', 'true');
    await expect(active.getByTestId('plan-rest-time')).toBeVisible();
    await expect(startToast(page, S6)).toHaveCount(0);
    await page.waitForTimeout(3_000);
    await expect(startToast(page, S6)).toHaveCount(0);
  });

  test('7. a start while on another page (/tasks) still shows the toast', async ({ page, request }) => {
    test.setTimeout(240_000);
    const s7 = await createPlan(request, S7, Date.now() + 30_000, Date.now() + 30 * MIN);
    expect(s7.status).toBe('NotStarted');

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
    await expect(startToast(page, S7)).toHaveCount(0);

    await expect(startToast(page, S7)).toBeVisible({ timeout: 180_000 });
    expect(new URL(page.url()).pathname).toBe('/tasks');
    expect((await getPlan(request, s7.id)).status).toBe('InProgress');

    // Notified once: after a reload (ids in localStorage) there is no second toast.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
    await page.waitForTimeout(3_000);
    await expect(startToast(page, S7)).toHaveCount(0);
  });
});
