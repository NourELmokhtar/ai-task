import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

/**
 * M08 Dashboard: spec scenarios 1–8. Needs the API on http://localhost:5080.
 * The DB is shared and the dashboard counts are global, so every metric assertion is a delta
 * (read before the action, then expect before ± n). Test data carries the run prefix and is deleted in
 * afterAll; the single settings row is restored to the defaults after every test.
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M08-${Date.now().toString(36)}`;
const DEFAULTS = { displayName: null, planStartNotificationsEnabled: true, defaultView: 'Dashboard' };
const NAME = 'Dash Tester';
const QUICK_TASK = `${RUN} quick task`;
const HABIT = `${RUN} habit`;
const CARD_A = `${RUN} card A`;
const CARD_B = `${RUN} card B`;
const MILESTONE = `${RUN} milestone`;
const PLAN = `${RUN} plan`;
const MIN = 60_000;

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const TODAY = localDate(0);

const ids = { habit: 0, cardA: 0, cardB: 0, milestone: 0, plan: 0 };

async function putSettings(request: APIRequestContext, body: object): Promise<void> {
  const res = await request.put(`${API}/api/settings`, { data: body });
  expect(res.status()).toBe(200);
}

async function post<T>(request: APIRequestContext, path: string, data: object): Promise<T> {
  const res = await request.post(`${API}${path}`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

const metric = (page: Page, name: 'tasks' | 'habits' | 'plans' | 'learning') => page.getByTestId(`metric-${name}`);
const num = async (l: Locator, attr: string) => Number(await l.getAttribute(attr));
const section = (page: Page, name: 'tasks' | 'habits' | 'plans' | 'learning') => page.getByTestId(`dashboard-${name}`);
const quickAdd = (page: Page) => page.getByRole('group', { name: 'Quick add' });
const planRow = (page: Page) => section(page, 'plans').getByTestId('dashboard-plan').filter({ hasText: PLAN });

async function openDashboard(page: Page): Promise<void> {
  const loaded = page.waitForResponse((r) => r.url().includes('/api/dashboard') && r.status() === 200);
  await page.goto('/dashboard');
  await loaded;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await expect(metric(page, 'tasks')).toBeVisible();
}

/** SPA navigation back to the dashboard through the main nav (component re-created → fetch on mount). */
async function navToDashboard(page: Page): Promise<void> {
  const loaded = page.waitForResponse((r) => r.url().includes('/api/dashboard') && r.status() === 200);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Dashboard' }).click();
  await loaded;
  await expect(metric(page, 'tasks')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('M08 dashboard', () => {
  test.beforeAll(async ({ request }) => {
    await putSettings(request, DEFAULTS);
    ids.habit = (await post<{ id: number }>(request, `/api/habits?today=${TODAY}`, { name: HABIT, description: null, frequency: 'Daily' })).id;
    ids.cardA = (await post<{ id: number }>(request, '/api/learning-cards', { title: CARD_A, description: null })).id;
    ids.cardB = (await post<{ id: number }>(request, '/api/learning-cards', { title: CARD_B, description: null })).id;
    ids.milestone = (await post<{ id: number }>(request, `/api/learning-cards/${ids.cardA}/milestones`, { title: MILESTONE, targetDate: null })).id;
  });

  test.afterEach(async ({ request }) => {
    await putSettings(request, DEFAULTS);
  });

  test.afterAll(async ({ request }) => {
    const plans = await request.get(`${API}/api/plans`);
    if (plans.ok()) {
      for (const p of (await plans.json()) as { id: number; title: string }[]) {
        if (p.title.startsWith(RUN)) await request.delete(`${API}/api/plans/${p.id}`);
      }
    }
    for (const archived of [false, true]) {
      const tasks = await request.get(`${API}/api/tasks?search=${encodeURIComponent(RUN)}&archived=${archived}&today=${TODAY}`);
      if (tasks.ok()) {
        for (const t of (await tasks.json()) as { id: number; title: string }[]) {
          if (t.title.startsWith(RUN)) await request.delete(`${API}/api/tasks/${t.id}`);
        }
      }
    }
    const habits = await request.get(`${API}/api/habits?today=${TODAY}`);
    if (habits.ok()) {
      for (const h of (await habits.json()) as { id: number; name: string }[]) {
        if (h.name.startsWith(RUN)) await request.delete(`${API}/api/habits/${h.id}`);
      }
    }
    const cards = await request.get(`${API}/api/learning-cards`);
    if (cards.ok()) {
      for (const c of (await cards.json()) as { id: number; title: string }[]) {
        if (c.title.startsWith(RUN)) await request.delete(`${API}/api/learning-cards/${c.id}`);
      }
    }
    await putSettings(request, DEFAULTS);
  });

  test('1. / lands on the Dashboard; the greeting shows the Settings display name', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    // Default settings: generic greeting.
    const first = page.waitForRequest((r) => r.url().includes('/api/dashboard'));
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(new URL((await first).url()).searchParams.get('today')).toBe(TODAY);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
    await expect(page.getByTestId('dashboard-greeting')).toHaveText(/^Good (morning|afternoon|evening)$/);
    const year = String(new Date().getFullYear());
    await expect(page.getByTestId('dashboard-date')).toContainText(year);

    await putSettings(request, { ...DEFAULTS, displayName: NAME });
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-greeting')).toHaveText(new RegExp(`^Good (morning|afternoon|evening), ${NAME}$`));
    await expect(metric(page, 'tasks')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('2. empty dashboard (stubbed) shows an empty state with an add action per section', async ({ page }) => {
    const empty = {
      serverNow: new Date().toISOString(),
      today: TODAY,
      tasks: { dueToday: [], overdue: [], completedTodayCount: 0, totalActive: 0, doneCount: 0, completionPercent: 0 },
      habits: { activeCount: 0, completedTodayCount: 0, items: [] },
      plans: { inProgressCount: 0, upcomingCount: 0, completedCount: 0, active: [] },
      learning: { notStartedCount: 0, inProgressCount: 0, completedCount: 0, milestonesDone: 0, milestonesTotal: 0, milestonesCompletedLast7Days: 0 },
    };
    await page.route('**/api/dashboard**', (route) => route.fulfill({ json: empty }));
    await page.goto('/dashboard');

    await expect(metric(page, 'tasks')).toHaveAttribute('data-completion', '0');
    await expect(metric(page, 'habits')).toContainText('0 / 0 done today');
    const cases: [Parameters<typeof section>[1], string, string][] = [
      ['tasks', 'Nothing due today', 'Add Task'],
      ['habits', 'No habits yet', 'Add Habit'],
      ['learning', 'No learning cards yet', 'Add Learning Card'],
    ];
    for (const [name, title, action] of cases) {
      const state = section(page, name).getByTestId('empty-state');
      await expect(state).toContainText(title);
      await state.getByRole('button', { name: action }).click();
      const dialog = page.getByRole('dialog', { name: action });
      await expect(dialog).toBeVisible();
      if (name === 'tasks') await expect(dialog.getByLabel('Due date')).toHaveValue(TODAY);
      await dialog.getByRole('button', { name: 'Close dialog' }).click();
      await expect(dialog).toBeHidden();
    }
    const plans = section(page, 'plans').getByTestId('empty-state');
    await expect(plans).toContainText('No active plans');
    await plans.getByRole('button', { name: 'Create Plan' }).click();
    await expect(page).toHaveURL(/\/plans\/new$/);
  });

  test('3. quick-add a task due today → it is in today\'s list and the Tasks card updates', async ({ page }) => {
    await openDashboard(page);
    const card = metric(page, 'tasks');
    const due = await num(card, 'data-due-today');
    const total = await num(card, 'data-total');

    await quickAdd(page).getByRole('button', { name: 'Add Task' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Task' });
    await expect(dialog.getByLabel('Due date')).toHaveValue(TODAY);
    await dialog.getByLabel('Title').fill(QUICK_TASK);
    const refetch = page.waitForResponse((r) => r.url().includes('/api/dashboard') && r.status() === 200);
    await dialog.getByRole('button', { name: 'Add Task' }).click();
    await expect(dialog).toBeHidden();
    await refetch;

    await expect(page.getByTestId('dashboard-due-today').getByTestId('task-item').filter({ hasText: QUICK_TASK })).toBeVisible();
    await expect(card).toHaveAttribute('data-due-today', String(due + 1));
    await expect(card).toHaveAttribute('data-total', String(total + 1));
    await expect(page.getByTestId('metric-tasks-due')).toHaveText(`${due + 1} due today`);
  });

  test('4. complete the task from the dashboard → completion % and counts update', async ({ page, request }) => {
    await openDashboard(page);
    const card = metric(page, 'tasks');
    const done = await num(card, 'data-done');
    const total = await num(card, 'data-total');
    const due = await num(card, 'data-due-today');
    const expectedPct = Math.round(((done + 1) / total) * 100);

    const row = page.getByTestId('dashboard-due-today').getByTestId('task-item').filter({ hasText: QUICK_TASK });
    await row.getByRole('checkbox', { name: `Mark ${QUICK_TASK} as done` }).check();
    await expect(page.getByTestId('toast-host')).toContainText('Task completed');

    await expect(card).toHaveAttribute('data-done', String(done + 1));
    await expect(card).toHaveAttribute('data-completion', String(expectedPct));
    await expect(card).toContainText(`${expectedPct}%`);
    await expect(card).toContainText(`${done + 1} of ${total} done`);
    await expect(card).toHaveAttribute('data-due-today', String(due)); // still due today (any status)
    await expect(row.getByTestId('task-status')).toHaveText('Done');
    await expect(row.getByRole('checkbox')).toBeChecked();

    const tasks = (await (await request.get(`${API}/api/tasks?search=${encodeURIComponent(QUICK_TASK)}&today=${TODAY}`)).json()) as {
      status: string;
      completedAt: string | null;
    }[];
    expect(tasks[0].status).toBe('Done');
    expect(tasks[0].completedAt).not.toBeNull();
  });

  test('5. toggle a habit on the dashboard → the Habits card updates', async ({ page }) => {
    await openDashboard(page);
    const card = metric(page, 'habits');
    const before = await num(card, 'data-completed-today');
    const active = await num(card, 'data-active');
    const box = section(page, 'habits').getByRole('checkbox', { name: `Mark ${HABIT} as done today` });
    await expect(box).not.toBeChecked();

    await box.check();
    await expect(page.getByTestId('toast-host')).toContainText('Marked as done today');
    await expect(card).toHaveAttribute('data-completed-today', String(before + 1));
    await expect(card).toContainText(`${before + 1} / ${active} done today`);
    await expect(box).toBeChecked();

    await box.uncheck();
    await expect(card).toHaveAttribute('data-completed-today', String(before));
    await expect(box).not.toBeChecked();
  });

  test('6. an active plan shows progress and a rest time that decreases', async ({ page, request }) => {
    const now = Date.now();
    const plan = await post<{ id: number }>(request, '/api/plans', {
      title: PLAN,
      estimatedDurationMinutes: 30,
      startDateTime: new Date(now - 5 * MIN).toISOString(),
      endDateTime: new Date(now + 45 * MIN).toISOString(),
      priorityOrder: 1,
      items: [
        { sourceType: 'LearningResource', sourceId: ids.cardA },
        { sourceType: 'LearningResource', sourceId: ids.cardB },
      ],
    });
    ids.plan = plan.id;

    await openDashboard(page);
    const row = planRow(page);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('plan-status')).toHaveText('In progress');
    await expect(row.getByTestId('plan-progress-text')).toHaveText('0% · 0/2');
    const rest = row.getByTestId('plan-rest-time');
    await expect(rest.locator('.rest__value')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const first = await num(rest, 'data-seconds');
    expect(first).toBeGreaterThan(40 * 60);
    expect(first).toBeLessThanOrEqual(45 * 60);
    await expect.poll(async () => num(rest, 'data-seconds'), { timeout: 10_000 }).toBeLessThan(first - 1);
    await expect(section(page, 'plans').getByRole('link', { name: 'View all plans' })).toHaveAttribute('href', '/plans');
  });

  test('7. mark a plan item done on Todo Plans → back on the Dashboard the progress reflects it', async ({ page }) => {
    await openDashboard(page);
    await expect(planRow(page).getByTestId('plan-progress-text')).toHaveText('0% · 0/2');

    await section(page, 'plans').getByRole('link', { name: 'View all plans' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo Plans');
    const entry = page.getByTestId('plan-entry').filter({ has: page.getByRole('heading', { name: PLAN, exact: true }) });
    const patched = page.waitForResponse((r) => r.url().includes(`/api/plans/${ids.plan}/items/`) && r.request().method() === 'PATCH');
    await entry.getByRole('checkbox', { name: `Mark ${CARD_B} as done` }).check();
    expect((await patched).status()).toBe(200);
    await expect(entry.getByTestId('plan-progress-text')).toHaveText('50% · 1/2');

    await navToDashboard(page);
    await expect(planRow(page).getByTestId('plan-progress-text')).toHaveText('50% · 1/2');
    await expect(planRow(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  test('8. complete a milestone on the Learning page → the learning snapshot updates', async ({ page }) => {
    await openDashboard(page);
    const snap = section(page, 'learning');
    const done = await num(snap, 'data-milestones-done');
    const total = await num(snap, 'data-milestones-total');
    const recent = await num(snap, 'data-recent');

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Learning Resources' }).click();
    const card = page.getByTestId('learning-card').filter({ hasText: CARD_A });
    await card.getByRole('button', { name: `Show details for ${CARD_A}` }).click();
    const box = card.getByRole('checkbox', { name: `Mark ${MILESTONE} as done` });
    await box.check();
    await expect(card.getByTestId('milestone-progress')).toContainText('1/1');

    await navToDashboard(page);
    await expect(snap).toHaveAttribute('data-milestones-done', String(done + 1));
    await expect(snap).toHaveAttribute('data-milestones-total', String(total));
    await expect(snap).toHaveAttribute('data-recent', String(recent + 1));
    await expect(snap.getByTestId('learning-recent')).toContainText(`${recent + 1} milestone`);
    await expect(metric(page, 'learning')).toContainText(`${done + 1} / ${total} milestones done`);
  });
});
