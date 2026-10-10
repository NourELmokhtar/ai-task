import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { DEFAULT_VIEW_LABELS, DEFAULT_VIEWS, DISPLAY_NAME_MAX, SettingsService } from '../../core/settings';
import { ErrorState } from '../../shared/components/error-state';
import { LoadingState } from '../../shared/components/loading-state';
import { FieldErrors } from '../../shared/forms/field-errors';
import { applyServerErrors } from '../../shared/forms/server-errors';
import { ToastService } from '../../shared/toast/toast.service';
import { createSettingsForm, settingsFormValue, toUpdateSettingsRequest } from './settings-form';

const CHECK_FIELDS = 'Please fix the highlighted fields.';

/**
 * /settings (M05 F3–F5): Profile (display name) and Preferences (plan-start notifications,
 * default view). Loads fresh values on open and saves through the app-wide `SettingsService`,
 * so the rest of the app sees the change immediately.
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldErrors, ErrorState, LoadingState],
  template: `
    <section class="page">
      <header class="page-header"><h1>Settings</h1></header>

      @if (loadError(); as err) {
        <app-error-state title="Couldn't load settings" [message]="err.message" (retry)="load()" />
      } @else if (!loaded()) {
        <app-loading-state message="Loading settings…" />
      } @else {
        <form class="settings" [formGroup]="form" (ngSubmit)="submit()" novalidate aria-label="Settings">
          @if (summary().length) {
            <div class="form-error" role="alert" data-testid="form-error">
              @for (msg of summary(); track $index) {
                <p>{{ msg }}</p>
              }
            </div>
          }

          <section class="card" aria-labelledby="settings-profile-heading">
            <h2 id="settings-profile-heading">Profile</h2>
            <div class="form-field">
              <label for="settings-display-name">Display name</label>
              <input
                id="settings-display-name"
                type="text"
                formControlName="displayName"
                autocomplete="nickname"
                placeholder="e.g. Nour"
                aria-describedby="settings-display-name-hint settings-display-name-errors"
              />
              <small id="settings-display-name-hint" class="muted">
                Optional, up to {{ nameMax }} characters. Used to greet you on the Dashboard.
              </small>
              <app-field-errors [control]="form.controls.displayName" label="Display name" errorId="settings-display-name-errors" />
            </div>
          </section>

          <section class="card" aria-labelledby="settings-preferences-heading">
            <h2 id="settings-preferences-heading">Preferences</h2>
            <div class="form-field">
              <label class="toggle">
                <input type="checkbox" formControlName="planStartNotificationsEnabled" aria-describedby="settings-notifications-hint" />
                Plan start notifications
              </label>
              <small id="settings-notifications-hint" class="muted">Notify me when a To-Do Plan's start time arrives.</small>
              <app-field-errors
                [control]="form.controls.planStartNotificationsEnabled"
                label="Plan start notifications"
                errorId="settings-notifications-errors"
              />
            </div>
            <div class="form-field">
              <label for="settings-default-view">Default view</label>
              <select
                id="settings-default-view"
                formControlName="defaultView"
                aria-describedby="settings-default-view-hint settings-default-view-errors"
              >
                @for (v of views; track v) {
                  <option [value]="v">{{ labels[v] }}</option>
                }
              </select>
              <small id="settings-default-view-hint" class="muted">The page QuickFlow opens on.</small>
              <app-field-errors [control]="form.controls.defaultView" label="Default view" errorId="settings-default-view-errors" />
            </div>
          </section>

          <div class="actions">
            <button type="submit" class="btn btn--primary" [disabled]="saving()">
              {{ saving() ? 'Saving…' : 'Save settings' }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .settings { display: flex; flex-direction: column; gap: 1rem; max-width: 40rem; }
    .settings h2 { margin: 0 0 0.75rem; font-size: 1.1rem; }
    .settings .form-field:last-child { margin-bottom: 0; }
    .toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
    .form-field .toggle input { width: auto; margin: 0; }
    .actions { display: flex; justify-content: flex-end; }
    .form-error { padding: 0.5rem 0.75rem; border-radius: var(--radius); background: var(--danger-soft); color: var(--danger); }
    .form-error p { margin: 0; }
  `,
})
export class SettingsPage {
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly form = createSettingsForm();
  protected readonly views = DEFAULT_VIEWS;
  protected readonly labels = DEFAULT_VIEW_LABELS;
  protected readonly nameMax = DISPLAY_NAME_MAX;

  /** True after the values were loaded (until then the loading state is shown). */
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly summary = signal<string[]>([]);

  private loadSub?: Subscription;
  private saveSub?: Subscription;

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => {
      this.loadSub?.unsubscribe();
      this.saveSub?.unsubscribe();
    });
  }

  /** Fetches fresh values (also refreshes the app-wide store) and fills the form. */
  load(): void {
    this.loadSub?.unsubscribe();
    this.loadError.set(null);
    this.loaded.set(false);
    this.loadSub = this.settings.refresh().subscribe({
      next: (s) => {
        this.form.reset(settingsFormValue(s));
        this.summary.set([]);
        this.loaded.set(true);
      },
      error: (e: unknown) => this.loadError.set(toApiError(e)),
    });
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.summary.set([CHECK_FIELDS]);
      return;
    }
    this.saving.set(true);
    this.summary.set([]);
    this.saveSub = this.settings.save(toUpdateSettingsRequest(this.form)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.form.reset(settingsFormValue(saved));
        this.toast.success('Settings saved');
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        this.saving.set(false);
        if (err.isValidationError && err.hasFieldErrors) {
          const rest = applyServerErrors(this.form, err);
          this.summary.set(rest.length ? rest : [CHECK_FIELDS]);
        } else {
          this.summary.set([err.message]);
          this.toast.error(`Couldn't save settings: ${err.message}`);
        }
      },
    });
  }
}
