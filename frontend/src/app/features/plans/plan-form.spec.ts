import { ApiError } from '../../core/api/api-error';
import {
  applyPlanServerErrors,
  createPlanForm,
  defaultPlanWindow,
  PLAN_MESSAGES,
  PlanForm,
  planFormValue,
  toCreatePlanRequest,
  toPlanMetadataRequest,
} from './plan-form';
import { SelectedPlanItem } from './plans.models';
import { makePlan, threeItems } from './testing/plan-fixtures';

const TASK: SelectedPlanItem = { sourceType: 'Task', sourceId: 42, title: 'Write report' };
const HABIT: SelectedPlanItem = { sourceType: 'Habit', sourceId: 16, title: 'Stretch' };

/** A valid create form (local times). */
function validForm(): PlanForm {
  const form = createPlanForm();
  form.setValue({
    title: '  Morning plan  ',
    duration: { hours: 1, minutes: 30 },
    startDateTime: '2026-10-11T09:00',
    endDateTime: '2026-10-11T12:00',
    priorityOrder: 2,
    items: [TASK, HABIT],
  });
  return form;
}

describe('plan-form', () => {
  it('a filled form is valid', () => {
    expect(validForm().valid).toBeTrue();
  });

  describe('client validation', () => {
    it('title is required (not whitespace) and at most 200 characters', () => {
      const form = validForm();
      form.controls.title.setValue('   ');
      expect(form.controls.title.hasError('required')).toBeTrue();
      form.controls.title.setValue('x'.repeat(201));
      expect(form.controls.title.hasError('maxlength')).toBeTrue();
      form.controls.title.setValue(`  ${'x'.repeat(200)}  `);
      expect(form.controls.title.valid).toBeTrue();
    });

    it('requires at least one item (BR-10)', () => {
      const form = validForm();
      form.controls.items.setValue([]);
      expect(form.controls.items.errors).toEqual({ items: PLAN_MESSAGES.items });
      expect(form.invalid).toBeTrue();
    });

    it('end must be after start (BR-11); equal is rejected', () => {
      const form = validForm();
      form.controls.endDateTime.setValue('2026-10-11T08:00');
      expect(form.controls.endDateTime.errors).toEqual({ endAfterStart: PLAN_MESSAGES.endAfterStart });
      form.controls.endDateTime.setValue('2026-10-11T09:00');
      expect(form.controls.endDateTime.hasError('endAfterStart')).toBeTrue();
      form.controls.endDateTime.setValue('2026-10-11T09:01');
      expect(form.controls.endDateTime.valid).toBeTrue();
    });

    it('re-checks the end when the start changes', () => {
      const form = validForm();
      form.controls.startDateTime.setValue('2026-10-11T13:00');
      expect(form.controls.endDateTime.hasError('endAfterStart')).toBeTrue();
      form.controls.startDateTime.setValue('2026-10-11T10:00');
      expect(form.controls.endDateTime.valid).toBeTrue();
    });

    it('start and end are required and must be valid date-times', () => {
      const form = validForm();
      form.controls.startDateTime.setValue('');
      expect(form.controls.startDateTime.hasError('required')).toBeTrue();
      form.controls.endDateTime.setValue('tomorrow');
      expect(form.controls.endDateTime.errors).toEqual({ dateTime: PLAN_MESSAGES.dateTime });
    });

    it('duration must be greater than 0 (A-15)', () => {
      const form = validForm();
      form.controls.duration.setValue({ hours: 0, minutes: 0 });
      expect(form.controls.duration.errors).toEqual({ duration: PLAN_MESSAGES.duration });
      form.controls.duration.setValue({ hours: null, minutes: null });
      expect(form.controls.duration.hasError('duration')).toBeTrue();
      form.controls.duration.setValue({ hours: 0, minutes: 1 });
      expect(form.controls.duration.valid).toBeTrue();
    });

    it('duration parts must be whole, hours ≥ 0 and minutes 0–59', () => {
      const form = validForm();
      for (const value of [
        { hours: -1, minutes: 30 },
        { hours: 1, minutes: 60 },
        { hours: 1.5, minutes: 0 },
      ]) {
        form.controls.duration.setValue(value);
        expect(form.controls.duration.errors).withContext(JSON.stringify(value)).toEqual({
          durationParts: PLAN_MESSAGES.durationParts,
        });
      }
    });

    it('priority order is required, a whole number and at least 1 (A-16)', () => {
      const form = validForm();
      form.controls.priorityOrder.setValue(0);
      expect(form.controls.priorityOrder.hasError('min')).toBeTrue();
      form.controls.priorityOrder.setValue(null);
      expect(form.controls.priorityOrder.hasError('required')).toBeTrue();
      form.controls.priorityOrder.setValue(1.5);
      expect(form.controls.priorityOrder.hasError('integer')).toBeTrue();
      form.controls.priorityOrder.setValue(1);
      expect(form.controls.priorityOrder.valid).toBeTrue();
    });

    it('edit mode disables (does not validate) the items', () => {
      const form = createPlanForm('edit');
      expect(form.controls.items.disabled).toBeTrue();
      expect(form.controls.items.errors).toBeNull();
    });
  });

  describe('requests', () => {
    it('converts local date-times to UTC ISO and hours/minutes to minutes', () => {
      const body = toCreatePlanRequest(validForm());
      expect(body).toEqual({
        title: 'Morning plan',
        estimatedDurationMinutes: 90,
        startDateTime: new Date(2026, 9, 11, 9, 0).toISOString(),
        endDateTime: new Date(2026, 9, 11, 12, 0).toISOString(),
        priorityOrder: 2,
        items: [
          { sourceType: 'Task', sourceId: 42 },
          { sourceType: 'Habit', sourceId: 16 },
        ],
      });
      expect(body.startDateTime).toMatch(/Z$/);
    });

    it('metadata request has no items', () => {
      expect('items' in toPlanMetadataRequest(validForm())).toBeFalse();
    });

    it('planFormValue maps a plan back to local inputs (UTC -> local round trip)', () => {
      const start = new Date(2026, 9, 11, 9, 15);
      const end = new Date(2026, 9, 11, 11, 45);
      const plan = makePlan({
        estimatedDurationMinutes: 125,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        priorityOrder: 3,
        items: threeItems(),
      });
      const value = planFormValue(plan);
      expect(value.startDateTime).toBe('2026-10-11T09:15');
      expect(value.endDateTime).toBe('2026-10-11T11:45');
      expect(value.duration).toEqual({ hours: 2, minutes: 5 });
      expect(value.items.map((i) => i.title)).toEqual(['Write report', 'Stretch', 'Clean Code']);

      const form = createPlanForm('edit');
      form.reset(value);
      expect(form.valid).toBeTrue();
      expect(toPlanMetadataRequest(form)).toEqual({
        title: plan.title,
        estimatedDurationMinutes: 125,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        priorityOrder: 3,
      });
    });

    it('defaultPlanWindow starts at the next full hour and lasts one hour', () => {
      expect(defaultPlanWindow(new Date(2026, 9, 10, 8, 25))).toEqual({
        start: '2026-10-10T09:00',
        end: '2026-10-10T10:00',
      });
      expect(defaultPlanWindow(new Date(2026, 9, 10, 23, 5))).toEqual({
        start: '2026-10-11T00:00',
        end: '2026-10-11T01:00',
      });
    });
  });

  describe('applyPlanServerErrors', () => {
    const problem = (errors: Record<string, string[]>) =>
      new ApiError(400, 'One or more validation errors occurred.', null, errors);

    it('maps items[i] keys to the i-th selected item and field keys to controls', () => {
      const form = validForm();
      const rest = applyPlanServerErrors(
        form,
        problem({
          'items[1].sourceId': ["Habit with id '16' does not exist or has been deleted."],
          endDateTime: ['End date/time must be after the start date/time.'],
          estimatedDurationMinutes: ['Estimated duration must be greater than 0 minutes.'],
        }),
      );
      expect(rest).toEqual([`Item 2 (Habit "Stretch"): Habit with id '16' does not exist or has been deleted.`]);
      expect(form.controls.endDateTime.errors?.['server']).toEqual(['End date/time must be after the start date/time.']);
      expect(form.controls.duration.errors?.['server']).toEqual(['Estimated duration must be greater than 0 minutes.']);
    });

    it('puts a plain "items" error on the items control and returns unknown keys', () => {
      const form = validForm();
      const rest = applyPlanServerErrors(
        form,
        problem({ items: ['At least one item is required.'], somethingElse: ['Odd.'] }),
      );
      expect(form.controls.items.errors?.['server']).toEqual(['At least one item is required.']);
      expect(rest).toEqual(['Odd.']);
    });
  });
});
