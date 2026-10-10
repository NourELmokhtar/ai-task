import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { maxTrimmedLength, oneOf, requiredTrimmed } from '../../shared/forms/validators';
import {
  HABIT_DESCRIPTION_MAX,
  HABIT_FREQUENCIES,
  HABIT_NAME_MAX,
  HabitDto,
  HabitFrequency,
  HabitRequest,
} from './habits.models';

const frequencyOneOf = oneOf(HABIT_FREQUENCIES, 'Frequency');

/** Frequency is required (`required`) and must be Daily or Weekly (`oneOf`), like the server. */
export function habitFrequency(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  return v === null || v === undefined || v === '' ? { required: true } : frequencyOneOf(control);
}

export type HabitForm = FormGroup<{
  name: FormControl<string>;
  description: FormControl<string>;
  frequency: FormControl<HabitFrequency | ''>;
}>;

/** Reactive form for creating/editing a habit. Client rules mirror BR-06 and the frequency enum. */
export function createHabitForm(): HabitForm {
  return new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, maxTrimmedLength(HABIT_NAME_MAX)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(HABIT_DESCRIPTION_MAX)],
    }),
    frequency: new FormControl<HabitFrequency | ''>('Daily', {
      nonNullable: true,
      validators: [habitFrequency],
    }),
  });
}

/** Form values for a habit (or the create defaults: Daily). */
export function habitFormValue(habit?: Pick<HabitDto, 'name' | 'description' | 'frequency'> | null) {
  return {
    name: habit?.name ?? '',
    description: habit?.description ?? '',
    frequency: habit?.frequency ?? ('Daily' as HabitFrequency),
  };
}

/** Request body from a valid form: trimmed text, empty description sent as null. */
export function toHabitFormRequest(form: HabitForm): HabitRequest {
  const v = form.getRawValue();
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    frequency: v.frequency as HabitFrequency,
  };
}
