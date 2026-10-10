import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

/**
 * M04 Learning Resources: spec scenarios 1–7 (+ error-state extra). Needs the API on
 * http://localhost:5080. The DB is shared, so every card created here has a unique run prefix and
 * is deleted in afterAll; the empty state is checked with a stubbed empty list.
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M04-${Date.now().toString(36)}`;
const TITLE = `${RUN} Clean Code`;
const DESCRIPTION = 'Book by Robert C. Martin';
const MS1 = `${RUN} Chapters 1-5`;
const MS2 = `${RUN} Chapters 6-10`;
const NOTE = `${RUN} Functions should do one thing.`;
const TARGET = '2026-11-20';

interface Milestone {
  id: number;
  title: string;
  isDone: boolean;
  targetDate: string | null;
  completedAt: string | null;
}
interface CardDetail {
  id: number;
  title: string;
  description: string | null;
  status: string;
  milestonesTotal: number;
  milestonesDone: number;
  milestones: Milestone[];
  notes: { id: number; text: string; createdAt: string }[];
}

async function apiGet(request: APIRequestContext, id: number): Promise<CardDetail> {
  const res = await request.get(`${API}/api/learning-cards/${id}`);
  expect(res.status()).toBe(200);
  return res.json();
}

const card = (page: Page): Locator =>
  page.getByTestId('learning-card').filter({ has: page.getByRole('heading', { name: TITLE, exact: true }) });
const toast = (page: Page, text: string) => page.getByTestId('toast-host').getByText(text);
const cardId = async (page: Page) => Number(await card(page).getAttribute('data-card-id'));
const milestone = (page: Page, title: string) =>
  card(page).getByTestId('milestone').filter({ hasText: title });

async function openLearning(page: Page) {
  await page.goto('/learning');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learning Resources');
}

async function expand(page: Page) {
  await card(page).getByRole('button', { name: 'Show details' }).click();
  await expect(card(page).getByTestId('learning-card-details')).toBeVisible();
  await expect(card(page).getByRole('heading', { name: 'Milestones' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('M04 learning resources', () => {
  test.afterAll(async ({ request }) => {
    const res = await request.get(`${API}/api/learning-cards`);
    if (!res.ok()) return;
    for (const c of (await res.json()) as CardDetail[]) {
      if (c.title.startsWith(RUN)) await request.delete(`${API}/api/learning-cards/${c.id}`);
    }
  });

  test('1. page loads; an empty list shows the "Add Learning Card" empty state', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    // Real API: the list request succeeds, without a status filter.
    const list = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/learning-cards');
    await openLearning(page);
    const res = await list;
    expect(res.status()).toBe(200);
    expect(new URL(res.url()).searchParams.has('status')).toBe(false);
    expect(errors).toEqual([]);

    // Fresh DB (stubbed empty list): empty state with an "Add Learning Card" call to action.
    await page.route(
      (u) => u.pathname === '/api/learning-cards',
      (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback()),
    );
    await page.reload();
    const empty = page.getByTestId('empty-state');
    await expect(empty).toContainText('No learning cards yet');
    await empty.getByRole('button', { name: 'Add Learning Card' }).click();
    await expect(page.getByRole('dialog', { name: 'Add Learning Card' })).toBeVisible();
  });

  test('2. add a card → it appears in the grid; an empty title shows a validation error', async ({ page, request }) => {
    await openLearning(page);
    await page.locator('.page-header').getByRole('button', { name: 'Add Learning Card' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Learning Card' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Add Learning Card' }).click();
    await expect(dialog.getByText('Title is required.')).toBeVisible();
    await dialog.getByLabel('Title').fill('   ');
    await dialog.getByRole('button', { name: 'Add Learning Card' }).click();
    await expect(dialog.getByText('Title is required.')).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Title').fill(TITLE);
    await dialog.getByLabel('Description or source').fill(DESCRIPTION);
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/learning-cards');
    await dialog.getByRole('button', { name: 'Add Learning Card' }).click();
    expect((await created).status()).toBe(201);
    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Learning card created')).toBeVisible();

    const c = card(page);
    await expect(c).toBeVisible();
    await expect(c).toContainText(DESCRIPTION);
    await expect(c.getByTestId('learning-status')).toHaveText('Not started');
    await expect(c.getByTestId('milestone-progress')).toHaveText('No milestones yet');
    await expect(c.getByRole('combobox', { name: `Status of ${TITLE}` })).toHaveValue('NotStarted');

    const api = await apiGet(request, await cardId(page));
    expect(api).toMatchObject({ title: TITLE, description: DESCRIPTION, status: 'NotStarted', milestonesTotal: 0 });

    // Still there after a reload.
    await page.reload();
    await expect(card(page)).toBeVisible();
  });

  test('3. expand the card → add two milestones → counter shows 0/2', async ({ page, request }) => {
    await openLearning(page);
    await expand(page);
    const c = card(page);
    await expect(c.getByTestId('milestones-empty')).toBeVisible();
    await expect(c.getByTestId('notes-empty')).toBeVisible();

    // Client validation: empty milestone title.
    await c.getByRole('button', { name: 'Add milestone' }).click();
    await expect(c.getByRole('form', { name: 'Add milestone' }).getByText('Title is required.')).toBeVisible();

    await c.getByLabel('New milestone').fill(MS1);
    await c.getByLabel('Target date (optional)').fill(TARGET);
    await c.getByRole('button', { name: 'Add milestone' }).click();
    await expect(milestone(page, MS1)).toBeVisible();
    await expect(c.getByTestId('milestone-progress')).toContainText('0/1');
    await expect(c.getByLabel('New milestone')).toHaveValue('');

    await c.getByLabel('New milestone').fill(MS2);
    await c.getByRole('button', { name: 'Add milestone' }).click();
    await expect(milestone(page, MS2)).toBeVisible();

    await expect(c.getByTestId('milestone-progress')).toContainText('0/2');
    await expect(c.getByTestId('milestone')).toHaveCount(2);
    await expect(milestone(page, MS1).getByTestId('milestone-target')).toContainText('2026');
    await expect(milestone(page, MS2).getByTestId('milestone-target')).toHaveCount(0);
    await expect(c.getByTestId('milestones-empty')).toHaveCount(0);

    const api = await apiGet(request, await cardId(page));
    expect(api.milestonesTotal).toBe(2);
    expect(api.milestonesDone).toBe(0);
    expect(api.milestones.map((m) => [m.title, m.targetDate])).toEqual([
      [MS1, TARGET],
      [MS2, null],
    ]);
  });

  test('4. complete one milestone → 1/2; remove a milestone → removed', async ({ page, request }) => {
    await openLearning(page);
    await expect(card(page).getByTestId('milestone-progress')).toContainText('0/2');
    await expand(page);
    const c = card(page);

    const box = c.getByRole('checkbox', { name: `Mark ${MS1} as done` });
    await expect(box).not.toBeChecked();
    const put = page.waitForRequest((r) => r.method() === 'PUT' && /\/milestones\/\d+$/.test(r.url()));
    await box.check();
    expect((await put).postDataJSON()).toEqual({ title: MS1, targetDate: TARGET, isDone: true });
    await expect(c.getByTestId('milestone-progress')).toContainText('1/2');
    await expect(box).toBeChecked();
    await expect(toast(page, 'Milestone completed')).toBeVisible();

    const id = await cardId(page);
    let api = await apiGet(request, id);
    const done = api.milestones.find((m) => m.title === MS1)!;
    expect(done.isDone).toBe(true);
    expect(done.completedAt).not.toBeNull();
    expect(done.targetDate).toBe(TARGET); // title and target date were kept by the full PUT
    expect(api.milestonesDone).toBe(1);

    // Survives a reload (collapsed counter comes from the list).
    await page.reload();
    await expect(card(page).getByTestId('milestone-progress')).toContainText('1/2');
    await expand(page);

    // Remove the other milestone.
    await c.getByRole('button', { name: `Remove milestone ${MS2}` }).click();
    await expect(milestone(page, MS2)).toHaveCount(0);
    await expect(toast(page, 'Milestone removed')).toBeVisible();
    await expect(c.getByTestId('milestone-progress')).toContainText('1/1');
    api = await apiGet(request, id);
    expect(api.milestones.map((m) => m.title)).toEqual([MS1]);
  });

  test('5. add a note → text + local timestamp; remove the note → removed', async ({ page, request }) => {
    await openLearning(page);
    await expand(page);
    const c = card(page);

    await c.getByRole('button', { name: 'Add note' }).click();
    await expect(c.getByRole('form', { name: 'Add note' }).getByText('Text is required.')).toBeVisible();

    await c.getByLabel('New note').fill(`  ${NOTE}  `);
    await c.getByRole('button', { name: 'Add note' }).click();
    const note = c.getByTestId('note').filter({ hasText: NOTE });
    await expect(note).toBeVisible();
    await expect(toast(page, 'Note added')).toBeVisible();
    await expect(c.getByTestId('notes-empty')).toHaveCount(0);

    const api = await apiGet(request, await cardId(page));
    expect(api.notes.map((n) => n.text)).toEqual([NOTE]);
    const createdAt = api.notes[0].createdAt;
    const time = note.getByTestId('note-time');
    await expect(time).toHaveAttribute('datetime', createdAt);
    const expected = await page.evaluate(
      (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
      createdAt,
    );
    await expect(time).toHaveText(expected);

    await note.getByRole('button', { name: /^Remove note/ }).click();
    await expect(c.getByTestId('note')).toHaveCount(0);
    await expect(c.getByTestId('notes-empty')).toBeVisible();
    await expect(toast(page, 'Note removed')).toBeVisible();
    expect((await apiGet(request, await cardId(page))).notes).toEqual([]);
  });

  test('6. change status → badge updates (description kept)', async ({ page, request }) => {
    await openLearning(page);
    const c = card(page);
    const select = c.getByRole('combobox', { name: `Status of ${TITLE}` });
    const put = page.waitForRequest((r) => r.method() === 'PUT' && /\/api\/learning-cards\/\d+$/.test(r.url()));
    await select.selectOption('InProgress');
    expect((await put).postDataJSON()).toEqual({ title: TITLE, description: DESCRIPTION, status: 'InProgress' });
    await expect(c.getByTestId('learning-status')).toHaveText('In progress');
    await expect(toast(page, 'Status changed to In progress')).toBeVisible();

    await select.selectOption('Completed');
    await expect(c.getByTestId('learning-status')).toHaveText('Completed');

    const api = await apiGet(request, await cardId(page));
    expect(api).toMatchObject({ status: 'Completed', description: DESCRIPTION, title: TITLE });

    await page.reload();
    await expect(card(page).getByTestId('learning-status')).toHaveText('Completed');
    await expect(card(page).getByRole('combobox', { name: `Status of ${TITLE}` })).toHaveValue('Completed');
  });

  test('7. remove the card with confirmation → gone', async ({ page, request }) => {
    await openLearning(page);
    const id = await cardId(page);

    await card(page).getByRole('button', { name: `Remove ${TITLE}` }).click();
    let confirm = page.getByRole('dialog', { name: 'Remove learning card?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(TITLE);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(card(page)).toBeVisible();

    await card(page).getByRole('button', { name: `Remove ${TITLE}` }).click();
    confirm = page.getByRole('dialog', { name: 'Remove learning card?' });
    await confirm.getByRole('button', { name: 'Remove' }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(toast(page, 'Learning card removed')).toBeVisible();

    expect((await request.get(`${API}/api/learning-cards/${id}`)).status()).toBe(404);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learning Resources');
    await expect(card(page)).toHaveCount(0);
  });

  test('extra: a failing list shows the error state and "Try again" recovers', async ({ page }) => {
    let fail = true;
    await page.route(
      (u) => u.pathname === '/api/learning-cards',
      (route) =>
        fail && route.request().method() === 'GET'
          ? route.fulfill({ status: 500, json: { title: 'Server error', status: 500, detail: 'Simulated failure' } })
          : route.fallback(),
    );
    await openLearning(page);
    const error = page.getByTestId('error-state');
    await expect(error).toContainText("Couldn't load learning cards");
    await expect(error).toContainText('Simulated failure');
    fail = false;
    await error.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('error-state')).toHaveCount(0);
  });
});
