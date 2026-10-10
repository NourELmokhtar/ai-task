import {
  createLearningCardForm,
  createMilestoneForm,
  createNoteForm,
  toLearningCardFormRequest,
  toMilestoneFormRequest,
  toNoteFormRequest,
} from './learning-form';
import {
  formatMilestoneProgress,
  isHttpUrl,
  milestonePercent,
  toLearningCardSummary,
  toLearningCardUpdateRequest,
  toMilestoneUpdateRequest,
} from './learning.models';
import { noteExcerpt } from './components/learning-notes';
import { makeCard, makeDetail, makeMilestone, makeNote } from './testing/learning-fixtures';

describe('learning card form', () => {
  it('requires a title (empty and whitespace-only)', () => {
    const form = createLearningCardForm();
    expect(form.controls.title.errors).toEqual({ required: true });
    form.controls.title.setValue('   ');
    expect(form.controls.title.errors).toEqual({ required: true });
    form.controls.title.setValue('Clean Code');
    expect(form.valid).toBeTrue();
  });

  it('limits the title to 200 characters after trimming', () => {
    const form = createLearningCardForm();
    form.controls.title.setValue(` ${'a'.repeat(200)} `);
    expect(form.controls.title.valid).toBeTrue();
    form.controls.title.setValue('a'.repeat(201));
    expect(form.controls.title.errors?.['maxlength']).toBeTruthy();
  });

  it('limits the description to 2000 characters (optional)', () => {
    const form = createLearningCardForm();
    form.controls.title.setValue('T');
    form.controls.description.setValue('d'.repeat(2000));
    expect(form.valid).toBeTrue();
    form.controls.description.setValue('d'.repeat(2001));
    expect(form.controls.description.errors?.['maxlength']).toBeTruthy();
  });

  it('builds a trimmed request with an empty description as null', () => {
    const form = createLearningCardForm();
    form.setValue({ title: '  Clean Code ', description: '   ' });
    expect(toLearningCardFormRequest(form)).toEqual({ title: 'Clean Code', description: null });
    form.setValue({ title: 'T', description: ' https://example.com ' });
    expect(toLearningCardFormRequest(form)).toEqual({ title: 'T', description: 'https://example.com' });
  });
});

describe('milestone form', () => {
  it('requires a title of at most 200 characters after trimming', () => {
    const form = createMilestoneForm();
    expect(form.controls.title.errors).toEqual({ required: true });
    form.controls.title.setValue('  ');
    expect(form.controls.title.errors).toEqual({ required: true });
    form.controls.title.setValue('m'.repeat(200));
    expect(form.valid).toBeTrue();
    form.controls.title.setValue('m'.repeat(201));
    expect(form.controls.title.errors?.['maxlength']).toBeTruthy();
  });

  it('accepts an empty or valid target date and rejects an invalid one', () => {
    const form = createMilestoneForm();
    form.controls.title.setValue('M');
    expect(form.valid).toBeTrue();
    form.controls.targetDate.setValue('2026-10-20');
    expect(form.valid).toBeTrue();
    form.controls.targetDate.setValue('2026-02-30');
    expect(form.controls.targetDate.errors).toEqual({ dateOnly: 'Enter a valid date.' });
  });

  it('builds a trimmed request with an empty target date as null', () => {
    const form = createMilestoneForm();
    form.setValue({ title: ' Ch 1 ', targetDate: '' });
    expect(toMilestoneFormRequest(form)).toEqual({ title: 'Ch 1', targetDate: null });
    form.setValue({ title: 'Ch 2', targetDate: '2026-10-20' });
    expect(toMilestoneFormRequest(form)).toEqual({ title: 'Ch 2', targetDate: '2026-10-20' });
  });
});

describe('note form', () => {
  it('requires text of at most 4000 characters after trimming', () => {
    const form = createNoteForm();
    expect(form.controls.text.errors).toEqual({ required: true });
    form.controls.text.setValue(' \n ');
    expect(form.controls.text.errors).toEqual({ required: true });
    form.controls.text.setValue(` ${'n'.repeat(4000)} `);
    expect(form.valid).toBeTrue();
    form.controls.text.setValue('n'.repeat(4001));
    expect(form.controls.text.errors?.['maxlength']).toEqual({ requiredLength: 4000, actualLength: 4001 });
  });

  it('trims the text but keeps inner newlines', () => {
    const form = createNoteForm();
    form.setValue({ text: '  line 1\nline 2  ' });
    expect(toNoteFormRequest(form)).toEqual({ text: 'line 1\nline 2' });
  });
});

describe('learning model helpers', () => {
  it('toLearningCardUpdateRequest keeps title and description', () => {
    const card = makeCard({ title: 'T', description: 'D', status: 'NotStarted' });
    expect(toLearningCardUpdateRequest(card, { status: 'Completed' })).toEqual({
      title: 'T',
      description: 'D',
      status: 'Completed',
    });
  });

  it('toMilestoneUpdateRequest keeps title and targetDate', () => {
    const m = makeMilestone({ title: 'M', targetDate: '2026-10-20', isDone: false });
    expect(toMilestoneUpdateRequest(m, { isDone: true })).toEqual({ title: 'M', targetDate: '2026-10-20', isDone: true });
  });

  it('toLearningCardSummary strips milestones and notes', () => {
    const detail = makeDetail({ id: 4, milestones: [makeMilestone({ isDone: true })], notes: [makeNote()] });
    const summary = toLearningCardSummary(detail);
    expect(summary).toEqual(makeCard({ id: 4, milestonesTotal: 1, milestonesDone: 1 }));
    expect('milestones' in summary).toBeFalse();
  });

  it('formats progress and percent', () => {
    expect(formatMilestoneProgress({ milestonesDone: 1, milestonesTotal: 2 })).toBe('1/2');
    expect(milestonePercent({ milestonesDone: 1, milestonesTotal: 3 })).toBe(33);
    expect(milestonePercent({ milestonesDone: 0, milestonesTotal: 0 })).toBe(0);
  });

  it('detects a description that is a single http(s) URL', () => {
    expect(isHttpUrl('https://example.com/course')).toBeTrue();
    expect(isHttpUrl(' http://x.dev ')).toBeTrue();
    expect(isHttpUrl('Book by Robert C. Martin')).toBeFalse();
    expect(isHttpUrl('see https://example.com')).toBeFalse();
    expect(isHttpUrl('javascript:alert(1)')).toBeFalse();
    expect(isHttpUrl(null)).toBeFalse();
  });

  it('noteExcerpt flattens whitespace and shortens long text', () => {
    expect(noteExcerpt('a\n b')).toBe('a b');
    expect(noteExcerpt('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});
