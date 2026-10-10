import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    service = TestBed.inject(ToastService);
  });

  it('adds toasts and auto-dismisses them after their duration', fakeAsync(() => {
    service.success('Saved', 1000);
    service.error('Failed', 3000);
    expect(service.toasts().map((t) => [t.kind, t.message])).toEqual([
      ['success', 'Saved'],
      ['error', 'Failed'],
    ]);

    tick(1000);
    expect(service.toasts().map((t) => t.message)).toEqual(['Failed']);
    tick(2000);
    expect(service.toasts()).toEqual([]);
  }));

  it('dismisses manually and keeps sticky toasts', fakeAsync(() => {
    const id = service.info('Hello', 0);
    tick(60_000);
    expect(service.toasts().length).toBe(1);
    service.dismiss(id);
    expect(service.toasts().length).toBe(0);
  }));
});
