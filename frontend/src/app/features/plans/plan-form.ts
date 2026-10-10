import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ApiError } from '../../core/api/api-error';
import { applyServerErrors } from '../../shared/forms/server-errors';
import { maxTrimmedLength, requiredTrimmed } from '../../shared/forms/validators';
import { localDateTimeToUtcIso, utcIsoToLocalDateTime } from '../../shared/utils/date-utils';
import {
  CreatePlanRequest,
  durationToMinutes,
  mapPlanItemErrors,
  minutesToDuration,
  PLAN_TITLE_MAX,
  PlanDto,
  SelectedPlanItem,
  UpdatePlanRequest,
} from './plans.models';

/*
 * Plan builder form. Client rules mirror the server (BR-10, BR-11, A-14..A-16) and use the same
 * wording, so `<app-field-errors>` shows the API's messages. Error values that are strings are
 * shown as-is by `FieldErrors`.
 */

export const PLAN_MESSAGES = {
  duration: 'Estimated duration must be greater than 0 minutes.',
  durationParts: 'Enter whole hours and 0–59 minutes.',
  dateTime: 'Enter a valid date and time.',
  endAfterStart: 'End date/time must be after the start date/time.',
  items: 'At least one item is required.',
  integer: 'Priority order must be a whole number.',
} as const;

export type PlanDurationGroup = FormGroup<{
  hours: FormControl<number | null>;
  minutes: FormControl<number | null>;
}>;

export type PlanForm = FormGroup<{
  title: FormControl<string>;
  duration: PlanDurationGroup;
  /** `datetime-local` value (`YYYY-MM-DDTHH:mm`, local time). */
  startDateTime: FormControl<string>;
  endDateTime: FormControl<string>;
  priorityOrder: FormControl<number | null>;
  /** Selected sources in selection order (= request order, so `items[i]` errors map back). */
  items: FormControl<SelectedPlanItem[]>;
}>;

const isWhole = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Hours ≥ 0 and minutes 0–59 (whole numbers, empty = 0), total > 0 (A-15). */
export function positiveDuration(group: AbstractControl): ValidationErrors | null {
  const { hours, minutes } = group.value as { hours: number | null; minutes: number | null };
  const partsOk = (hours === null || isWhole(hours)) && (minutes === null || (isWhole(minutes) && minutes <= 59));
  if (!partsOk) return { durationParts: PLAN_MESSAGES.durationParts };
  return durationToMinutes(hours, minutes) > 0 ? null : { duration: PLAN_MESSAGES.duration };
}

/** Empty (left to `required`) or a parseable `datetime-local` value. */
export function localDateTime(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  return !v || localDateTimeToUtcIso(v) !== null ? null : { dateTime: PLAN_MESSAGES.dateTime };
}

/** End after start (BR-11; equal is rejected). Compared as instants. Skipped while either is empty/invalid. */
export function endAfterStart(control: AbstractControl): ValidationErrors | null {
  const start = localDateTimeToUtcIso(control.parent?.get('startDateTime')?.value ?? '');
  const end = localDateTimeToUtcIso(control.value ?? '');
  if (!start || !end) return null;
  return Date.parse(end) > Date.parse(start) ? null : { endAfterStart: PLAN_MESSAGES.endAfterStart };
}

/** At least one selected item (BR-10). */
export function atLeastOneItem(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  return Array.isArray(v) && v.length > 0 ? null : { items: PLAN_MESSAGES.items };
}

/** Whole number (pairs with `Validators.min(1)` for the priority order). */
export function integer(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  return v === null || v === '' || Number.isInteger(v) ? null : { integer: PLAN_MESSAGES.integer };
}

/**
 * New builder form. In `edit` mode the items control is disabled (items are fixed after creation,
 * A-17), so it is not validated or sent.
 */
export function createPlanForm(mode: 'create' | 'edit' = 'create'): PlanForm {
  const form: PlanForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, maxTrimmedLength(PLAN_TITLE_MAX)],
    }),
    duration: new FormGroup(
      {
        hours: new FormControl<number | null>(1),
        minutes: new FormControl<number | null>(0),
      },
      { validators: positiveDuration },
    ),
    startDateTime: new FormControl('', { nonNullable: true, validators: [Validators.required, localDateTime] }),
    endDateTime: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, localDateTime, endAfterStart],
    }),
    priorityOrder: new FormControl<number | null>(1, [Validators.required, Validators.min(1), integer]),
    items: new FormControl<SelectedPlanItem[]>([], { nonNullable: true, validators: atLeastOneItem }),
  });
  // The end validator reads the start: re-check it whenever the start changes.
  form.controls.startDateTime.valueChanges.subscribe(() =>
    form.controls.endDateTime.updateValueAndValidity({ emitEvent: false }),
  );
  if (mode === 'edit') form.controls.items.disable();
  return form;
}

/** Metadata part of the request: trimmed title, minutes, UTC ISO times. Call only on a valid form. */
export function toPlanMetadataRequest(form: PlanForm): UpdatePlanRequest {
  const v = form.getRawValue();
  return {
    title: v.title.trim(),
    estimatedDurationMinutes: durationToMinutes(v.duration.hours, v.duration.minutes),
    startDateTime: localDateTimeToUtcIso(v.startDateTime) ?? '',
    endDateTime: localDateTimeToUtcIso(v.endDateTime) ?? '',
    priorityOrder: Number(v.priorityOrder),
  };
}

/** `POST /api/plans` body; items in selection order. */
export function toCreatePlanRequest(form: PlanForm): CreatePlanRequest {
  return {
    ...toPlanMetadataRequest(form),
    items: form.getRawValue().items.map(({ sourceType, sourceId }) => ({ sourceType, sourceId })),
  };
}

/** Form value for edit mode (local times, hours + minutes). Items are shown read-only from the plan. */
export function planFormValue(plan: PlanDto): ReturnType<PlanForm['getRawValue']> {
  return {
    title: plan.title,
    duration: minutesToDuration(plan.estimatedDurationMinutes),
    startDateTime: utcIsoToLocalDateTime(plan.startDateTime) ?? '',
    endDateTime: utcIsoToLocalDateTime(plan.endDateTime) ?? '',
    priorityOrder: plan.priorityOrder,
    items: plan.items.map((i) => ({ sourceType: i.sourceType, sourceId: i.sourceId, title: i.sourceTitle ?? '' })),
  };
}

/** Builder defaults: start at the next full local hour, end one hour later (`datetime-local` values). */
export function defaultPlanWindow(now: Date): { start: string; end: string } {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    start: utcIsoToLocalDateTime(start.toISOString()) ?? '',
    end: utcIsoToLocalDateTime(end.toISOString()) ?? '',
  };
}

/** Server key → form control path. */
const FIELD_ALIASES: Readonly<Record<string, string>> = { estimatedDurationMinutes: 'duration' };

/**
 * Applies a 400 to the builder: field keys go onto their controls (`server` error), `items[i]...`
 * keys become messages naming the i-th selected item.
 *
 * @returns messages for the form-level summary (item errors first, then unmatched keys).
 */
export function applyPlanServerErrors(form: PlanForm, err: ApiError): string[] {
  const { itemMessages, rest } = mapPlanItemErrors(err.fieldErrors, form.controls.items.value);
  const aliased: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(rest)) {
    const target = FIELD_ALIASES[key] ?? key;
    aliased[target] = [...(aliased[target] ?? []), ...messages];
  }
  const unmatched = applyServerErrors(form, new ApiError(err.status, err.title, err.detail, aliased));
  return [...itemMessages, ...unmatched];
}
