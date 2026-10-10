import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  model,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { map, Observable, Subscription } from 'rxjs';
import { toApiError } from '../../../core/api/api-error';
import { HABIT_FREQUENCY_LABELS, HabitsApi } from '../../habits';
import { LEARNING_CARD_STATUS_LABELS, LearningApi } from '../../learning';
import { TASK_STATUS_LABELS, TasksApi } from '../../tasks';
import {
  PLAN_SOURCE_TYPE_ICONS,
  PLAN_SOURCE_TYPE_LABELS,
  PlanItemSourceType,
  planItemKey,
  SelectedPlanItem,
} from '../plans.models';

/** One selectable source. */
export interface PickerOption {
  id: number;
  title: string;
  /** Short muted hint (status / frequency). */
  hint: string;
}

interface PickerSection {
  type: PlanItemSourceType;
  heading: string;
  noun: string;
  status: WritableSignal<'loading' | 'ready' | 'error'>;
  error: WritableSignal<string>;
  options: WritableSignal<PickerOption[]>;
  search: WritableSignal<string>;
  filtered: Signal<PickerOption[]>;
  load: () => Observable<PickerOption[]>;
}

/** Case-insensitive "contains" filter on the title (blank query keeps everything). */
export function filterOptions(options: readonly PickerOption[], query: string): PickerOption[] {
  const q = query.trim().toLocaleLowerCase();
  return q ? options.filter((o) => o.title.toLocaleLowerCase().includes(q)) : [...options];
}

/**
 * Plan builder item picker (F3): three sections, each loaded through the existing feature API
 * (Tasks: `TasksApi.list()` = non-archived; Habits: `HabitsApi.list({ active: true })`;
 * Learning: `LearningApi.list()`), with client-side search, multi-select checkboxes and a
 * selected-items summary. `[(selected)]` keeps the selection order (= request order).
 */
@Component({
  selector: 'app-plan-item-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker" [attr.aria-describedby]="describedBy() || null">
      @for (s of sections; track s.type) {
        <fieldset class="section" data-testid="picker-section" [attr.data-type]="s.type">
          <legend>
            <span aria-hidden="true">{{ icons[s.type] }}</span> {{ s.heading }}
            <span class="muted count">({{ countFor(s.type) }} selected)</span>
          </legend>
          <input
            type="search"
            class="input"
            [attr.aria-label]="'Search ' + s.noun + 's'"
            [placeholder]="'Search ' + s.noun + 's…'"
            [value]="s.search()"
            (input)="s.search.set($any($event.target).value)"
          />
          @switch (s.status()) {
            @case ('loading') {
              <p class="muted note" data-testid="picker-loading">Loading {{ s.noun }}s…</p>
            }
            @case ('error') {
              <p class="note error" role="alert">
                Couldn't load {{ s.noun }}s: {{ s.error() }}
                <button type="button" class="btn btn--small" (click)="load(s)">Try again</button>
              </p>
            }
            @default {
              @if (s.filtered().length === 0) {
                <p class="muted note">{{ s.options().length === 0 ? 'No ' + s.noun + 's available.' : 'No matches.' }}</p>
              } @else {
                <ul class="options">
                  @for (o of s.filtered(); track o.id) {
                    <li>
                      <label class="option">
                        <input type="checkbox" [checked]="isSelected(s.type, o.id)" (change)="toggle(s.type, o, $any($event.target).checked)" />
                        <span class="option__title">{{ o.title }}</span>
                        <span class="muted option__hint">{{ o.hint }}</span>
                      </label>
                    </li>
                  }
                </ul>
              }
            }
          }
        </fieldset>
      }
    </div>
    <div class="summary" data-testid="selected-items" [attr.data-count]="selected().length">
      <p class="summary__count" aria-live="polite">
        {{ selected().length }} {{ selected().length === 1 ? 'item' : 'items' }} selected
      </p>
      @if (selected().length) {
        <ul class="chips" aria-label="Selected items">
          @for (item of selected(); track key(item)) {
            <li class="chip" data-testid="selected-item">
              <span aria-hidden="true">{{ icons[item.sourceType] }}</span>
              <span class="muted">{{ labels[item.sourceType] }}:</span> {{ item.title }}
              <button type="button" class="chip__remove" [attr.aria-label]="'Remove ' + item.title + ' from plan'" (click)="unselect(item)">×</button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: 0.75rem; }
    .section { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; margin: 0; padding: 0.6rem; border: 1px solid var(--border); border-radius: var(--radius); }
    legend { padding: 0 0.25rem; font-weight: 600; }
    .count { font-weight: 400; font-size: 0.8rem; }
    .note { margin: 0; font-size: 0.85rem; }
    .error { color: var(--danger); }
    .options { max-height: 12rem; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
    .option { display: flex; align-items: baseline; gap: 0.4rem; padding: 0.2rem 0; cursor: pointer; }
    .option__title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .option__hint { font-size: 0.75rem; white-space: nowrap; }
    .summary { margin-top: 0.75rem; }
    .summary__count { margin: 0 0 0.4rem; font-weight: 500; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
    .chip { display: inline-flex; align-items: center; gap: 0.3rem; max-width: 100%; padding: 0.15rem 0.3rem 0.15rem 0.6rem; border-radius: 999px; background: var(--primary-soft); font-size: 0.85rem; overflow-wrap: anywhere; }
    .chip__remove { border: none; background: transparent; color: var(--text-muted); font-size: 1.1rem; line-height: 1; cursor: pointer; }
  `,
})
export class PlanItemPicker {
  private readonly tasksApi = inject(TasksApi);
  private readonly habitsApi = inject(HabitsApi);
  private readonly learningApi = inject(LearningApi);

  /** Selected sources in selection order. */
  readonly selected = model<SelectedPlanItem[]>([]);
  /** Id of an error list describing the picker (aria-describedby). */
  readonly describedBy = input('');

  protected readonly icons = PLAN_SOURCE_TYPE_ICONS;
  protected readonly labels = PLAN_SOURCE_TYPE_LABELS;
  protected readonly key = planItemKey;
  private readonly selectedKeys = computed(() => new Set(this.selected().map(planItemKey)));

  protected readonly sections: PickerSection[] = [
    this.section('Task', 'Tasks', 'task', () =>
      this.tasksApi.list().pipe(map((ts) => ts.map((t) => ({ id: t.id, title: t.title, hint: TASK_STATUS_LABELS[t.status] })))),
    ),
    this.section('Habit', 'Habits', 'habit', () =>
      this.habitsApi
        .list({ active: true })
        .pipe(map((hs) => hs.map((h) => ({ id: h.id, title: h.name, hint: HABIT_FREQUENCY_LABELS[h.frequency] })))),
    ),
    this.section('LearningResource', 'Learning Resources', 'learning resource', () =>
      this.learningApi
        .list()
        .pipe(map((cs) => cs.map((c) => ({ id: c.id, title: c.title, hint: LEARNING_CARD_STATUS_LABELS[c.status] })))),
    ),
  ];

  private readonly subs = new Map<PlanItemSourceType, Subscription>();

  constructor() {
    for (const s of this.sections) this.load(s);
    inject(DestroyRef).onDestroy(() => this.subs.forEach((sub) => sub.unsubscribe()));
  }

  protected load(s: PickerSection): void {
    this.subs.get(s.type)?.unsubscribe();
    s.status.set('loading');
    this.subs.set(
      s.type,
      s.load().subscribe({
        next: (options) => {
          s.options.set(options);
          s.status.set('ready');
        },
        error: (e: unknown) => {
          s.error.set(toApiError(e).message);
          s.status.set('error');
        },
      }),
    );
  }

  protected countFor(type: PlanItemSourceType): number {
    return this.selected().filter((i) => i.sourceType === type).length;
  }

  protected isSelected(type: PlanItemSourceType, id: number): boolean {
    return this.selectedKeys().has(planItemKey({ sourceType: type, sourceId: id }));
  }

  protected toggle(type: PlanItemSourceType, option: PickerOption, checked: boolean): void {
    const item: SelectedPlanItem = { sourceType: type, sourceId: option.id, title: option.title };
    if (checked && !this.isSelected(type, option.id)) this.selected.update((list) => [...list, item]);
    if (!checked) this.unselect(item);
  }

  protected unselect(item: SelectedPlanItem): void {
    const key = planItemKey(item);
    this.selected.update((list) => list.filter((i) => planItemKey(i) !== key));
  }

  private section(
    type: PlanItemSourceType,
    heading: string,
    noun: string,
    load: () => Observable<PickerOption[]>,
  ): PickerSection {
    const options = signal<PickerOption[]>([]);
    const search = signal('');
    return {
      type,
      heading,
      noun,
      status: signal<'loading' | 'ready' | 'error'>('loading'),
      error: signal(''),
      options,
      search,
      filtered: computed(() => filterOptions(options(), search())),
      load,
    };
  }
}
