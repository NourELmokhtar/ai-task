import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

/**
 * M09 MVP acceptance: the TR-4 journey plus the DoD checks that no earlier spec covers end to end.
 *
 *  - TR-4 journey (F2): entirely through the UI. create task → complete it → create habit → complete it →
 *    learning card with 2 milestones → plan built from those three items with an already active window →
 *    mark all items done → 100% / Completed → Dashboard metrics moved accordingly.
 *  - DOD-1 (F3): the six-entry nav persists on every page and sub-route, at 1280 px and 375 px.
 *    (m01 covers the PRD order, active highlight, direct URLs, `/` and the not-found page.)
 *  - DOD-2 / NFR-U1 (F4): add and remove a task, habit, learning card and plan, each on its own page.
 *  - DOD-5 / AC-P5/P6 (F6): a plan starting shortly, watched from the Dashboard: start toast, the dashboard
 *    picks the plan up as active with a decreasing rest time, and completing it on Todo Plans clears it.
 *    (m07 covers the plans-page side, m08 the dashboard rest time / progress for an already active plan.)
 *  - DOD-3 (F5) is covered by m04 tests 3–5 and is not repeated here.
 *
 * Works on a fresh `quickflow_e2e` (npm run e2e:full) and on a shared DB (npm run e2e): dashboard metrics are
 * asserted as deltas against a baseline read in the UI, everything carries the run prefix and is deleted in
 * afterAll, and the settings row is left at its defaults.
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M09-${Date.now().toString(36)}`;
const DEFAULTS = { displayName: null, planStartNotificationsEnabled: true, defaultView: 'Dashboard' };
const MIN = 60_000;

const NAV = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Habits', path: '/habits' },
  { label: 'Learning Resources', path: '/learning' },
  { label: 'Todo Plans', path: '/plans' },
  { label: 'Settings', path: '/settings' },
];

const pad = (n: number) => String(n).padStart(2, '0');
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** `datetime-local` value (local time, minute precision) for now + offset. */
function localDateTime(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const TODAY = localDate(0);

// ---------- shared locators / helpers ----------

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const h1 = (page: Page) => page.getByRole('heading', { level: 1 });
const toast = (page: Page, text: string) => page.getByTestId('toast-host').getByText(text);
const header = (page: Page) => page.locator('.page-header');
const metric = (page: Page, name: 'tasks' | 'habits' | 'plans' | 'learning') => page.getByTestId(`metric-${name}`);
const num = async (l: Locator, attr: string) => Number(await l.getAttribute(attr));
const taskRow = (page: Page, title: string) =>
  page.getByTestId('task-item').filter({ has: page.getByText(title, { exact: true }) });
const habitCard = (page: Page, name: string) =>
  page.getByTestId('habit-card').filter({ has: page.getByText(name, { exact: true }) });
const learningCard = (page: Page, title: string) =>
  page.getByTestId('learning-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const planEntry = (page: Page, title: string) =>
  page.getByTestId('plan-entry').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const inGroup = (page: Page, group: 'plans-active' | 'plans-upcoming' | 'plans-completed', title: string) =>
  page.getByTestId(group).getByTestId('plan-entry').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const dashboardPlan = (page: Page, title: string) =>
  page.getByTestId('dashboard-plans').getByTestId('dashboard-plan').filter({ hasText: title });

async function goVia(page: Page, label: string) {
  await nav(page).getByRole('link', { name: label, exact: true }).click();
  await expect(h1(page)).toHaveText(label);
}

/** SPA navigation to the Dashboard and wait for its fetch-on-mount. */
async function navToDashboard(page: Page) {
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/dashboard' && r.status() === 200);
  await nav(page).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await loaded;
  await expect(h1(page)).toHaveText('Dashboard');
  await expect(metric(page, 'tasks')).toBeVisible();
}

interface DashboardNumbers {
  tasksDone: number;
  tasksTotal: number;
  tasksDueToday: number;
  habitsCompletedToday: number;
  habitsActive: number;
  plansInProgress: number;
  plansUpcoming: number;
  plansCompleted: number;
  learningInProgress: number;
  milestonesDone: number;
  milestonesTotal: number;
}

/** Reads every dashboard metric from the rendered cards. */
async function readDashboard(page: Page): Promise<DashboardNumbers> {
  const tasks = metric(page, 'tasks');
  const habits = metric(page, 'habits');
  const plans = metric(page, 'plans');
  const learning = metric(page, 'learning');
  const completedText = (await plans.textContent()) ?? '';
  const completed = /(\d+)\s+completed/.exec(completedText);
  expect(completed, `completed count in "${completedText}"`).not.toBeNull();
  return {
    tasksDone: await num(tasks, 'data-done'),
    tasksTotal: await num(tasks, 'data-total'),
    tasksDueToday: await num(tasks, 'data-due-today'),
    habitsCompletedToday: await num(habits, 'data-completed-today'),
    habitsActive: await num(habits, 'data-active'),
    plansInProgress: await num(plans, 'data-in-progress'),
    plansUpcoming: await num(plans, 'data-upcoming'),
    plansCompleted: Number(completed![1]),
    learningInProgress: await num(learning, 'data-in-progress'),
    milestonesDone: await num(learning, 'data-milestones-done'),
    milestonesTotal: await num(learning, 'data-milestones-total'),
  };
}

// ---------- UI actions shared by the journey and the add/remove checks ----------

async function addTaskOnTasksPage(page: Page, title: string, dueDate?: string) {
  await header(page).getByRole('button', { name: 'Add Task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Task' });
  await dialog.getByLabel('Title').fill(title);
  if (dueDate) await dialog.getByLabel('Due date').fill(dueDate);
  await dialog.getByRole('button', { name: 'Add Task' }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page, 'Task created')).toBeVisible();
  await expect(taskRow(page, title)).toBeVisible();
}

async function addHabitOnHabitsPage(page: Page, name: string) {
  await header(page).getByRole('button', { name: 'Add Habit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Habit' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Add Habit' }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page, 'Habit created')).toBeVisible();
  await expect(habitCard(page, name)).toBeVisible();
}

async function addCardOnLearningPage(page: Page, title: string) {
  await header(page).getByRole('button', { name: 'Add Learning Card' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Learning Card' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Add Learning Card' }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page, 'Learning card created')).toBeVisible();
  await expect(learningCard(page, title)).toBeVisible();
}

/** Picks one source in a builder picker section by searching for its title. */
async function pick(page: Page, type: 'Task' | 'Habit' | 'LearningResource', title: string) {
  const section = page.locator(`[data-testid="picker-section"][data-type="${type}"]`);
  await section.getByRole('searchbox').fill(title);
  await section.getByRole('checkbox', { name: title }).check();
}

// ---------- API used only for setup (F6) and cleanup ----------

async function putSettings(request: APIRequestContext, body: object) {
  const res = await request.put(`${API}/api/settings`, { data: body });
  expect(res.status()).toBe(200);
}

async function cleanup(request: APIRequestContext) {
  const plans = await request.get(`${API}/api/plans`);
  if (plans.ok()) {
    for (const p of (await plans.json()) as { id: number; title: string }[]) {
      if (p.title.startsWith(RUN)) await request.delete(`${API}/api/plans/${p.id}`);
    }
  }
  for (const archived of [false, true]) {
    const tasks = await request.get(`${API}/api/tasks`, { params: { search: RUN, archived: String(archived), today: TODAY } });
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
}

test.describe.configure({ mode: 'serial' });

test.describe('M09 MVP acceptance', () => {
  test.beforeAll(async ({ request }) => {
    await putSettings(request, DEFAULTS);
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
    await putSettings(request, DEFAULTS);
  });

  test('TR-4 journey: task → habit → learning card → plan → 100% / Completed → dashboard', async ({ page }) => {
    test.setTimeout(150_000);
    const TASK = `${RUN} journey task`;
    const HABIT = `${RUN} journey habit`;
    const CARD = `${RUN} journey card`;
    const MS = [`${RUN} milestone 1`, `${RUN} milestone 2`];
    const PLAN = `${RUN} journey plan`;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Baseline, read on the Dashboard before anything is created (all zero on a fresh quickflow_e2e).
    const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/dashboard' && r.status() === 200);
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await loaded;
    await expect(metric(page, 'tasks')).toBeVisible();
    const before = await readDashboard(page);

    await test.step('1. create a task (due today) and complete it on the Tasks page', async () => {
      await goVia(page, 'Tasks');
      await addTaskOnTasksPage(page, TASK, TODAY);
      const row = taskRow(page, TASK);
      await expect(row.getByTestId('task-status')).toHaveText('To do');
      await row.getByRole('checkbox', { name: `Mark ${TASK} as done` }).check();
      await expect(toast(page, 'Task completed')).toBeVisible();
      await expect(row.getByTestId('task-status')).toHaveText('Done');
      await expect(row.getByRole('checkbox', { name: `Mark ${TASK} as done` })).toBeChecked();
    });

    await test.step('2. create a habit and complete it for today on the Habits page', async () => {
      await goVia(page, 'Habits');
      await addHabitOnHabitsPage(page, HABIT);
      const card = habitCard(page, HABIT);
      await expect(card.getByTestId('habit-streak')).toHaveText('Streak: 0 days');
      await card.getByRole('checkbox', { name: `Mark ${HABIT} as done today` }).check();
      await expect(toast(page, 'Marked as done today')).toBeVisible();
      await expect(card.getByRole('checkbox', { name: `Mark ${HABIT} as done today` })).toBeChecked();
      await expect(card.getByTestId('habit-streak')).toHaveText('Streak: 1 day');
    });

    await test.step('3. add a learning card with two milestones on the Learning page', async () => {
      await goVia(page, 'Learning Resources');
      await addCardOnLearningPage(page, CARD);
      const card = learningCard(page, CARD);
      await card.getByRole('button', { name: `Show details for ${CARD}` }).click();
      await expect(card.getByTestId('learning-card-details')).toBeVisible();
      for (const [i, title] of MS.entries()) {
        await card.getByLabel('New milestone').fill(title);
        await card.getByRole('button', { name: 'Add milestone' }).click();
        await expect(card.getByTestId('milestone').filter({ hasText: title })).toBeVisible();
        await expect(card.getByTestId('milestone-progress')).toContainText(`0/${i + 1}`);
      }
      await expect(card.getByTestId('milestone')).toHaveCount(2);
    });

    await test.step('4. build a plan from those three items with an already active window', async () => {
      await goVia(page, 'Todo Plans');
      await header(page).getByRole('link', { name: 'Create Plan' }).click();
      await expect(page).toHaveURL(/\/plans\/new$/);
      await expect(h1(page)).toHaveText('Create Plan');
      await page.getByLabel('Title').fill(PLAN);
      await page.getByLabel('Hours').fill('1');
      await page.getByLabel('Minutes').fill('0');
      await page.getByLabel('Start', { exact: true }).fill(localDateTime(-5 * MIN));
      await page.getByLabel('End', { exact: true }).fill(localDateTime(60 * MIN));
      await page.getByLabel('Priority order').fill('1');
      await pick(page, 'Task', TASK);
      await pick(page, 'Habit', HABIT);
      await pick(page, 'LearningResource', CARD);
      await expect(page.getByTestId('selected-items')).toHaveAttribute('data-count', '3');
      await page.getByRole('button', { name: 'Create Plan' }).click();

      await expect(page).toHaveURL(/\/plans$/);
      await expect(toast(page, 'Plan created')).toBeVisible();
      const entry = inGroup(page, 'plans-active', PLAN);
      await expect(entry).toBeVisible();
      await expect(entry.getByTestId('plan-status')).toHaveText('In progress');
      await expect(entry.getByTestId('plan-progress-text')).toHaveText('0% · 0/3');
      await expect(entry.getByTestId('plan-rest-time')).toBeVisible();
      await expect(entry.getByTestId('plan-item-type')).toHaveText(['✓ Task', '↻ Habit', '◆ Learning']);
    });

    await test.step('5. mark every plan item done → 100% and the plan moves to Completed', async () => {
      const entry = planEntry(page, PLAN);
      const steps: [string, string][] = [
        [TASK, '33% · 1/3'],
        [HABIT, '67% · 2/3'],
        [CARD, '100% · 3/3'],
      ];
      for (const [title, progress] of steps) {
        const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/items/'));
        await entry.getByRole('checkbox', { name: `Mark ${title} as done` }).check();
        expect((await patched).status()).toBe(200);
        await expect(entry.getByTestId('plan-progress-text')).toHaveText(progress);
      }
      await expect(entry.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
      await expect(inGroup(page, 'plans-completed', PLAN)).toBeVisible();
      await expect(inGroup(page, 'plans-active', PLAN)).toHaveCount(0);
      await expect(entry.getByTestId('plan-status')).toHaveText('Completed');
      await expect(entry.getByTestId('plan-rest-time')).toHaveCount(0);
      // Still Completed after a reload (status is derived from the stored items).
      await page.reload();
      await expect(inGroup(page, 'plans-completed', PLAN).getByTestId('plan-progress-text')).toHaveText('100% · 3/3');
    });

    await test.step('6. the Dashboard metrics reflect the journey', async () => {
      await navToDashboard(page);
      const tasks = metric(page, 'tasks');
      const total = before.tasksTotal + 1;
      const done = before.tasksDone + 1;
      const pct = Math.round((done / total) * 100);
      await expect(tasks).toHaveAttribute('data-total', String(total));
      await expect(tasks).toHaveAttribute('data-done', String(done));
      await expect(tasks).toHaveAttribute('data-completion', String(pct));
      await expect(tasks).toContainText(`${pct}%`);
      await expect(tasks).toContainText(`${done} of ${total} done`);
      await expect(tasks).toHaveAttribute('data-due-today', String(before.tasksDueToday + 1));
      const todayRow = page.getByTestId('dashboard-due-today').getByTestId('task-item').filter({ hasText: TASK });
      await expect(todayRow.getByTestId('task-status')).toHaveText('Done');

      const habits = metric(page, 'habits');
      await expect(habits).toHaveAttribute('data-active', String(before.habitsActive + 1));
      await expect(habits).toHaveAttribute('data-completed-today', String(before.habitsCompletedToday + 1));
      await expect(
        page.getByTestId('dashboard-habits').getByRole('checkbox', { name: `Mark ${HABIT} as done today` }),
      ).toBeChecked();

      const plans = metric(page, 'plans');
      await expect(plans).toHaveAttribute('data-in-progress', String(before.plansInProgress));
      await expect(plans).toHaveAttribute('data-upcoming', String(before.plansUpcoming));
      await expect(plans).toContainText(`${before.plansCompleted + 1} completed`);
      await expect(dashboardPlan(page, PLAN)).toHaveCount(0); // completed plans leave "Active plans"

      const learning = metric(page, 'learning');
      await expect(learning).toHaveAttribute('data-milestones-total', String(before.milestonesTotal + 2));
      await expect(learning).toHaveAttribute('data-milestones-done', String(before.milestonesDone));
      await expect(learning).toHaveAttribute('data-in-progress', String(before.learningInProgress));

      if (before.tasksTotal === 0 && before.habitsActive === 0 && before.plansCompleted === 0) {
        // Fresh database: the absolute values are known too.
        await expect(tasks).toContainText('100%');
        await expect(habits).toContainText('1 / 1 done today');
        await expect(learning).toContainText('0 / 2 milestones done');
      }
    });

    expect(errors).toEqual([]);
  });

  test('DOD-1: the six-entry nav persists on every page and sub-route (1280 px and 375 px)', async ({ page }) => {
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 812 });
      await page.goto('/dashboard');
      await expect(h1(page)).toHaveText('Dashboard');
      for (const target of NAV) {
        const link = nav(page).getByRole('link', { name: target.label, exact: true });
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${target.path}$`));
        await expect(h1(page)).toHaveText(target.label);
        // On every page all six entries are present and visible, with exactly this one current.
        await expect(nav(page).getByRole('link')).toHaveText(NAV.map((n) => n.label));
        for (const n of NAV) await expect(nav(page).getByRole('link', { name: n.label, exact: true })).toBeVisible();
        await expect(nav(page).locator('[aria-current="page"]')).toHaveText(target.label);
      }
      // Sub-route: the plan builder keeps the nav, and the nav leads back out of it.
      await goVia(page, 'Todo Plans');
      await header(page).getByRole('link', { name: 'Create Plan' }).click();
      await expect(h1(page)).toHaveText('Create Plan');
      await expect(nav(page).getByRole('link')).toHaveCount(6);
      await nav(page).getByRole('link', { name: 'Habits', exact: true }).click();
      await expect(h1(page)).toHaveText('Habits');
    }
  });

  test('DOD-2 / NFR-U1: add and remove a task, habit, learning card and plan on their own pages', async ({ page, request }) => {
    test.setTimeout(90_000);
    const TASK = `${RUN} add-remove task`;
    const HABIT = `${RUN} add-remove habit`;
    const CARD = `${RUN} add-remove card`;
    const PLAN = `${RUN} add-remove plan`;
    await page.goto('/dashboard');

    // Task
    await goVia(page, 'Tasks');
    await addTaskOnTasksPage(page, TASK);
    await taskRow(page, TASK).getByRole('button', { name: `Delete ${TASK}` }).click();
    await page.getByRole('dialog', { name: 'Delete task?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(toast(page, 'Task deleted')).toBeVisible();
    await expect(taskRow(page, TASK)).toHaveCount(0);

    // Habit
    await goVia(page, 'Habits');
    await addHabitOnHabitsPage(page, HABIT);
    await habitCard(page, HABIT).getByRole('button', { name: `Remove ${HABIT}` }).click();
    await page.getByRole('dialog', { name: 'Remove habit?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(toast(page, 'Habit removed')).toBeVisible();
    await expect(habitCard(page, HABIT)).toHaveCount(0);

    // Learning card (kept until the plan is removed: the plan is built from it)
    await goVia(page, 'Learning Resources');
    await addCardOnLearningPage(page, CARD);

    // Plan (builder defaults: next full hour, one hour long)
    await goVia(page, 'Todo Plans');
    await header(page).getByRole('link', { name: 'Create Plan' }).click();
    await page.getByLabel('Title').fill(PLAN);
    await pick(page, 'LearningResource', CARD);
    await page.getByRole('button', { name: 'Create Plan' }).click();
    await expect(page).toHaveURL(/\/plans$/);
    await expect(toast(page, 'Plan created')).toBeVisible();
    await expect(planEntry(page, PLAN)).toBeVisible();
    await page.getByRole('button', { name: `Remove ${PLAN}` }).click();
    await page.getByRole('dialog', { name: 'Remove plan?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(toast(page, 'Plan removed')).toBeVisible();
    await expect(planEntry(page, PLAN)).toHaveCount(0);

    // Remove the learning card
    await goVia(page, 'Learning Resources');
    await learningCard(page, CARD).getByRole('button', { name: `Remove ${CARD}` }).click();
    await page.getByRole('dialog', { name: 'Remove learning card?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(toast(page, 'Learning card removed')).toBeVisible();
    await expect(learningCard(page, CARD)).toHaveCount(0);

    // Gone after reloading each page, and gone in the API.
    for (const [path, locator] of [
      ['/tasks', taskRow(page, TASK)],
      ['/habits', habitCard(page, HABIT)],
      ['/learning', learningCard(page, CARD)],
      ['/plans', planEntry(page, PLAN)],
    ] as const) {
      await page.goto(path);
      await expect(h1(page)).toBeVisible();
      await expect(page.getByTestId('loading-state')).toHaveCount(0);
      await expect(locator).toHaveCount(0);
    }
    const leftovers = [
      ...((await (await request.get(`${API}/api/tasks`, { params: { search: TASK, today: TODAY } })).json()) as unknown[]),
      ...((await (await request.get(`${API}/api/habits?today=${TODAY}`)).json()) as { name: string }[]).filter((h) => h.name === HABIT),
      ...((await (await request.get(`${API}/api/learning-cards`)).json()) as { title: string }[]).filter((c) => c.title === CARD),
      ...((await (await request.get(`${API}/api/plans`)).json()) as { title: string }[]).filter((p) => p.title === PLAN),
    ];
    expect(leftovers).toEqual([]);
  });

  test('DOD-5 / AC-P5/P6: a plan starting shortly, watched from the Dashboard', async ({ page, request }) => {
    test.setTimeout(240_000);
    const CARD = `${RUN} live card`;
    const PLAN = `${RUN} live plan`;
    const cardRes = await request.post(`${API}/api/learning-cards`, { data: { title: CARD, description: null } });
    expect(cardRes.status()).toBe(201);
    const cardId = (await cardRes.json()).id as number;
    const start = Date.now() + 35_000;
    const planRes = await request.post(`${API}/api/plans`, {
      data: {
        title: PLAN,
        estimatedDurationMinutes: 30,
        startDateTime: new Date(start).toISOString(),
        endDateTime: new Date(start + 30 * MIN).toISOString(),
        priorityOrder: 1,
        items: [{ sourceType: 'LearningResource', sourceId: cardId }],
      },
    });
    expect(planRes.status(), await planRes.text()).toBe(201);
    expect((await planRes.json()).status).toBe('NotStarted');

    // Before the start: counted as upcoming, not listed under the dashboard's active plans.
    const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/dashboard' && r.status() === 200);
    await page.goto('/dashboard');
    await loaded;
    const plans = metric(page, 'plans');
    await expect(plans).toBeVisible();
    const inProgress = await num(plans, 'data-in-progress');
    const upcoming = await num(plans, 'data-upcoming');
    expect(upcoming).toBeGreaterThanOrEqual(1);
    await expect(dashboardPlan(page, PLAN)).toHaveCount(0);

    // The start: notification on the Dashboard (AC-P5), which then shows the plan as active.
    await expect(toast(page, `Plan '${PLAN}' has started`)).toBeVisible({ timeout: 180_000 });
    expect(new URL(page.url()).pathname).toBe('/dashboard');
    const row = dashboardPlan(page, PLAN);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByTestId('plan-status')).toHaveText('In progress');
    await expect(row.getByTestId('plan-progress-text')).toHaveText('0% · 0/1');
    await expect(plans).toHaveAttribute('data-in-progress', String(inProgress + 1));
    await expect(plans).toHaveAttribute('data-upcoming', String(upcoming - 1));

    // Rest time counts down (AC-P6): about 30 minutes left, decreasing between observations.
    const rest = row.getByTestId('plan-rest-time');
    await expect(rest.locator('.rest__value')).toHaveText(/^00:(29|30):\d{2}$/);
    const first = await num(rest, 'data-seconds');
    expect(first).toBeGreaterThan(28 * 60);
    expect(first).toBeLessThanOrEqual(30 * 60);
    await expect.poll(async () => num(rest, 'data-seconds'), { timeout: 10_000 }).toBeLessThan(first - 1);

    // Item completion drives the plan and the dashboard (DOD-5): done on Todo Plans → gone from active plans.
    await goVia(page, 'Todo Plans');
    const entry = planEntry(page, PLAN);
    await expect(inGroup(page, 'plans-active', PLAN)).toBeVisible();
    await entry.getByRole('checkbox', { name: `Mark ${CARD} as done` }).check();
    await expect(inGroup(page, 'plans-completed', PLAN)).toBeVisible();
    await expect(entry.getByTestId('plan-progress-text')).toHaveText('100% · 1/1');
    await navToDashboard(page);
    await expect(dashboardPlan(page, PLAN)).toHaveCount(0);
    await expect(plans).toHaveAttribute('data-in-progress', String(inProgress));
  });
});
