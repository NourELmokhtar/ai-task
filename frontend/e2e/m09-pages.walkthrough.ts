import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * M09 F8: screenshot walkthrough of the six pages at 1280 px and 375 px (not part of the spec suite).
 * Run with `npm run e2e:screenshots` (resets quickflow_e2e, starts both servers, matches *.walkthrough.ts).
 * Output: $QF_SCREENSHOT_DIR (default `e2e-screenshots/`, relative to frontend/).
 *
 * Demo data is seeded through the API so the pages are not empty, then deleted again; settings are restored.
 */

const API = 'http://localhost:5080';
const DEFAULTS = { displayName: null, planStartNotificationsEnabled: true, defaultView: 'Dashboard' };
const OUT = resolve(process.cwd(), process.env['QF_SCREENSHOT_DIR'] ?? 'e2e-screenshots');
const MIN = 60_000;

const PAGES = [
  { slug: '1-dashboard', path: '/dashboard', h1: 'Dashboard' },
  { slug: '2-tasks', path: '/tasks', h1: 'Tasks' },
  { slug: '3-habits', path: '/habits', h1: 'Habits' },
  { slug: '4-learning', path: '/learning', h1: 'Learning Resources' },
  { slug: '5-plans', path: '/plans', h1: 'Todo Plans' },
  { slug: '6-settings', path: '/settings', h1: 'Settings' },
];
const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

const pad = (n: number) => String(n).padStart(2, '0');
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const TODAY = localDate(0);

async function post<T = { id: number }>(request: APIRequestContext, path: string, data?: object): Promise<T> {
  const res = await request.post(`${API}${path}`, data === undefined ? {} : { data });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

const seeded = { tasks: [] as number[], habits: [] as number[], cards: [] as number[], plans: [] as number[] };

async function seed(request: APIRequestContext) {
  await request.put(`${API}/api/settings`, { data: { ...DEFAULTS, displayName: 'Alex' } });
  const t1 = await post(request, `/api/tasks?today=${TODAY}`, { title: 'Write the weekly report', priority: 'High', dueDate: TODAY });
  const t2 = await post(request, `/api/tasks?today=${TODAY}`, { title: 'Review pull requests', priority: 'Medium', dueDate: TODAY });
  const t3 = await post(request, `/api/tasks?today=${TODAY}`, { title: 'Renew the domain', priority: 'Low', dueDate: localDate(-1) });
  const t4 = await post(request, `/api/tasks?today=${TODAY}`, { title: 'Plan the team offsite', description: 'Venue, agenda, budget', priority: 'Medium', dueDate: localDate(7) });
  seeded.tasks.push(t1.id, t2.id, t3.id, t4.id);
  expect((await request.post(`${API}/api/tasks/${t2.id}/complete?today=${TODAY}`)).ok()).toBe(true);
  const h1 = await post(request, `/api/habits?today=${TODAY}`, { name: 'Drink 8 glasses of water', description: null, frequency: 'Daily' });
  const h2 = await post(request, `/api/habits?today=${TODAY}`, { name: 'Read 20 minutes', description: null, frequency: 'Daily' });
  const h3 = await post(request, `/api/habits?today=${TODAY}`, { name: 'Long run', description: 'At least 10 km', frequency: 'Weekly' });
  seeded.habits.push(h1.id, h2.id, h3.id);
  await post(request, `/api/habits/${h1.id}/completions?today=${TODAY}`);
  const c1 = await post(request, '/api/learning-cards', { title: 'Clean Code', description: 'Book by Robert C. Martin' });
  const c2 = await post(request, '/api/learning-cards', { title: 'Angular Signals', description: 'angular.dev guide' });
  seeded.cards.push(c1.id, c2.id);
  const m1 = await post(request, `/api/learning-cards/${c1.id}/milestones`, { title: 'Chapters 1-5', targetDate: null });
  await post(request, `/api/learning-cards/${c1.id}/milestones`, { title: 'Chapters 6-10', targetDate: localDate(14) });
  await request.put(`${API}/api/learning-cards/${c1.id}/milestones/${m1.id}`, { data: { title: 'Chapters 1-5', targetDate: null, isDone: true } });
  await request.put(`${API}/api/learning-cards/${c1.id}`, { data: { title: 'Clean Code', description: 'Book by Robert C. Martin', status: 'InProgress' } });
  await post(request, `/api/learning-cards/${c1.id}/notes`, { text: 'Functions should do one thing.' });
  const now = Date.now();
  const p1 = await post(request, '/api/plans', {
    title: 'Morning focus block',
    estimatedDurationMinutes: 90,
    startDateTime: new Date(now - 20 * MIN).toISOString(),
    endDateTime: new Date(now + 70 * MIN).toISOString(),
    priorityOrder: 1,
    items: [
      { sourceType: 'Task', sourceId: t1.id },
      { sourceType: 'Habit', sourceId: h2.id },
      { sourceType: 'LearningResource', sourceId: c1.id },
    ],
  });
  const p2 = await post(request, '/api/plans', {
    title: 'Evening study',
    estimatedDurationMinutes: 60,
    startDateTime: new Date(now + 8 * 60 * MIN).toISOString(),
    endDateTime: new Date(now + 9 * 60 * MIN).toISOString(),
    priorityOrder: 2,
    items: [{ sourceType: 'LearningResource', sourceId: c2.id }],
  });
  seeded.plans.push(p1.id, p2.id);
  return seeded.plans;
}

async function cleanup(request: APIRequestContext) {
  for (const id of seeded.plans) await request.delete(`${API}/api/plans/${id}`);
  for (const id of seeded.tasks) await request.delete(`${API}/api/tasks/${id}`);
  for (const id of seeded.habits) await request.delete(`${API}/api/habits/${id}`);
  for (const id of seeded.cards) await request.delete(`${API}/api/learning-cards/${id}`);
  await request.put(`${API}/api/settings`, { data: DEFAULTS });
}

async function settle(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  await expect(page.getByTestId('loading-state')).toHaveCount(0);
  if (path === '/learning') {
    await page.getByRole('button', { name: 'Show details for Clean Code' }).click();
    await expect(page.getByTestId('learning-card-details')).toBeVisible();
  }
  if (path === '/dashboard') await expect(page.getByTestId('metric-tasks')).toBeVisible();
  await page.waitForTimeout(300);
}

test.describe('M09 screenshot walkthrough', () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test('six pages at 1280 px and 375 px', async ({ page, request }) => {
    try {
      const planIds = await seed(request);
      // Mark the seeded plans as already notified so no start toast covers the screenshots.
      await page.addInitScript((ids) => localStorage.setItem('quickflow.plans.startNotified', JSON.stringify(ids)), planIds);
      for (const size of WIDTHS) {
        await page.setViewportSize(size);
        for (const p of PAGES) {
          await settle(page, p.path, p.h1);
          await page.screenshot({ path: resolve(OUT, `${p.slug}-${size.width}.png`), fullPage: true, animations: 'disabled' });
        }
      }
    } finally {
      await cleanup(request);
    }
  });
});
