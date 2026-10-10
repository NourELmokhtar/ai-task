import { FormControl } from '@angular/forms';
import { errorMessages } from '../../shared/forms/field-errors';
import { createTaskForm, toTaskRequest, taskFormValue } from './task-form';
import { TaskPriority, TaskStatus } from './tasks.models';

describe('task form (BR-01..03)', () => {
  function valid() {
    const form = createTaskForm();
    form.setValue({ title: 'Write report', description: '', status: 'Todo', priority: 'Medium', dueDate: '' });
    return form;
  }

  it('is valid with a title and defaults', () => {
    expect(valid().valid).toBeTrue();
  });

  it('title: missing, blank and whitespace-only are required errors', () => {
    const form = valid();
    for (const title of ['', '   ', '\t\n']) {
      form.controls.title.setValue(title);
      expect(form.controls.title.errors).withContext(JSON.stringify(title)).toEqual({ required: true });
    }
    expect(errorMessages(form.controls.title.errors!, 'Title')).toEqual(['Title is required.']);
  });

  it('title: 200 chars is valid, 201 is not (measured after trimming)', () => {
    const form = valid();
    form.controls.title.setValue('a'.repeat(200));
    expect(form.controls.title.valid).toBeTrue();
    form.controls.title.setValue(`  ${'a'.repeat(200)}  `);
    expect(form.controls.title.valid).toBeTrue();
    form.controls.title.setValue('a'.repeat(201));
    expect(errorMessages(form.controls.title.errors!, 'Title')).toEqual([
      'Title must be at most 200 characters.',
    ]);
  });

  it('description: 2000 chars is valid, 2001 is not', () => {
    const form = valid();
    form.controls.description.setValue('d'.repeat(2000));
    expect(form.controls.description.valid).toBeTrue();
    form.controls.description.setValue('d'.repeat(2001));
    expect(errorMessages(form.controls.description.errors!, 'Description')).toEqual([
      'Description must be at most 2000 characters.',
    ]);
  });

  it('status and priority must be valid names', () => {
    const form = valid();
    (form.controls.status as FormControl<string>).setValue('Blocked' as TaskStatus);
    (form.controls.priority as FormControl<string>).setValue('Urgent' as TaskPriority);
    expect(errorMessages(form.controls.status.errors!, 'Status')).toEqual([
      'Status must be one of: Todo, InProgress, Done.',
    ]);
    expect(errorMessages(form.controls.priority.errors!, 'Priority')).toEqual([
      'Priority must be one of: Low, Medium, High.',
    ]);
  });

  it('due date must be empty or YYYY-MM-DD', () => {
    const form = valid();
    form.controls.dueDate.setValue('2026-10-20');
    expect(form.controls.dueDate.valid).toBeTrue();
    form.controls.dueDate.setValue('10/20/2026');
    expect(form.controls.dueDate.errors).toEqual({ dateOnly: 'Enter a valid date.' });
  });

  it('toTaskRequest trims text and sends empty optional fields as null', () => {
    const form = valid();
    form.patchValue({ title: '  Write report  ', description: '   ', priority: 'High' });
    expect(toTaskRequest(form)).toEqual({
      title: 'Write report',
      description: null,
      status: 'Todo',
      priority: 'High',
      dueDate: null,
    });
    form.patchValue({ description: ' Q3 numbers ', dueDate: '2026-10-20' });
    expect(toTaskRequest(form)).toEqual(
      jasmine.objectContaining({ description: 'Q3 numbers', dueDate: '2026-10-20' }),
    );
  });

  it('taskFormValue uses create defaults or the task values', () => {
    expect(taskFormValue(null, { dueDate: '2026-10-11' })).toEqual({
      title: '',
      description: '',
      status: 'Todo',
      priority: 'Medium',
      dueDate: '2026-10-11',
    });
  });
});
