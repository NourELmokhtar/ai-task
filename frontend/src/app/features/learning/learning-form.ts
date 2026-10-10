import { FormControl, FormGroup, Validators } from '@angular/forms';
import { maxTrimmedLength, optionalDateOnly, requiredTrimmed } from '../../shared/forms/validators';
import {
  CreateLearningCardRequest,
  CreateLearningMilestoneRequest,
  CreateLearningNoteRequest,
  LEARNING_DESCRIPTION_MAX,
  LEARNING_TITLE_MAX,
  MILESTONE_TITLE_MAX,
  NOTE_TEXT_MAX,
} from './learning.models';

/* Client rules mirror the server (BR-08, A-14). Error keys match `<app-field-errors>` messages. */

export type LearningCardForm = FormGroup<{
  title: FormControl<string>;
  description: FormControl<string>;
}>;

/** Add Learning Card: title required (≤ 200 after trim), description ≤ 2000. */
export function createLearningCardForm(): LearningCardForm {
  return new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, maxTrimmedLength(LEARNING_TITLE_MAX)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(LEARNING_DESCRIPTION_MAX)],
    }),
  });
}

/** Trimmed request; an empty description is sent as null. */
export function toLearningCardFormRequest(form: LearningCardForm): CreateLearningCardRequest {
  const v = form.getRawValue();
  return { title: v.title.trim(), description: v.description.trim() || null };
}

export type MilestoneForm = FormGroup<{
  title: FormControl<string>;
  targetDate: FormControl<string>;
}>;

/** Add milestone: title required (≤ 200 after trim), optional `YYYY-MM-DD` target date. */
export function createMilestoneForm(): MilestoneForm {
  return new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, maxTrimmedLength(MILESTONE_TITLE_MAX)],
    }),
    targetDate: new FormControl('', { nonNullable: true, validators: [optionalDateOnly] }),
  });
}

/** Trimmed request; an empty target date is sent as null. */
export function toMilestoneFormRequest(form: MilestoneForm): CreateLearningMilestoneRequest {
  const v = form.getRawValue();
  return { title: v.title.trim(), targetDate: v.targetDate || null };
}

export type NoteForm = FormGroup<{ text: FormControl<string> }>;

/** Add note: text required (≤ 4000 after trim). */
export function createNoteForm(): NoteForm {
  return new FormGroup({
    text: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, maxTrimmedLength(NOTE_TEXT_MAX)],
    }),
  });
}

/** Trimmed request (inner newlines are kept). */
export function toNoteFormRequest(form: NoteForm): CreateLearningNoteRequest {
  return { text: form.getRawValue().text.trim() };
}
