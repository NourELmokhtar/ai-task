import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

/**
 * M02 Tasks: spec scenarios 1–8. Needs the API on http://localhost:5080 (shared DB, so every task
 * created here has a unique run prefix and is soft-deleted in afterAll).
 */

const API = 'http://localhost:5080';
const RUN = `E2E-M02-${Date.now().toString(36)}`;

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const TODAY = localDate(0);
const YESTERDAY = localDate(-1);

interface TaskDto {
  id: number;
  title: string;
  status: string;
  isArchived: boolean;
  isOverdue: boolean;
  completedAt: string | null;
}

async function apiCreate(request: APIRequestContext, data: Record<string, unknown>): Promise<TaskDto> {
  const res = await request.post(`${API}/api/tasks?today=${TODAY}`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

async function apiGet(request: APIRequestContext, id: number) {
  return request.get(`${API}/api/tasks/${id}?today=${TODAY}`);
}

const toolbar = (page: Page) => page.getByRole('search', { name: 'Filter tasks' });
const rows = (page: Page) => page.getByTestId('task-item');
const row = (page: Page, title: string): Locator =>
  rows(page).filter({ has: page.getByText(title, { exact: true }) });
const toast = (page: Page, text: string) => page.getByTestId('toast-host').getByText(text);

async function search(page: Page, text: string) {
  await toolbar(page).getByLabel('Search').fill(text);
}

/** Opens /tasks and narrows the list to this run's tasks. */
async function openTasks(page: Page, searchText = RUN) {
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
  if (searchText) await search(page, searchText);
}

test.describe.configure({ mode: 'serial' });

test.describe('M02 tasks', () => {
  test.afterAll(async ({ request }) => {
    for (const archived of [false, true]) {
      const res = await request.get(`${API}/api/tasks`, { params: { search: RUN, archived: String(archived) } });
      if (!res.ok()) continue;
      for (const t of (await res.json()) as TaskDto[]) await request.delete(`${API}/api/tasks/${t.id}`);
    }
  });

  test('1. page loads; empty list shows the "Add Task" empty state', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    // Real API: page loads and the list request succeeds with today's date.
    const list = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/tasks');
    await page.goto('/tasks');
    const res = await list;
    expect(res.status()).toBe(200);
    expect(new URL(res.url()).searchParams.get('today')).toBe(TODAY);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
    await expect(toolbar(page)).toBeVisible();
    expect(errors).toEqual([]);

    // Fresh DB (stubbed empty list): empty state with an "Add Task" call to action.
    await page.route(
      (url) => url.pathname === '/api/tasks',
      (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback()),
    );
    await page.reload();
    const empty = page.getByTestId('empty-state');
    await expect(empty).toContainText('No tasks yet');
    await empty.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.getByRole('dialog', { name: 'Add Task' })).toBeVisible();
  });

  test('2. create a task; an empty title shows a validation error', async ({ page }) => {
    const title = `${RUN} Alpha`;
    await openTasks(page);
    await page.locator('.page-header').getByRole('button', { name: 'Add Task' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Task' });
    await expect(dialog).toBeVisible();

    // Empty and whitespace-only titles are rejected on the client.
    await dialog.getByRole('button', { name: 'Add Task' }).click();
    await expect(dialog.getByText('Title is required.')).toBeVisible();
    await dialog.getByLabel('Title').fill('   ');
    await dialog.getByRole('button', { name: 'Add Task' }).click();
    await expect(dialog.getByText('Title is required.')).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Description').fill('First e2e task');
    await dialog.getByLabel('Priority').selectOption('High');
    await dialog.getByLabel('Due date').fill(localDate(5));
    await dialog.getByRole('button', { name: 'Add Task' }).click();

    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Task created')).toBeVisible();
    const r = row(page, title);
    await expect(r).toBeVisible();
    await expect(r.getByTestId('task-status')).toHaveText('To do');
    await expect(r.getByTestId('task-priority')).toHaveText('High priority');
    await expect(r.getByTestId('task-due')).toBeVisible();
    await expect(r).toContainText('First e2e task');
  });

  test('3. edit a task; changes are visible', async ({ page }) => {
    const before = `${RUN} Alpha`;
    const after = `${RUN} Alpha edited`;
    await openTasks(page);
    await row(page, before).getByRole('button', { name: `Edit ${before}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Task' });
    await expect(dialog.getByLabel('Title')).toHaveValue(before);
    await expect(dialog.getByLabel('Priority')).toHaveValue('High');
    await dialog.getByLabel('Title').fill(after);
    await dialog.getByLabel('Status').selectOption('InProgress');
    await dialog.getByLabel('Priority').selectOption('Low');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Task updated')).toBeVisible();
    const r = row(page, after);
    await expect(r.getByTestId('task-status')).toHaveText('In progress');
    await expect(r.getByTestId('task-priority')).toHaveText('Low priority');
    await expect(row(page, before)).toHaveCount(0);
  });

  test('4. complete via the checkbox (and un-complete)', async ({ page, request }) => {
    const title = `${RUN} Alpha edited`;
    await openTasks(page);
    const r = row(page, title);
    const box = r.getByRole('checkbox', { name: `Mark ${title} as done` });
    await expect(box).not.toBeChecked();

    await box.check();
    await expect(toast(page, 'Task completed')).toBeVisible();
    await expect(r.getByTestId('task-status')).toHaveText('Done');
    await expect(box).toBeChecked();
    const id = Number(await r.getAttribute('data-task-id'));
    const done = (await (await apiGet(request, id)).json()) as TaskDto;
    expect(done.status).toBe('Done');
    expect(done.completedAt).not.toBeNull();

    await box.uncheck();
    await expect(toast(page, 'Task marked as to do')).toBeVisible();
    await expect(r.getByTestId('task-status')).toHaveText('To do');
    await expect(box).not.toBeChecked();
    const undone = (await (await apiGet(request, id)).json()) as TaskDto;
    expect([undone.status, undone.completedAt]).toEqual(['Todo', null]);
  });

  test('5. archive hides the task; "Show archived" shows it; restore brings it back', async ({ page, request }) => {
    const title = `${RUN} Bravo archive`;
    await apiCreate(request, { title });
    await openTasks(page);
    await row(page, title).getByRole('button', { name: `Archive ${title}` }).click();
    await expect(toast(page, 'Task archived')).toBeVisible();
    await expect(row(page, title)).toHaveCount(0);

    const showArchived = toolbar(page).getByLabel('Show archived');
    await showArchived.check();
    const archivedRow = row(page, title);
    await expect(archivedRow).toBeVisible();
    await expect(archivedRow).toContainText('Archived');

    await archivedRow.getByRole('button', { name: `Restore ${title}` }).click();
    await expect(toast(page, 'Task restored')).toBeVisible();
    await expect(row(page, title)).toHaveCount(0); // archived view lists archived tasks only
    await showArchived.uncheck();
    await expect(row(page, title)).toBeVisible();
    await expect(row(page, title).getByRole('button', { name: `Archive ${title}` })).toBeVisible();
  });

  test('6. delete with confirmation removes the task', async ({ page, request }) => {
    const title = `${RUN} Charlie delete`;
    const created = await apiCreate(request, { title });
    await openTasks(page);

    // Cancel keeps it.
    await row(page, title).getByRole('button', { name: `Delete ${title}` }).click();
    let confirm = page.getByRole('dialog', { name: 'Delete task?' });
    await expect(confirm).toContainText(title);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(row(page, title)).toBeVisible();

    await row(page, title).getByRole('button', { name: `Delete ${title}` }).click();
    confirm = page.getByRole('dialog', { name: 'Delete task?' });
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(toast(page, 'Task deleted')).toBeVisible();
    await expect(row(page, title)).toHaveCount(0);
    expect((await apiGet(request, created.id)).status()).toBe(404);
  });

  test('7. search narrows the list; status and priority filters work', async ({ page, request }) => {
    const prefix = `${RUN} Filter`;
    await apiCreate(request, { title: `${prefix} Apple`, status: 'Todo', priority: 'Low' });
    await apiCreate(request, { title: `${prefix} Banana`, status: 'Done', priority: 'High' });
    await apiCreate(request, { title: `${prefix} Cherry`, status: 'InProgress', priority: 'High' });

    await openTasks(page, '');
    await search(page, prefix);
    await expect(rows(page)).toHaveCount(3);
    await search(page, `${prefix} ban`); // case-insensitive substring
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, `${prefix} Banana`)).toBeVisible();

    await search(page, prefix);
    await expect(rows(page)).toHaveCount(3);
    const status = toolbar(page).getByLabel('Status');
    const priority = toolbar(page).getByLabel('Priority');

    await status.selectOption('Done');
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, `${prefix} Banana`)).toBeVisible();
    await status.selectOption('InProgress');
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, `${prefix} Cherry`)).toBeVisible();

    await status.selectOption('');
    await priority.selectOption('High');
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, `${prefix} Apple`)).toHaveCount(0);
    await priority.selectOption('Low');
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, `${prefix} Apple`)).toBeVisible();

    // No results → "Clear filters" resets everything.
    await search(page, `${RUN}-no-such-task`);
    const empty = page.getByTestId('empty-state');
    await expect(empty).toContainText('No matching tasks');
    await empty.getByRole('button', { name: 'Clear filters' }).click();
    await expect(toolbar(page).getByLabel('Search')).toHaveValue('');
    await expect(priority).toHaveValue('');
    await expect(row(page, `${prefix} Apple`)).toBeVisible();
  });

  test('8. a task due yesterday is highlighted overdue and the Overdue filter shows it', async ({ page, request }) => {
    const overdueTitle = `${RUN} Delta overdue`;
    const created = await apiCreate(request, { title: overdueTitle, dueDate: YESTERDAY });
    expect(created.isOverdue).toBe(true);
    const futureTitle = `${RUN} Echo future`;
    await apiCreate(request, { title: futureTitle, dueDate: localDate(3) });

    await openTasks(page);
    const r = row(page, overdueTitle);
    await expect(r).toBeVisible();
    await expect(r).toHaveClass(/task--overdue/);
    await expect(r.getByTestId('task-overdue')).toHaveText('Overdue');
    await expect(row(page, futureTitle).getByTestId('task-overdue')).toHaveCount(0);
    await expect(row(page, futureTitle)).not.toHaveClass(/task--overdue/);

    const listReq = page.waitForRequest((req) => new URL(req.url()).searchParams.get('overdue') === 'true');
    await toolbar(page).getByLabel('Due', { exact: true }).selectOption('overdue');
    const url = new URL((await listReq).url());
    expect(url.searchParams.get('today')).toBe(TODAY);
    await expect(row(page, overdueTitle)).toBeVisible();
    await expect(row(page, futureTitle)).toHaveCount(0);
    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);
    await expect(rows(page).getByTestId('task-overdue')).toHaveCount(count);

    // "Due today" sends dueFrom=dueTo=today and excludes both tasks.
    await toolbar(page).getByLabel('Due', { exact: true }).selectOption('today');
    await expect(row(page, overdueTitle)).toHaveCount(0);
  });

  test('extra: list error shows the error state and Retry recovers', async ({ page }) => {
    let fail = true;
    await page.route(
      (url) => url.pathname === '/api/tasks',
      (route) =>
        fail && route.request().method() === 'GET'
          ? route.fulfill({ status: 500, json: { title: 'Server exploded', status: 500 } })
          : route.fallback(),
    );
    await page.goto('/tasks');
    const error = page.getByTestId('error-state');
    await expect(error).toContainText("Couldn't load tasks");
    await expect(error).toContainText('Server exploded');
    fail = false;
    await error.getByRole('button', { name: 'Try again' }).click();
    await expect(error).toBeHidden();
    await expect(page.getByTestId('tasks-summary').or(page.getByTestId('empty-state'))).toBeVisible();
  });
});
