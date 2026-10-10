import { AbstractControl } from '@angular/forms';
import { ApiError } from '../../core/api/api-error';

/**
 * Copies `ApiError.fieldErrors` onto matching form controls as a `server` error (shown by
 * `<app-field-errors>`; cleared automatically when the user edits the field).
 * Keys are camelCase API field names; nested paths like `items.0.name` also work.
 *
 * @returns messages that matched no control (show them as a form-level error or toast).
 */
export function applyServerErrors(form: AbstractControl, error: ApiError): string[] {
  const unmatched: string[] = [];
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const control = field ? form.get(field) : null;
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: [...messages] });
      control.markAsTouched();
    } else {
      unmatched.push(...messages);
    }
  }
  return unmatched;
}
