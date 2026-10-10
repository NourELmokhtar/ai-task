import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { ErrorState } from '../../shared/components/error-state';
import { LoadingState } from '../../shared/components/loading-state';
import { FieldErrors } from '../../shared/forms/field-errors';
import { ToastService } from '../../shared/toast/toast.service';
import { PlanItemPicker } from './components/plan-item-picker';
import {
  applyPlanServerErrors,
  createPlanForm,
  defaultPlanWindow,
  planFormValue,
  toCreatePlanRequest,
  toPlanMetadataRequest,
} from './plan-form';
import { PLAN_SOURCE_TYPE_ICONS, PLAN_SOURCE_TYPE_LABELS, PlanDto, planItemTitle, SelectedPlanItem } from './plans.models';
import { PlansApi } from './plans-api.service';

const CHECK_FIELDS = 'Please fix the highlighted fields.';

/**
 * /plans/new and /plans/:id/edit: the plan builder (F3, F4, F6). Create mode picks items from
 * tasks, habits and learning cards; edit mode changes metadata only and shows the items read-only
 * (A-17). Saves through `PlansApi`, toasts, then returns to /plans.
 */
@Component({
  selector: 'app-plan-builder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, FieldErrors, PlanItemPicker, ErrorState, LoadingState],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ editing() ? 'Edit Plan' : 'Create Plan' }}</h1>
        <a class="btn" routerLink="/plans">Back to plans</a>
      </header>

      @if (loadError(); as err) {
        <app-error-state title="Couldn't load the plan" [message]="err.message" (retry)="load()" />
      } @else if (editing() && !plan()) {
        <app-loading-state message="Loading plan…" />
      } @else {
        <form class="card builder" [formGroup]="form" (ngSubmit)="submit()" novalidate aria-label="Plan builder">
          @if (summary().length) {
            <div class="form-error" role="alert" data-testid="form-error">
              @for (msg of summary(); track $index) {
                <p>{{ msg }}</p>
              }
            </div>
          }
          <div class="form-field">
            <label for="plan-title">Title</label>
            <input id="plan-title" type="text" formControlName="title" autocomplete="off" placeholder="e.g. Morning focus block" aria-describedby="plan-title-errors" />
            <app-field-errors [control]="form.controls.title" label="Title" errorId="plan-title-errors" />
          </div>

          <div class="row">
            <fieldset class="form-field duration" formGroupName="duration" aria-describedby="plan-duration-errors">
              <legend>Estimated duration</legend>
              <div class="duration__inputs">
                <label><input type="number" min="0" step="1" formControlName="hours" aria-label="Hours" /> h</label>
                <label><input type="number" min="0" max="59" step="1" formControlName="minutes" aria-label="Minutes" /> min</label>
              </div>
              <app-field-errors [control]="form.controls.duration" label="Estimated duration" errorId="plan-duration-errors" />
            </fieldset>
            <div class="form-field">
              <label for="plan-priority">Priority order</label>
              <input id="plan-priority" type="number" min="1" step="1" formControlName="priorityOrder" aria-describedby="plan-priority-errors" />
              <app-field-errors [control]="form.controls.priorityOrder" label="Priority order" errorId="plan-priority-errors" />
              <small class="muted">1 = highest priority</small>
            </div>
          </div>

          <div class="row">
            <div class="form-field">
              <label for="plan-start">Start</label>
              <input id="plan-start" type="datetime-local" formControlName="startDateTime" aria-describedby="plan-start-errors" />
              <app-field-errors [control]="form.controls.startDateTime" label="Start date/time" errorId="plan-start-errors" />
            </div>
            <div class="form-field">
              <label for="plan-end">End</label>
              <input id="plan-end" type="datetime-local" formControlName="endDateTime" aria-describedby="plan-end-errors" />
              <app-field-errors [control]="form.controls.endDateTime" label="End date/time" errorId="plan-end-errors" />
            </div>
          </div>

          <section class="items" aria-labelledby="plan-items-heading">
            <h2 id="plan-items-heading">Items</h2>
            @if (plan(); as p) {
              <p class="muted">Items can't be changed after a plan is created.</p>
              <ul class="readonly" aria-label="Plan items" data-testid="readonly-items">
                @for (item of p.items; track item.id) {
                  <li>
                    <span class="muted"><span aria-hidden="true">{{ icons[item.sourceType] }}</span> {{ labels[item.sourceType] }}:</span>
                    {{ title(item) }}
                    @if (!item.sourceAvailable) {
                      <span class="muted">(source removed)</span>
                    }
                  </li>
                }
              </ul>
            } @else {
              <app-plan-item-picker [selected]="items()" (selectedChange)="onItemsChange($event)" describedBy="plan-items-errors" />
              <app-field-errors [control]="form.controls.items" label="Items" errorId="plan-items-errors" />
            }
          </section>

          <div class="actions">
            <a class="btn" routerLink="/plans">Cancel</a>
            <button type="submit" class="btn btn--primary" [disabled]="saving()">
              {{ saving() ? 'Saving…' : editing() ? 'Save changes' : 'Create Plan' }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .builder { display: flex; flex-direction: column; gap: 0.25rem; }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: 0 1rem; }
    .duration { margin: 0 0 1rem; padding: 0; border: none; min-width: 0; }
    .duration legend { padding: 0; margin-bottom: 0.3rem; font-weight: 500; }
    .duration__inputs { display: flex; gap: 0.75rem; }
    .duration__inputs label { display: flex; align-items: center; gap: 0.35rem; font-weight: 400; }
    .duration__inputs input { width: 5rem; }
    .items h2 { margin-top: 0.25rem; }
    .readonly { margin: 0; padding-left: 1.1rem; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .form-error { margin: 0 0 1rem; padding: 0.5rem 0.75rem; border-radius: var(--radius); background: var(--danger-soft); color: var(--danger); }
    .form-error p { margin: 0; }
  `,
})
export class PlanBuilderPage {
  private readonly api = inject(PlansApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Route param (`/plans/:id/edit`); absent in create mode. */
  readonly id = input<string | undefined>(undefined);
  protected readonly editing = computed(() => this.id() !== undefined);

  protected readonly form = createPlanForm();
  protected readonly items = signal<SelectedPlanItem[]>([]);
  protected readonly plan = signal<PlanDto | null>(null);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly summary = signal<string[]>([]);

  protected readonly icons = PLAN_SOURCE_TYPE_ICONS;
  protected readonly labels = PLAN_SOURCE_TYPE_LABELS;
  protected readonly title = planItemTitle;

  private loadSub?: Subscription;

  constructor() {
    const { start, end } = defaultPlanWindow(new Date());
    this.form.patchValue({ startDateTime: start, endDateTime: end });
    effect(() => {
      const id = this.id();
      untracked(() => {
        if (id === undefined) return;
        this.form.controls.items.disable();
        this.load();
      });
    });
    inject(DestroyRef).onDestroy(() => this.loadSub?.unsubscribe());
  }

  load(): void {
    const id = Number(this.id());
    this.loadSub?.unsubscribe();
    this.loadError.set(null);
    this.plan.set(null);
    this.loadSub = this.api.get(id).subscribe({
      next: (plan) => {
        this.form.reset(planFormValue(plan));
        this.plan.set(plan);
      },
      error: (e: unknown) => this.loadError.set(toApiError(e)),
    });
  }

  protected onItemsChange(items: SelectedPlanItem[]): void {
    this.items.set(items);
    this.form.controls.items.setValue(items);
    this.form.controls.items.markAsDirty();
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.summary.set([CHECK_FIELDS]);
      return;
    }
    const plan = this.plan();
    this.saving.set(true);
    this.summary.set([]);
    const request = plan
      ? this.api.update(plan.id, toPlanMetadataRequest(this.form))
      : this.api.create(toCreatePlanRequest(this.form));
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(plan ? 'Plan updated' : 'Plan created');
        void this.router.navigate(['/plans']);
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        this.saving.set(false);
        if (err.isValidationError && err.hasFieldErrors) {
          const rest = applyPlanServerErrors(this.form, err);
          this.summary.set(rest.length ? rest : [CHECK_FIELDS]);
        } else {
          this.summary.set([err.message]);
          this.toast.error(`Couldn't ${plan ? 'update' : 'create'} the plan: ${err.message}`);
        }
      },
    });
  }
}
