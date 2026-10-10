import { Component, signal } from '@angular/core';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { makePlan } from '../testing/plan-fixtures';
import { PlanStatusBadge } from './plan-status-badge';
import { PlanTiming } from './plan-timing';
import { RestTime } from './rest-time';

@Component({
  imports: [RestTime],
  template: `<app-rest-time [endDateTime]="end()" [serverNow]="serverNow()" [restTimeSeconds]="rest()" (elapsed)="elapsed = elapsed + 1" />`,
})
class RestHost {
  readonly end = signal('');
  readonly serverNow = signal<string | null>(null);
  readonly rest = signal<number | null>(null);
  elapsed = 0;
}

const iso = (ms: number) => new Date(ms).toISOString();

describe('RestTime', () => {
  let fixture: ComponentFixture<RestHost>;
  const el = () => fixture.nativeElement as HTMLElement;
  const timer = () => el().querySelector<HTMLElement>('[data-testid="plan-rest-time"]');
  const value = () => timer()?.querySelector('.rest__value')?.textContent?.trim();

  function setup(end: number, serverNow: number | null, rest: number | null): void {
    fixture = TestBed.createComponent(RestHost);
    fixture.componentInstance.end.set(iso(end));
    fixture.componentInstance.serverNow.set(serverNow === null ? null : iso(serverNow));
    fixture.componentInstance.rest.set(rest);
    fixture.detectChanges();
  }

  it('counts down every second from endDateTime, corrected by the serverNow offset', fakeAsync(() => {
    const client = Date.now();
    // The server clock is 2 minutes ahead of the client; 10 s remain on the server clock.
    const server = client + 120_000;
    setup(server + 10_000, server, 10);
    expect(value()).toBe('00:00:10');
    expect(timer()!.getAttribute('role')).toBe('timer');
    expect(timer()!.getAttribute('aria-label')).toBe('Rest time 00:00:10');

    tick(1_000);
    fixture.detectChanges();
    expect(value()).toBe('00:00:09');
    expect(timer()!.getAttribute('data-seconds')).toBe('9');

    tick(4_000);
    fixture.detectChanges();
    expect(value()).toBe('00:00:05');
    fixture.destroy();
  }));

  it('uses endDateTime, not restTimeSeconds (a server clock behind the client)', fakeAsync(() => {
    const client = Date.now();
    const server = client - 30_000;
    setup(server + 3_725_000, server, 3_725);
    expect(value()).toBe('01:02:05');
    fixture.destroy();
  }));

  it('emits elapsed once when reaching zero, then stays at 00:00:00', fakeAsync(() => {
    const now = Date.now();
    setup(now + 3_000, now, 3);
    tick(2_000);
    fixture.detectChanges();
    expect(fixture.componentInstance.elapsed).toBe(0);

    tick(1_000);
    fixture.detectChanges();
    expect(value()).toBe('00:00:00');
    expect(fixture.componentInstance.elapsed).toBe(1);

    tick(5_000);
    fixture.detectChanges();
    expect(fixture.componentInstance.elapsed).toBe(1);
    fixture.destroy();
  }));

  it('re-arms the zero event for a new response (new serverNow)', fakeAsync(() => {
    const now = Date.now();
    setup(now + 1_000, now, 1);
    tick(1_000);
    expect(fixture.componentInstance.elapsed).toBe(1);
    // A refetch still says InProgress with a fresh serverNow (end just reached on the server).
    fixture.componentInstance.serverNow.set(iso(Date.now()));
    fixture.componentInstance.rest.set(0);
    fixture.detectChanges();
    tick(0);
    expect(fixture.componentInstance.elapsed).toBe(2);
    fixture.destroy();
  }));

  it('works without serverNow (no correction)', fakeAsync(() => {
    const now = Date.now();
    setup(now + 61_000, null, 61);
    expect(value()).toBe('00:01:01');
    tick(1_000);
    fixture.detectChanges();
    expect(value()).toBe('00:01:00');
    discardPeriodicTasks();
    fixture.destroy();
  }));

  it('is hidden and runs no timer when restTimeSeconds is null', fakeAsync(() => {
    const now = Date.now();
    setup(now + 60_000, now, null);
    expect(timer()).toBeNull();
    // fakeAsync fails on leftover periodic timers, so no interval may be running here.
    tick(5_000);
    expect(fixture.componentInstance.elapsed).toBe(0);
  }));

  it('stops ticking when it becomes hidden', fakeAsync(() => {
    const now = Date.now();
    setup(now + 60_000, now, 60);
    expect(timer()).not.toBeNull();
    fixture.componentInstance.rest.set(null);
    fixture.detectChanges();
    expect(timer()).toBeNull();
    tick(2_000); // no periodic timer left (fakeAsync would throw)
  }));
});

@Component({
  imports: [PlanStatusBadge],
  template: `<app-plan-status-badge [status]="status()" />`,
})
class BadgeHost {
  readonly status = signal<'NotStarted' | 'InProgress' | 'Completed'>('NotStarted');
}

describe('PlanStatusBadge', () => {
  it('renders the label and raw status per state', () => {
    const fixture = TestBed.createComponent(BadgeHost);
    const badge = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="plan-status"]')!;
    const expected = { NotStarted: 'Not started', InProgress: 'In progress', Completed: 'Completed' } as const;
    for (const status of ['NotStarted', 'InProgress', 'Completed'] as const) {
      fixture.componentInstance.status.set(status);
      fixture.detectChanges();
      expect(badge().textContent!.trim()).toBe(expected[status]);
      expect(badge().getAttribute('data-status')).toBe(status);
      expect(badge().classList.contains(`status--${status}`)).toBeTrue();
    }
  });
});

describe('PlanTiming', () => {
  function render(plan: ReturnType<typeof makePlan>) {
    const fixture = TestBed.createComponent(PlanTiming);
    fixture.componentRef.setInput('plan', plan);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('upcoming: "Starts <local date/time>" and no rest time', () => {
    const { el, fixture } = render(makePlan({ status: 'NotStarted', startDateTime: '2026-10-11T06:00:00Z' }));
    const starts = el.querySelector('[data-testid="plan-starts"]')!;
    expect(starts.textContent!.trim()).toBe(
      `Starts ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-10-11T06:00:00Z'))}`,
    );
    expect(el.querySelector('[data-testid="plan-rest-time"]')).toBeNull();
    fixture.destroy();
  });

  it('in progress: the live rest time, forwarding elapsed', fakeAsync(() => {
    const now = Date.now();
    const { el, fixture } = render(
      makePlan({ status: 'InProgress', endDateTime: iso(now + 2_000), serverNow: iso(now), restTimeSeconds: 2 }),
    );
    let elapsed = 0;
    fixture.componentInstance.elapsed.subscribe(() => elapsed++);
    expect(el.querySelector('[data-testid="plan-rest-time"]')!.textContent).toContain('00:00:02');
    expect(el.querySelector('[data-testid="plan-starts"]')).toBeNull();
    tick(2_000);
    expect(elapsed).toBe(1);
    fixture.destroy();
  }));

  it('completed: end date and completion %', () => {
    const { el, fixture } = render(
      makePlan({
        status: 'Completed',
        endDateTime: '2026-10-10T09:00:00Z',
        serverNow: '2026-10-10T12:00:00Z',
        progressPercent: 33,
      }),
    );
    const ended = el.querySelector('[data-testid="plan-ended"]')!.textContent!.trim();
    expect(ended.startsWith('Ended ')).toBeTrue();
    expect(ended.endsWith('· 33% complete')).toBeTrue();
    fixture.destroy();
  });

  it('completed before the end: says it finished early', () => {
    const { el, fixture } = render(
      makePlan({ status: 'Completed', endDateTime: '2026-10-10T18:00:00Z', serverNow: '2026-10-10T12:00:00Z', progressPercent: 100 }),
    );
    expect(el.querySelector('[data-testid="plan-ended"]')!.textContent).toContain('Finished early · ends');
    fixture.destroy();
  });
});
