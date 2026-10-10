import { errorMessages } from '../../shared/forms/field-errors';
import { createHabitForm, habitFormValue, toHabitFormRequest } from './habit-form';
import { formatStreak, partitionHabits, toHabitRequest } from './habits.models';
import { makeHabit } from './testing/habit-fixtures';

describe('habit form', () => {
  const messages = (form: ReturnType<typeof createHabitForm>, field: 'name' | 'description' | 'frequency', label: string) =>
    errorMessages(form.controls[field].errors ?? {}, label);

  it('defaults to an empty name and Daily, and is invalid until a name is entered', () => {
    const form = createHabitForm();
    expect(form.getRawValue()).toEqual({ name: '', description: '', frequency: 'Daily' });
    expect(form.valid).toBeFalse();
    expect(messages(form, 'name', 'Name')).toEqual(['Name is required.']);
  });

  it('rejects whitespace-only names (BR-06)', () => {
    const form = createHabitForm();
    form.controls.name.setValue('   ');
    expect(messages(form, 'name', 'Name')).toEqual(['Name is required.']);
  });

  it('accepts 150 characters and rejects 151 (after trim)', () => {
    const form = createHabitForm();
    form.controls.name.setValue('a'.repeat(150));
    expect(form.controls.name.valid).toBeTrue();
    form.controls.name.setValue(`  ${'a'.repeat(150)}  `);
    expect(form.controls.name.valid).toBeTrue();
    form.controls.name.setValue('a'.repeat(151));
    expect(messages(form, 'name', 'Name')).toEqual(['Name must be at most 150 characters.']);
  });

  it('limits the description to 2000 characters', () => {
    const form = createHabitForm();
    form.controls.description.setValue('d'.repeat(2000));
    expect(form.controls.description.valid).toBeTrue();
    form.controls.description.setValue('d'.repeat(2001));
    expect(messages(form, 'description', 'Description')).toEqual(['Description must be at most 2000 characters.']);
  });

  it('requires a valid frequency', () => {
    const form = createHabitForm();
    form.controls.frequency.setValue('');
    expect(messages(form, 'frequency', 'Frequency')).toEqual(['Frequency is required.']);
    form.controls.frequency.setValue('Monthly' as never);
    expect(messages(form, 'frequency', 'Frequency')).toEqual(['Frequency must be one of: Daily, Weekly.']);
    form.controls.frequency.setValue('Weekly');
    expect(form.controls.frequency.valid).toBeTrue();
  });

  it('builds a trimmed request with an empty description as null', () => {
    const form = createHabitForm();
    form.setValue({ name: '  Read  ', description: '   ', frequency: 'Weekly' });
    expect(form.valid).toBeTrue();
    expect(toHabitFormRequest(form)).toEqual({ name: 'Read', description: null, frequency: 'Weekly' });
    form.controls.description.setValue('  20 pages ');
    expect(toHabitFormRequest(form).description).toBe('20 pages');
  });

  it('prefills from a habit', () => {
    expect(habitFormValue(makeHabit({ name: 'Run', description: null, frequency: 'Weekly' }))).toEqual({
      name: 'Run',
      description: '',
      frequency: 'Weekly',
    });
    expect(habitFormValue(null).frequency).toBe('Daily');
  });
});

describe('habit model helpers', () => {
  it('formatStreak uses days or weeks with plurals', () => {
    expect(formatStreak(0, 'Daily')).toBe('0 days');
    expect(formatStreak(1, 'Daily')).toBe('1 day');
    expect(formatStreak(4, 'Daily')).toBe('4 days');
    expect(formatStreak(1, 'Weekly')).toBe('1 week');
    expect(formatStreak(3, 'Weekly')).toBe('3 weeks');
  });

  it('partitionHabits keeps order and splits by isActive', () => {
    const a = makeHabit({ id: 1 });
    const b = makeHabit({ id: 2, isActive: false });
    const c = makeHabit({ id: 3 });
    const { active, inactive } = partitionHabits([a, b, c]);
    expect(active.map((h) => h.id)).toEqual([1, 3]);
    expect(inactive.map((h) => h.id)).toEqual([2]);
  });

  it('toHabitRequest builds a full PUT body with overrides', () => {
    const h = makeHabit({ name: 'Run', description: 'd', frequency: 'Daily' });
    expect(toHabitRequest(h, { frequency: 'Weekly' })).toEqual({ name: 'Run', description: 'd', frequency: 'Weekly' });
  });
});
