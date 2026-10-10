import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isDateOnly } from '../utils/date-utils';

/**
 * Reusable Reactive Forms validators (moved here from the Tasks feature so other features can share
 * them). Error keys match `errorMessages()` in `field-errors.ts`, so `<app-field-errors>` shows
 * messages in the same wording as the API ("Name is required.", "… must be at most N characters.").
 */

/** Required and not whitespace-only. Reports `required` so messages match the server. */
export function requiredTrimmed(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  return typeof v === 'string' && v.trim().length > 0 ? null : { required: true };
}

/** Max length measured after trimming (the server trims names/titles). */
export function maxTrimmedLength(max: number): ValidatorFn {
  return (control) => {
    const v = control.value;
    const len = typeof v === 'string' ? v.trim().length : 0;
    return len > max ? { maxlength: { requiredLength: max, actualLength: len } } : null;
  };
}

/** Value must be one of `allowed`. The error value is the message (shown by `FieldErrors`). */
export function oneOf(allowed: readonly string[], label: string): ValidatorFn {
  return (control) =>
    allowed.includes(control.value) ? null : { oneOf: `${label} must be one of: ${allowed.join(', ')}.` };
}

/** Empty, or a valid `YYYY-MM-DD` calendar date. */
export function optionalDateOnly(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  return v === null || v === '' || isDateOnly(v) ? null : { dateOnly: 'Enter a valid date.' };
}
