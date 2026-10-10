import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { ToastService } from '../../shared/toast/toast.service';
import { LearningPage } from './learning-page';
import { makeCard, makeDetail, makeMilestone, makeNote } from './testing/learning-fixtures';

describe('LearningPage', () => {
  let fixture: ComponentFixture<LearningPage>;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  const BASE = 'http://api.test/api/learning-cards';
  const el = () => fixture.nativeElement as HTMLElement;
  const expectList = (): TestRequest => ctrl.expectOne((r) => r.url === BASE && r.method === 'GET');
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>('[data-testid="learning-card"]'));
  const cardEl = (id: number) => el().querySelector<HTMLElement>(`[data-testid="learning-card"][data-card-id="${id}"]`)!;
  const q = <T extends HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;
  const messages = () => toast.toasts().map((t) => t.message);
  const typeInto = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(LearningPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    ctrl.verify();
    toast.clear();
  });

  /** Lists one card and expands it with the given detail. */
  function expand(detail = makeDetail({ id: 3, title: 'C' })) {
    expectList().flush([detail]);
    fixture.detectChanges();
    q<HTMLButtonElement>(cardEl(detail.id), 'button[aria-expanded]').click();
    fixture.detectChanges();
    expect(cardEl(detail.id).querySelector('[data-testid="loading-state"]')).not.toBeNull();
    ctrl.expectOne(`${BASE}/${detail.id}`).flush(detail);
    fixture.detectChanges();
    return cardEl(detail.id);
  }

  it('shows loading, then the "Add Learning Card" empty state', () => {
    expect(el().querySelector('[data-testid="loading-state"]')).not.toBeNull();
    const req = expectList();
    expect(req.request.params.has('status')).toBeFalse();
    req.flush([]);
    fixture.detectChanges();
    const empty = el().querySelector('[data-testid="empty-state"]')!;
    expect(empty.textContent).toContain('No learning cards yet');
    const cta = empty.querySelector('button')!;
    expect(cta.textContent).toContain('Add Learning Card');
    cta.click();
    fixture.detectChanges();
    expect(el().querySelector('dialog')!.open).toBeTrue();
  });

  it('renders cards with status badge, description and progress', () => {
    expectList().flush([
      makeCard({ id: 1, title: 'A', description: 'Book', milestonesTotal: 2, milestonesDone: 1, status: 'InProgress' }),
      makeCard({ id: 2, title: 'B', description: 'https://example.com/course' }),
    ]);
    fixture.detectChanges();
    expect(cards().map((c) => c.dataset['cardId'])).toEqual(['1', '2']);
    const a = cardEl(1);
    expect(q(a, '[data-testid="learning-status"]').textContent!.trim()).toBe('In progress');
    expect(q(a, '[data-testid="milestone-progress"]').textContent).toContain('1/2');
    expect(a.textContent).toContain('Book');
    expect(q<HTMLSelectElement>(a, 'select').value).toBe('InProgress');
    const b = cardEl(2);
    expect(q(b, '[data-testid="milestone-progress"]').textContent).toContain('No milestones yet');
    expect(q<HTMLAnchorElement>(b, 'a.lc__desc').href).toBe('https://example.com/course');
    expect(el().querySelector('[data-testid="learning-summary"]')!.textContent).toContain('2 cards · 1 in progress · 0 completed');
  });

  it('shows an error state with retry', () => {
    expectList().flush({ title: 'Server error', status: 500 }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const error = el().querySelector('[data-testid="error-state"]')!;
    expect(error.textContent).toContain("Couldn't load learning cards");
    error.querySelector('button')!.click();
    expectList().flush([]);
  });

  it('changing the status PUTs title, description and status, then updates the badge', () => {
    expectList().flush([makeCard({ id: 3, title: 'C', description: 'Keep me' })]);
    fixture.detectChanges();
    const select = q<HTMLSelectElement>(cardEl(3), 'select');
    select.value = 'InProgress';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(select.disabled).toBeTrue();

    const req = ctrl.expectOne(`${BASE}/3`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ title: 'C', description: 'Keep me', status: 'InProgress' });
    req.flush(makeDetail({ id: 3, title: 'C', description: 'Keep me', status: 'InProgress' }));
    fixture.detectChanges();
    expect(q(cardEl(3), '[data-testid="learning-status"]').textContent!.trim()).toBe('In progress');
    expect(messages()).toEqual(['Status changed to In progress']);
  });

  it('a failed status change reverts the select and toasts', () => {
    expectList().flush([makeCard({ id: 3, title: 'C' })]);
    fixture.detectChanges();
    const select = q<HTMLSelectElement>(cardEl(3), 'select');
    select.value = 'Completed';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    ctrl.expectOne(`${BASE}/3`).flush({ title: 'Server error', status: 500, detail: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(q<HTMLSelectElement>(cardEl(3), 'select').value).toBe('NotStarted');
    expect(q(cardEl(3), '[data-testid="learning-status"]').textContent!.trim()).toBe('Not started');
    expect(messages()[0]).toContain('boom');
  });

  it('remove asks for confirmation, then deletes the card', () => {
    expectList().flush([makeCard({ id: 3, title: 'C' })]);
    fixture.detectChanges();
    q<HTMLButtonElement>(cardEl(3), 'button[aria-label="Remove C"]').click();
    fixture.detectChanges();
    const dialogs = Array.from(el().querySelectorAll('dialog'));
    const confirm = dialogs.find((d) => d.open)!;
    expect(confirm.textContent).toContain('Remove learning card?');
    expect(confirm.textContent).toContain('"C"');
    Array.from(confirm.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Remove')!.click();
    fixture.detectChanges();
    const req = ctrl.expectOne(`${BASE}/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(cards().length).toBe(0);
    expect(messages()).toEqual(['Learning card removed']);
    expect(el().querySelector('[data-testid="empty-state"]')).not.toBeNull();
  });

  it('expanding shows the inline hints for a card without milestones and notes', () => {
    const card = expand();
    expect(card.querySelector('[data-testid="milestones-empty"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="notes-empty"]')).not.toBeNull();
  });

  it('adding a milestone validates the title, POSTs, then refetches the card counts', () => {
    const card = expand();
    const form = q<HTMLFormElement>(card, 'form[aria-label="Add milestone"]');
    q<HTMLButtonElement>(form, 'button[type="submit"]').click();
    fixture.detectChanges();
    expect(form.textContent).toContain('Title is required.');
    ctrl.expectNone(`${BASE}/3/milestones`);

    typeInto(q<HTMLInputElement>(form, 'input[type="text"]'), ' Chapters 1-5 ');
    typeInto(q<HTMLInputElement>(form, 'input[type="date"]'), '2026-10-20');
    q<HTMLButtonElement>(form, 'button[type="submit"]').click();
    const post = ctrl.expectOne(`${BASE}/3/milestones`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ title: 'Chapters 1-5', targetDate: '2026-10-20' });
    post.flush(makeMilestone({ id: 7, learningCardId: 3, title: 'Chapters 1-5', targetDate: '2026-10-20' }), {
      status: 201,
      statusText: 'Created',
    });
    const milestone = makeMilestone({ id: 7, learningCardId: 3, title: 'Chapters 1-5', targetDate: '2026-10-20' });
    ctrl.expectOne(`${BASE}/3`).flush(makeDetail({ id: 3, title: 'C', milestones: [milestone] }));
    fixture.detectChanges();

    expect(q(cardEl(3), '[data-testid="milestone-progress"]').textContent).toContain('0/1');
    expect(cardEl(3).querySelectorAll('[data-testid="milestone"]').length).toBe(1);
    expect(q(cardEl(3), '[data-testid="milestone-target"]').textContent).toContain('2026');
    expect(q<HTMLInputElement>(form, 'input[type="text"]').value).toBe('');
    expect(messages()).toEqual(['Milestone added']);
  });

  it('toggling a milestone PUTs its title/targetDate with isDone, then refetches (1/2)', () => {
    const m1 = makeMilestone({ id: 7, learningCardId: 3, title: 'One', targetDate: '2026-10-20' });
    const m2 = makeMilestone({ id: 8, learningCardId: 3, title: 'Two' });
    const card = expand(makeDetail({ id: 3, title: 'C', milestones: [m1, m2] }));
    expect(q(card, '[data-testid="milestone-progress"]').textContent).toContain('0/2');

    q<HTMLInputElement>(card, 'input[aria-label="Mark One as done"]').click();
    const put = ctrl.expectOne(`${BASE}/3/milestones/7`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ title: 'One', targetDate: '2026-10-20', isDone: true });
    put.flush({ ...m1, isDone: true, completedAt: '2026-10-10T16:00:00Z' });
    ctrl.expectOne(`${BASE}/3`).flush(
      makeDetail({ id: 3, title: 'C', milestones: [{ ...m1, isDone: true, completedAt: '2026-10-10T16:00:00Z' }, m2] }),
    );
    fixture.detectChanges();
    expect(q(cardEl(3), '[data-testid="milestone-progress"]').textContent).toContain('1/2');
    expect(q<HTMLInputElement>(cardEl(3), 'input[aria-label="Mark One as done"]').checked).toBeTrue();
    expect(messages()).toEqual(['Milestone completed']);
  });

  it('a failed milestone toggle reverts the checkbox', () => {
    const m1 = makeMilestone({ id: 7, learningCardId: 3, title: 'One' });
    const card = expand(makeDetail({ id: 3, title: 'C', milestones: [m1] }));
    const box = q<HTMLInputElement>(card, 'input[aria-label="Mark One as done"]');
    box.click();
    ctrl.expectOne(`${BASE}/3/milestones/7`).flush({ title: 'Server error', status: 500, detail: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(box.checked).toBeFalse();
    expect(messages()[0]).toContain('boom');
  });

  it('removing a milestone deletes it and refetches', () => {
    const m1 = makeMilestone({ id: 7, learningCardId: 3, title: 'One' });
    const card = expand(makeDetail({ id: 3, title: 'C', milestones: [m1] }));
    q<HTMLButtonElement>(card, 'button[aria-label="Remove milestone One"]').click();
    const del = ctrl.expectOne(`${BASE}/3/milestones/7`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(cardEl(3).querySelectorAll('[data-testid="milestone"]').length).toBe(0);
    ctrl.expectOne(`${BASE}/3`).flush(makeDetail({ id: 3, title: 'C' }));
    fixture.detectChanges();
    expect(q(cardEl(3), '[data-testid="milestone-progress"]').textContent).toContain('No milestones yet');
    expect(messages()).toEqual(['Milestone removed']);
  });

  it('adding a note validates, POSTs trimmed text and shows it with a timestamp', () => {
    const card = expand();
    const form = q<HTMLFormElement>(card, 'form[aria-label="Add note"]');
    q<HTMLButtonElement>(form, 'button[type="submit"]').click();
    fixture.detectChanges();
    expect(form.textContent).toContain('Text is required.');
    ctrl.expectNone(`${BASE}/3/notes`);

    typeInto(q<HTMLTextAreaElement>(form, 'textarea'), '  Great book  ');
    q<HTMLButtonElement>(form, 'button[type="submit"]').click();
    const post = ctrl.expectOne(`${BASE}/3/notes`);
    expect(post.request.body).toEqual({ text: 'Great book' });
    const note = makeNote({ id: 5, learningCardId: 3, text: 'Great book', createdAt: '2026-10-10T16:00:00Z' });
    post.flush(note, { status: 201, statusText: 'Created' });
    ctrl.expectOne(`${BASE}/3`).flush(makeDetail({ id: 3, title: 'C', notes: [note] }));
    fixture.detectChanges();
    const noteEl = q(cardEl(3), '[data-testid="note"]');
    expect(noteEl.textContent).toContain('Great book');
    expect(q(noteEl, 'time').getAttribute('datetime')).toBe('2026-10-10T16:00:00Z');
    expect(q(noteEl, 'time').textContent!.trim().length).toBeGreaterThan(0);
    expect(messages()).toEqual(['Note added']);
  });

  it('shows the note length limit from the client', () => {
    const card = expand();
    const form = q<HTMLFormElement>(card, 'form[aria-label="Add note"]');
    typeInto(q<HTMLTextAreaElement>(form, 'textarea'), 'n'.repeat(4001));
    q<HTMLButtonElement>(form, 'button[type="submit"]').click();
    fixture.detectChanges();
    expect(form.textContent).toContain('Text must be at most 4000 characters.');
    ctrl.expectNone(`${BASE}/3/notes`);
  });

  it('removing a note deletes it and refetches', () => {
    const note = makeNote({ id: 5, learningCardId: 3, text: 'Great book' });
    const card = expand(makeDetail({ id: 3, title: 'C', notes: [note] }));
    q<HTMLButtonElement>(card, 'button[aria-label="Remove note Great book"]').click();
    const del = ctrl.expectOne(`${BASE}/3/notes/5`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    ctrl.expectOne(`${BASE}/3`).flush(makeDetail({ id: 3, title: 'C' }));
    fixture.detectChanges();
    expect(cardEl(3).querySelector('[data-testid="note"]')).toBeNull();
    expect(cardEl(3).querySelector('[data-testid="notes-empty"]')).not.toBeNull();
  });

  it('a 404 while loading the detail reloads the list', () => {
    expectList().flush([makeCard({ id: 3, title: 'C' })]);
    fixture.detectChanges();
    q<HTMLButtonElement>(cardEl(3), 'button[aria-expanded]').click();
    ctrl.expectOne(`${BASE}/3`).flush(
      { title: 'Not Found', status: 404, detail: "Learning card with id '3' was not found." },
      { status: 404, statusText: 'Not Found' },
    );
    expectList().flush([]);
    fixture.detectChanges();
    expect(messages()[0]).toContain("Learning card with id '3' was not found.");
    expect(el().querySelector('[data-testid="empty-state"]')).not.toBeNull();
  });
});
