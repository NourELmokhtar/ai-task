import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorState } from '../../shared/components/error-state';
import { LoadingState } from '../../shared/components/loading-state';
import { ToastService } from '../../shared/toast/toast.service';
import { HabitCard } from './components/habit-card';
import { HabitFormDialog } from './components/habit-form-dialog';
import { HabitDto, partitionHabits } from './habits.models';
import { HabitsApi } from './habits-api.service';

/**
 * /habits: list habits (active first, then an "Inactive" section), toggle today's completion,
 * create, edit, deactivate/activate and remove habits (M03).
 */
@Component({
  selector: 'app-habits-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, HabitCard, HabitFormDialog, ConfirmDialog, EmptyState, LoadingState, ErrorState],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Habits</h1>
        <button type="button" class="btn btn--primary" (click)="openCreate()">Add Habit</button>
      </header>

      @if (error(); as err) {
        <app-error-state title="Couldn't load habits" [message]="err.message" (retry)="load()" />
      } @else if (!loaded()) {
        <app-loading-state message="Loading habits…" />
      } @else if (habits().length === 0) {
        <app-empty-state
          title="No habits yet"
          message="Create a daily or weekly habit and track it here."
          actionLabel="Add Habit"
          (action)="openCreate()"
        />
      } @else {
        <p class="summary muted" aria-live="polite" data-testid="habits-summary">
          {{ groups().active.length }} active · {{ doneToday() }} done today
          @if (groups().inactive.length) {
            <span>· {{ groups().inactive.length }} inactive</span>
          }
          @if (loading()) {
            <span>· Updating…</span>
          }
        </p>
        @if (groups().active.length) {
          <ul class="habit-list" aria-label="Active habits">
            @for (h of groups().active; track h.id) {
              <li>
                <ng-container *ngTemplateOutlet="card; context: { $implicit: h }" />
              </li>
            }
          </ul>
        } @else {
          <p class="muted">No active habits. Activate one below or add a new habit.</p>
        }
        @if (groups().inactive.length) {
          <h2 class="section-title" id="inactive-habits-title">Inactive</h2>
          <ul class="habit-list" aria-labelledby="inactive-habits-title" data-testid="inactive-habits">
            @for (h of groups().inactive; track h.id) {
              <li>
                <ng-container *ngTemplateOutlet="card; context: { $implicit: h }" />
              </li>
            }
          </ul>
        }
      }
    </section>

    <ng-template #card let-h>
      <app-habit-card
        [habit]="h"
        [busy]="busy().has(h.id)"
        (completedChange)="toggle(h, $event)"
        (edit)="openEdit(h)"
        (deactivate)="deactivate(h)"
        (activate)="activate(h)"
        (remove)="askRemove(h)"
      />
    </ng-template>

    <app-habit-form-dialog [(open)]="formOpen" [habit]="editing()" (saved)="onSaved($event)" />
    <app-confirm-dialog
      [(open)]="confirmOpen"
      title="Remove habit?"
      [message]="removeMessage()"
      confirmLabel="Remove"
      [danger]="true"
      (confirmed)="confirmRemove()"
    />
  `,
  styles: `
    .summary { margin: 0 0 0.5rem; font-size: 0.85rem; }
    .habit-list { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; color: var(--text-muted); }
  `,
})
export class HabitsPage {
  private readonly api = inject(HabitsApi);
  private readonly toast = inject(ToastService);

  protected readonly habits = signal<HabitDto[]>([]);
  protected readonly groups = computed(() => partitionHabits(this.habits()));
  protected readonly doneToday = computed(() => this.groups().active.filter((h) => h.completedToday).length);
  protected readonly loading = signal(false);
  /** True after the first successful load (until then the loading state is shown). */
  protected readonly loaded = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<ReadonlySet<number>>(new Set());

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<HabitDto | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly removing = signal<HabitDto | null>(null);
  protected readonly removeMessage = computed(
    () => `"${this.removing()?.name ?? ''}" and its completion history will be removed. This can't be undone.`,
  );

  private loadSub?: Subscription;

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.loadSub?.unsubscribe());
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.loadSub = this.api.list().subscribe({
      next: (habits) => {
        this.habits.set(habits);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e));
        this.loaded.set(false);
        this.loading.set(false);
      },
    });
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(habit: HabitDto): void {
    this.editing.set(habit);
    this.formOpen.set(true);
  }

  protected onSaved(saved: HabitDto): void {
    this.habits.update((list) =>
      list.some((h) => h.id === saved.id) ? list.map((h) => (h.id === saved.id ? saved : h)) : [...list, saved],
    );
    this.load();
  }

  /** Today's completion toggle. A 409 ("already done") is handled by the API service as success. */
  protected toggle(habit: HabitDto, done: boolean): void {
    this.mutate(
      habit,
      this.api.setCompletedToday(habit, done),
      done ? 'Marked as done today' : 'Marked as not done today',
      "Couldn't update today's completion",
    );
  }

  protected deactivate(habit: HabitDto): void {
    this.mutate(habit, this.api.deactivate(habit.id), 'Habit deactivated', "Couldn't deactivate the habit");
  }

  protected activate(habit: HabitDto): void {
    this.mutate(habit, this.api.activate(habit.id), 'Habit activated', "Couldn't activate the habit");
  }

  protected askRemove(habit: HabitDto): void {
    this.removing.set(habit);
    this.confirmOpen.set(true);
  }

  protected confirmRemove(): void {
    const habit = this.removing();
    if (!habit) return;
    this.setBusy(habit.id, true);
    this.api.delete(habit.id).subscribe({
      next: () => {
        this.setBusy(habit.id, false);
        this.habits.update((list) => list.filter((h) => h.id !== habit.id));
        this.toast.success('Habit removed');
      },
      error: (e: unknown) => this.onMutationError(habit, e, "Couldn't remove the habit"),
    });
  }

  /** Runs a card mutation: busy flag, in-place update with the returned habit, toast. */
  private mutate(habit: HabitDto, request: Observable<HabitDto>, success: string, failure: string): void {
    this.setBusy(habit.id, true);
    request.subscribe({
      next: (saved) => {
        this.habits.update((list) => list.map((h) => (h.id === saved.id ? saved : h)));
        this.setBusy(habit.id, false);
        this.toast.success(success);
      },
      error: (e: unknown) => this.onMutationError(habit, e, failure),
    });
  }

  /** Error toast; reloads when the list is out of sync (habit gone, or inactive elsewhere). */
  private onMutationError(habit: HabitDto, e: unknown, failure: string): void {
    const err = toApiError(e);
    this.setBusy(habit.id, false);
    this.toast.error(`${failure}: ${err.message}`);
    if (err.isNotFound || err.isValidationError) this.load();
  }

  private setBusy(id: number, busy: boolean): void {
    this.busy.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
