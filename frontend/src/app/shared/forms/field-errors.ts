import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Validation messages for one Reactive Forms control. Shown once the control is touched or dirty,
 * or immediately for server errors applied with `applyServerErrors()`.
 *
 * ```html
 * <input id="title" formControlName="title" [attr.aria-describedby]="'title-errors'" />
 * <app-field-errors [control]="form.controls.title" label="Title" errorId="title-errors" />
 * ```
 *
 * Uses default change detection on purpose: control state is not signal-based.
 */
@Component({
  selector: 'app-field-errors',
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    @if (visible()) {
      <ul class="field-errors" [id]="errorId() || null" data-testid="field-errors">
        @for (msg of messages(); track msg) {
          <li>{{ msg }}</li>
        }
      </ul>
    }
  `,
})
export class FieldErrors {
  readonly control = input<AbstractControl | null | undefined>(null);
  /** Field name used in messages, e.g. "Title is required." */
  readonly label = input<string>('This field');
  /** Optional id so inputs can reference the list via aria-describedby. */
  readonly errorId = input<string>('');
  /** Overrides per validator key, e.g. `{ pattern: 'Use letters only.' }`. */
  readonly customMessages = input<Readonly<Record<string, string>>>({});

  protected visible(): boolean {
    const c = this.control();
    if (!c || !c.errors) return false;
    return c.touched || c.dirty || 'server' in c.errors;
  }

  protected messages(): string[] {
    const errors = this.control()?.errors;
    return errors ? errorMessages(errors, this.label(), this.customMessages()) : [];
  }
}

/** Builds human-readable messages from Angular `ValidationErrors` (plus `server` errors). */
export function errorMessages(
  errors: ValidationErrors,
  label = 'This field',
  custom: Readonly<Record<string, string>> = {},
): string[] {
  const result: string[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (custom[key]) {
      result.push(custom[key]);
      continue;
    }
    switch (key) {
      case 'server':
        result.push(...(Array.isArray(value) ? value.map(String) : [String(value)]));
        break;
      case 'required':
        result.push(`${label} is required.`);
        break;
      case 'minlength':
        result.push(`${label} must be at least ${value.requiredLength} characters.`);
        break;
      case 'maxlength':
        result.push(`${label} must be at most ${value.requiredLength} characters.`);
        break;
      case 'min':
        result.push(`${label} must be at least ${value.min}.`);
        break;
      case 'max':
        result.push(`${label} must be at most ${value.max}.`);
        break;
      case 'email':
        result.push('Enter a valid email address.');
        break;
      case 'pattern':
        result.push(`${label} has an invalid format.`);
        break;
      default:
        result.push(typeof value === 'string' ? value : `${label} is invalid.`);
    }
  }
  return result;
}
