import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { apiErrorInterceptor } from '../../../core/api/api-error.interceptor';
import { ToastService } from '../../../shared/toast/toast.service';
import { LearningCardDetail } from '../learning.models';
import { makeDetail } from '../testing/learning-fixtures';
import { LearningCardFormDialog } from './learning-card-form-dialog';

@Component({
  imports: [LearningCardFormDialog],
  template: `<app-learning-card-form-dialog [(open)]="open" (saved)="saved.push($event)" />`,
})
class HostComponent {
  readonly open = signal(false);
  saved: LearningCardDetail[] = [];
}

describe('LearningCardFormDialog', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  const URL = 'http://api.test/api/learning-cards';

  const el = () => fixture.nativeElement as HTMLElement;
  const field = <T extends HTMLElement>(label: string) =>
    el().querySelector<T>(`#${Array.from(el().querySelectorAll('label')).find((l) => l.textContent?.trim() === label)!.htmlFor}`)!;
  const submitButton = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const type = (label: string, value: string) => {
    const i = field<HTMLInputElement>(label);
    i.value = value;
    i.dispatchEvent(new Event('input'));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    host.open.set(true);
    fixture.detectChanges();
  });

  afterEach(() => {
    ctrl.verify();
    toast.clear();
  });

  it('shows "Title is required." and sends nothing when submitted empty or blank', () => {
    expect(el().querySelector('dialog')!.open).toBeTrue();
    expect(el().querySelector('.dialog__title')!.textContent).toContain('Add Learning Card');
    submitButton().click();
    fixture.detectChanges();
    expect(el().textContent).toContain('Title is required.');
    type('Title', '   ');
    submitButton().click();
    fixture.detectChanges();
    expect(el().textContent).toContain('Title is required.');
    ctrl.expectNone(() => true);
  });

  it('shows the 200 character limit', () => {
    type('Title', 'a'.repeat(201));
    submitButton().click();
    fixture.detectChanges();
    expect(el().textContent).toContain('Title must be at most 200 characters.');
    ctrl.expectNone(() => true);
  });

  it('creates a card with a trimmed body, toasts, emits and closes', () => {
    type('Title', '  Clean Code  ');
    type('Description or source', ' Book by Robert C. Martin ');
    submitButton().click();
    fixture.detectChanges();

    const req = ctrl.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Clean Code', description: 'Book by Robert C. Martin' });
    req.flush(makeDetail({ id: 9, title: 'Clean Code' }), { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(host.saved.map((c) => c.id)).toEqual([9]);
    expect(host.open()).toBeFalse();
    expect(toast.toasts().map((t) => t.message)).toEqual(['Learning card created']);
  });

  it('resets the form when reopened', () => {
    type('Title', 'Draft');
    host.open.set(false);
    fixture.detectChanges();
    host.open.set(true);
    fixture.detectChanges();
    expect(field<HTMLInputElement>('Title').value).toBe('');
  });

  it('shows server field errors on the fields and stays open', () => {
    type('Title', 'x');
    submitButton().click();
    ctrl.expectOne(URL).flush(
      {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: {
          title: ['Title must be at most 200 characters.'],
          description: ['Description must be at most 2000 characters.'],
          other: ['Something else.'],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(host.open()).toBeTrue();
    expect(host.saved).toEqual([]);
    expect(el().textContent).toContain('Title must be at most 200 characters.');
    expect(el().textContent).toContain('Description must be at most 2000 characters.');
    expect(el().querySelector('[data-testid="form-error"]')?.textContent).toContain('Something else.');
  });

  it('shows the problem detail for other errors', () => {
    type('Title', 'x');
    submitButton().click();
    ctrl.expectOne(URL).flush({ title: 'Server error', status: 500, detail: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="form-error"]')?.textContent).toContain('boom');
    expect(toast.toasts()[0].message).toContain('boom');
  });
});
