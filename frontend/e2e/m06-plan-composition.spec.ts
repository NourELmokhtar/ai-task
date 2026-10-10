import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

/**
 * M06 Plan Composition: spec scenarios 1–7 (+ "source removed" extra). Needs the API on
 * http://localhost:5080. The DB is shared, so the prerequisite task, habit and learning card and
 * every plan created here carry a unique run prefix and are deleted in afterAll; the empty state
 * is checked with a stubbed empty list.
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M06-${Date.now().toString(36)}`;
const TASK = `${RUN} task`;
const HABIT = `${RUN} habit`;
const CARD = `${RUN} card`;
const PLAN_A = `${RUN} Plan A`;
const PLAN_B = `${RUN} Plan B`;
/** Local date-times (the browser and the runner share the machine time zone). */
const START = '2026-11-02T09:00';
const END = '2026-11-02T11:30';
const localToUtc = (local: string) => new Date(local).toISOString();

interface PlanItem {
  id: number;
  sourceType: string;
  sourceId: number;
  sourceTitle: string | null;
  sourceAvailable: boolean;
  isDone: boolean;
}
interface Plan {
  id: number;
  title: string;
  priorityOrder: number;
  startDateTime: string;
  endDateTime: string;
  estimatedDurationMinutes: number;
  progressPercent: number;
  items: PlanItem[];
}

const ids = { task: 0, habit: 0, card: 0 };

async function create<T>(request: APIRequestContext, path: string, data: Record<string, unknown>): Promise<T> {
  const res = await request.post(`${API}${path}`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

const card = (page: Page, title: string): Locator =>
  page.getByTestId('plan-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const toast = (page: Page, text: string) => page.getByTestId('toast-host').getByText(text);
const section = (page: Page, type: string) => page.locator(`[data-testid="picker-section"][data-type="${type}"]`);
const progress = (page: Page, title: string) => card(page, title).getByRole('progressbar');

async function openPlans(page: Page) {
  await page.goto('/plans');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo Plans');
}

/** Order of this run's plans as they appear in the list. */
async function myPlanOrder(page: Page): Promise<string[]> {
  const titles = await page.getByTestId('plan-card').getByRole('heading', { level: 2 }).allTextContents();
  return titles.map((t) => t.trim()).filter((t) => t.startsWith(RUN));
}

/** Picks one source in a picker section by searching for its title. */
async function pick(page: Page, type: string, title: string) {
  const s = section(page, type);
  await s.getByRole('searchbox').fill(title);
  await s.getByRole('checkbox', { name: title }).check();
}

test.describe.configure({ mode: 'serial' });

test.describe('M06 plan composition', () => {
  test.beforeAll(async ({ request }) => {
    ids.task = (await create<{ id: number }>(request, '/api/tasks', { title: TASK })).id;
    ids.habit = (await create<{ id: number }>(request, '/api/habits', { name: HABIT, frequency: 'Daily' })).id;
    ids.card = (await create<{ id: number }>(request, '/api/learning-cards', { title: CARD, description: null })).id;
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get(`${API}/api/plans`);
    if (res.ok()) {
      for (const p of (await res.json()) as Plan[]) {
        if (p.title.startsWith(RUN)) await request.delete(`${API}/api/plans/${p.id}`);
      }
    }
    if (ids.task) await request.delete(`${API}/api/tasks/${ids.task}`);
    if (ids.habit) await request.delete(`${API}/api/habits/${ids.habit}`);
    if (ids.card) await request.delete(`${API}/api/learning-cards/${ids.card}`);
  });

  test('1. empty state offers "Create Plan" (stubbed empty list)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/plans', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback(),
    );
    await openPlans(page);
    const empty = page.getByTestId('empty-state');
    await expect(empty).toContainText('No plans yet');
    await empty.getByRole('button', { name: 'Create Plan' }).click();
    await expect(page).toHaveURL(/\/plans\/new$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create Plan');
    expect(errors).toEqual([]);
  });

  test('2. builder validation: no items, then end before start', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/plans') && posts.push(r.url()));
    await page.goto('/plans/new');
    await expect(section(page, 'Task').getByRole('checkbox', { name: TASK })).toBeAttached();
    await page.getByLabel('Title').fill(PLAN_A);

    await page.getByRole('button', { name: 'Create Plan' }).click();
    await expect(page.getByText('At least one item is required.')).toBeVisible();
    await expect(page.getByTestId('form-error')).toContainText('Please fix the highlighted fields.');

    await pick(page, 'Task', TASK);
    await expect(page.getByTestId('selected-items')).toContainText('1 item selected');
    await expect(page.getByText('At least one item is required.')).toHaveCount(0);
    await page.getByLabel('Start', { exact: true }).fill('2026-11-02T10:00');
    await page.getByLabel('End', { exact: true }).fill('2026-11-02T09:00');
    await page.getByRole('button', { name: 'Create Plan' }).click();
    await expect(page.getByText('End date/time must be after the start date/time.')).toBeVisible();
    await expect(page).toHaveURL(/\/plans\/new$/);
    expect(posts).toEqual([]);
  });

  test('3. create a plan with 1 task + 1 habit + 1 learning card → listed at 0%', async ({ page }) => {
    await page.goto('/plans/new');
    await page.getByLabel('Title').fill(PLAN_A);
    await page.getByLabel('Hours').fill('2');
    await page.getByLabel('Minutes').fill('30');
    await page.getByLabel('Start', { exact: true }).fill(START);
    await page.getByLabel('End', { exact: true }).fill(END);
    await page.getByLabel('Priority order').fill('2');
    await pick(page, 'Task', TASK);
    await pick(page, 'Habit', HABIT);
    await pick(page, 'LearningResource', CARD);
    await expect(page.getByTestId('selected-items')).toHaveAttribute('data-count', '3');

    const post = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/plans');
    await page.getByRole('button', { name: 'Create Plan' }).click();
    const body = (await post).postDataJSON();
    expect(body).toEqual({
      title: PLAN_A,
      estimatedDurationMinutes: 150,
      startDateTime: localToUtc(START),
      endDateTime: localToUtc(END),
      priorityOrder: 2,
      items: [
        { sourceType: 'Task', sourceId: ids.task },
        { sourceType: 'Habit', sourceId: ids.habit },
        { sourceType: 'LearningResource', sourceId: ids.card },
      ],
    });

    await expect(page).toHaveURL(/\/plans$/);
    await expect(toast(page, 'Plan created')).toBeVisible();
    const a = card(page, PLAN_A);
    await expect(a).toBeVisible();
    await expect(a.getByTestId('plan-priority')).toHaveText('Priority 2');
    await expect(a.getByTestId('plan-duration')).toHaveText('Est. 2h 30m');
    await expect(progress(page, PLAN_A)).toHaveAttribute('aria-valuenow', '0');
    await expect(a.getByTestId('plan-progress-text')).toHaveText('0% · 0/3');
    await expect(a.getByTestId('plan-item')).toHaveCount(3);
    await expect(a.getByTestId('plan-item-type')).toHaveText(['✓ Task', '↻ Habit', '◆ Learning']);
    await expect(a.getByTestId('plan-item-removed')).toHaveCount(0);
  });

  test('4. toggling items updates progress 33% → 67% without a reload', async ({ page }) => {
    await openPlans(page);
    const a = card(page, PLAN_A);
    await expect(a).toBeVisible();
    let listLoads = 0;
    page.on('request', (r) => r.method() === 'GET' && new URL(r.url()).pathname === '/api/plans' && listLoads++);
    await page.evaluate(() => ((window as unknown as { __m06 : boolean }).__m06 = true));

    const patch1 = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await a.getByRole('checkbox', { name: `Mark ${TASK} as done` }).check();
    expect((await patch1).status()).toBe(200);
    await expect(progress(page, PLAN_A)).toHaveAttribute('aria-valuenow', '33');
    await expect(a.getByTestId('plan-progress-text')).toHaveText('33% · 1/3');

    await a.getByRole('checkbox', { name: `Mark ${HABIT} as done` }).check();
    await expect(progress(page, PLAN_A)).toHaveAttribute('aria-valuenow', '67');
    await expect(a.getByTestId('plan-progress-text')).toHaveText('67% · 2/3');
    await expect(a.getByRole('checkbox', { name: `Mark ${TASK} as done` })).toBeChecked();
    await expect(a.getByRole('checkbox', { name: `Mark ${CARD} as done` })).not.toBeChecked();

    // Same document (no reload) and no list refetch.
    expect(await page.evaluate(() => (window as unknown as { __m06?: boolean }).__m06)).toBe(true);
    expect(listLoads).toBe(0);
  });

  test('5. after toggling the task item, the Tasks page shows that task as Done (BR-13)', async ({ page, request }) => {
    await openPlans(page);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
    const row = page.getByTestId('task-item').filter({ hasText: TASK });
    await expect(row.getByTestId('task-status')).toHaveText('Done');
    await expect(row.getByTestId('task-status')).toHaveAttribute('data-status', 'Done');
    const task = await (await request.get(`${API}/api/tasks/${ids.task}`)).json();
    expect(task.status).toBe('Done');
    expect(task.completedAt).not.toBeNull();
  });

  test('6. editing the priority updates the list order', async ({ page, request }) => {
    await create<Plan>(request, '/api/plans', {
      title: PLAN_B,
      estimatedDurationMinutes: 60,
      startDateTime: localToUtc(START),
      endDateTime: localToUtc(END),
      priorityOrder: 3,
      items: [{ sourceType: 'LearningResource', sourceId: ids.card }],
    });
    await openPlans(page);
    await expect(card(page, PLAN_B)).toBeVisible();
    expect(await myPlanOrder(page)).toEqual([PLAN_A, PLAN_B]);

    await page.getByRole('button', { name: `Edit ${PLAN_A}` }).click();
    await expect(page).toHaveURL(/\/plans\/\d+\/edit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit Plan');
    await expect(page.getByLabel('Title')).toHaveValue(PLAN_A);
    await expect(page.getByLabel('Start', { exact: true })).toHaveValue(START);
    await expect(page.getByLabel('Hours')).toHaveValue('2');
    await expect(page.getByTestId('readonly-items').getByRole('listitem')).toHaveCount(3);
    await expect(page.getByLabel('Priority order')).toHaveValue('2');
    await page.getByLabel('Priority order').fill('9');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/plans$/);
    await expect(toast(page, 'Plan updated')).toBeVisible();
    await expect(card(page, PLAN_A).getByTestId('plan-priority')).toHaveText('Priority 9');
    expect(await myPlanOrder(page)).toEqual([PLAN_B, PLAN_A]);
    // Items and progress are untouched by the metadata edit.
    await expect(card(page, PLAN_A).getByTestId('plan-progress-text')).toHaveText('67% · 2/3');
  });

  test('7. removing a plan asks for confirmation, then it is gone', async ({ page, request }) => {
    await openPlans(page);
    const a = card(page, PLAN_A);
    const id = Number(await a.getAttribute('data-plan-id'));
    await page.getByRole('button', { name: `Remove ${PLAN_A}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove plan?' });
    await expect(dialog).toContainText(`"${PLAN_A}" will be removed`);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(a).toBeVisible();

    await page.getByRole('button', { name: `Remove ${PLAN_A}` }).click();
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(toast(page, 'Plan removed')).toBeVisible();
    await expect(a).toHaveCount(0);
    expect((await request.get(`${API}/api/plans/${id}`)).status()).toBe(404);
    await page.reload();
    await expect(card(page, PLAN_B)).toBeVisible();
    await expect(card(page, PLAN_A)).toHaveCount(0);
  });

  test('extra: an item whose source was deleted shows "Source removed"', async ({ page, request }) => {
    expect((await request.delete(`${API}/api/learning-cards/${ids.card}`)).status()).toBe(204);
    ids.card = 0;
    await openPlans(page);
    const b = card(page, PLAN_B);
    await expect(b.getByTestId('plan-item').filter({ hasText: CARD }).getByTestId('plan-item-removed')).toHaveText(
      'Source removed',
    );
    await expect(b.getByTestId('plan-progress-text')).toHaveText('0% · 0/1');
  });
});
