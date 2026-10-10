import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HabitDto } from '../habits.models';
import { makeHabit } from '../testing/habit-fixtures';
import { HabitCard } from './habit-card';

@Component({
  imports: [HabitCard],
  template: `
    <app-habit-card
      [habit]="habit()"
      [busy]="busy()"
      [actions]="actions()"
      (completedChange)="events.push('toggle:' + $event)"
      (edit)="events.push('edit')"
      (deactivate)="events.push('deactivate')"
      (activate)="events.push('activate')"
      (remove)="events.push('remove')"
    />
  `,
})
class HostComponent {
  readonly habit = signal<HabitDto>(makeHabit());
  readonly busy = signal(false);
  readonly actions = signal(true);
  events: string[] = [];
}

describe('HabitCard', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (testId: string) => el().querySelector(`[data-testid="${testId}"]`);
  const box = () => el().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const button = (text: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

  function render(habit: Partial<HabitDto>) {
    host.habit.set(makeHabit(habit));
    fixture.detectChanges();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows name, description, Daily label and streak; no weekly badge', () => {
    render({ name: 'Drink water', description: '8 glasses', frequency: 'Daily', currentStreak: 4, completedToday: true });
    expect(el().textContent).toContain('Drink water');
    expect(el().textContent).toContain('8 glasses');
    expect(q('habit-frequency')!.textContent!.trim()).toBe('Daily');
    expect(q('habit-streak')!.textContent!.trim()).toBe('Streak: 4 days');
    expect(q('habit-week')).toBeNull();
    expect(box().checked).toBeTrue();
    expect(box().getAttribute('aria-label')).toBe('Mark Drink water as done today');
  });

  it('weekly habits show "Done this week" from completedForCurrentPeriod and a week streak', () => {
    render({ frequency: 'Weekly', completedToday: false, completedForCurrentPeriod: true, currentStreak: 1 });
    expect(q('habit-frequency')!.textContent!.trim()).toBe('Weekly');
    expect(q('habit-week')!.textContent!.trim()).toBe('Done this week');
    expect(q('habit-streak')!.textContent!.trim()).toBe('Streak: 1 week');
    expect(box().checked).toBeFalse(); // the toggle reflects today only

    render({ frequency: 'Weekly', completedForCurrentPeriod: false });
    expect(q('habit-week')!.textContent!.trim()).toBe('Not done this week');
  });

  it('emits completedChange and keeps the optimistic state while busy', () => {
    render({ completedToday: false });
    box().click();
    expect(host.events).toEqual(['toggle:true']);
    host.busy.set(true);
    fixture.detectChanges();
    expect(box().checked).toBeTrue();
    expect(box().disabled).toBeTrue();

    // Request failed: busy clears, habit unchanged → reverts.
    host.busy.set(false);
    fixture.detectChanges();
    expect(box().checked).toBeFalse();
  });

  it('inactive habits are dimmed, the toggle is disabled and Activate replaces Deactivate', () => {
    render({ isActive: false });
    expect(el().querySelector('.habit--inactive')).not.toBeNull();
    expect(q('habit-inactive')!.textContent!.trim()).toBe('Inactive');
    expect(box().disabled).toBeTrue();
    expect(button('Deactivate')).toBeUndefined();
    button('Activate')!.click();
    expect(host.events).toEqual(['activate']);
  });

  it('action buttons emit; actions=false hides them', () => {
    render({});
    button('Edit')!.click();
    button('Deactivate')!.click();
    button('Remove')!.click();
    expect(host.events).toEqual(['edit', 'deactivate', 'remove']);

    host.actions.set(false);
    fixture.detectChanges();
    expect(el().querySelectorAll('button').length).toBe(0);
    expect(box()).not.toBeNull();
  });
});
