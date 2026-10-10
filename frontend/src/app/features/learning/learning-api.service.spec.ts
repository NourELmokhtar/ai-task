import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { ApiError } from '../../core/api/api-error';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { LearningApi } from './learning-api.service';
import { makeCard, makeDetail, makeMilestone, makeNote } from './testing/learning-fixtures';

const BASE = 'http://api.test';
const CARDS = `${BASE}/api/learning-cards`;

describe('LearningApi', () => {
  let api: LearningApi;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: `${BASE}/` },
      ],
    });
    api = TestBed.inject(LearningApi);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('list omits status by default (all cards)', () => {
    api.list().subscribe();
    const req = ctrl.expectOne((r) => r.url === CARDS);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('list omits an empty status and passes a set one', () => {
    api.list({ status: '' }).subscribe();
    expect(ctrl.expectOne((r) => r.url === CARDS).request.params.has('status')).toBeFalse();
    api.list({ status: 'InProgress' }).subscribe();
    ctrl.expectOne(`${CARDS}?status=InProgress`).flush([]);
  });

  const cases: { name: string; call: (a: LearningApi) => unknown; method: string; url: string; body?: unknown }[] = [
    { name: 'get', call: (a) => a.get(5).subscribe(), method: 'GET', url: '/5' },
    {
      name: 'create',
      call: (a) => a.create({ title: 'T', description: null }).subscribe(),
      method: 'POST',
      url: '',
      body: { title: 'T', description: null },
    },
    {
      name: 'update',
      call: (a) => a.update(5, { title: 'T', description: 'D', status: 'Completed' }).subscribe(),
      method: 'PUT',
      url: '/5',
      body: { title: 'T', description: 'D', status: 'Completed' },
    },
    { name: 'delete', call: (a) => a.delete(5).subscribe(), method: 'DELETE', url: '/5' },
    {
      name: 'addMilestone',
      call: (a) => a.addMilestone(5, { title: 'M', targetDate: '2026-10-20' }).subscribe(),
      method: 'POST',
      url: '/5/milestones',
      body: { title: 'M', targetDate: '2026-10-20' },
    },
    {
      name: 'updateMilestone',
      call: (a) => a.updateMilestone(5, 7, { title: 'M', targetDate: null, isDone: true }).subscribe(),
      method: 'PUT',
      url: '/5/milestones/7',
      body: { title: 'M', targetDate: null, isDone: true },
    },
    { name: 'deleteMilestone', call: (a) => a.deleteMilestone(5, 7).subscribe(), method: 'DELETE', url: '/5/milestones/7' },
    {
      name: 'addNote',
      call: (a) => a.addNote(5, { text: 'N' }).subscribe(),
      method: 'POST',
      url: '/5/notes',
      body: { text: 'N' },
    },
    { name: 'deleteNote', call: (a) => a.deleteNote(5, 9).subscribe(), method: 'DELETE', url: '/5/notes/9' },
  ];

  for (const c of cases) {
    it(`${c.name} calls ${c.method} /api/learning-cards${c.url}`, () => {
      c.call(api);
      const req = ctrl.expectOne(`${CARDS}${c.url}`);
      expect(req.request.method).toBe(c.method);
      if (c.body !== undefined) expect(req.request.body).toEqual(c.body);
      req.flush(c.method === 'DELETE' ? null : {});
    });
  }

  it('setStatus PUTs the current title and description with the new status', () => {
    const card = makeCard({ id: 3, title: 'Clean Code', description: 'Book by Robert C. Martin', status: 'NotStarted' });
    let result: unknown;
    api.setStatus(card, 'InProgress').subscribe((r) => (result = r));
    const req = ctrl.expectOne(`${CARDS}/3`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ title: 'Clean Code', description: 'Book by Robert C. Martin', status: 'InProgress' });
    const saved = makeDetail({ id: 3, status: 'InProgress' });
    req.flush(saved);
    expect(result).toEqual(saved);
  });

  it('setStatus keeps a null description as null (explicitly sent)', () => {
    api.setStatus(makeCard({ id: 3, title: 'T', description: null }), 'Completed').subscribe();
    const req = ctrl.expectOne(`${CARDS}/3`);
    expect(req.request.body).toEqual({ title: 'T', description: null, status: 'Completed' });
    expect('description' in req.request.body).toBeTrue();
    req.flush(makeDetail());
  });

  it('setMilestoneDone PUTs the current title and targetDate with the new isDone', () => {
    const m = makeMilestone({ id: 7, learningCardId: 3, title: 'Chapters 1-5', targetDate: '2026-10-20', isDone: false });
    api.setMilestoneDone(m, true).subscribe();
    const req = ctrl.expectOne(`${CARDS}/3/milestones/7`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ title: 'Chapters 1-5', targetDate: '2026-10-20', isDone: true });
    req.flush(makeMilestone({ ...m, isDone: true, completedAt: '2026-10-10T15:53:14Z' }));
  });

  it('setMilestoneDone(false) un-completes and keeps a null targetDate', () => {
    const m = makeMilestone({ id: 7, learningCardId: 3, title: 'Read', targetDate: null, isDone: true });
    api.setMilestoneDone(m, false).subscribe();
    const req = ctrl.expectOne(`${CARDS}/3/milestones/7`);
    expect(req.request.body).toEqual({ title: 'Read', targetDate: null, isDone: false });
    req.flush(makeMilestone({ ...m, isDone: false }));
  });

  it('maps a 404 to an ApiError with the detail', () => {
    let error: ApiError | undefined;
    api.addNote(2, { text: 'x' }).subscribe({ error: (e) => (error = e) });
    ctrl.expectOne(`${CARDS}/2/notes`).flush(
      { title: 'Not Found', status: 404, detail: "Learning card with id '2' was not found." },
      { status: 404, statusText: 'Not Found' },
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error!.isNotFound).toBeTrue();
    expect(error!.message).toBe("Learning card with id '2' was not found.");
  });

  it('returns the created note', () => {
    let note: unknown;
    api.addNote(2, { text: 'x' }).subscribe((n) => (note = n));
    ctrl.expectOne(`${CARDS}/2/notes`).flush(makeNote({ id: 4 }), { status: 201, statusText: 'Created' });
    expect(note).toEqual(makeNote({ id: 4 }));
  });
});
