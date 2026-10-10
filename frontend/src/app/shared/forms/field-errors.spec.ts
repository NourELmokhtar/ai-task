import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiError } from '../../core/api/api-error';
import { errorMessages, FieldErrors } from './field-errors';
import { applyServerErrors } from './server-errors';

@Component({
  imports: [ReactiveFormsModule, FieldErrors],
  template: `
    <form [formGroup]="form">
      <input formControlName="title" />
      <app-field-errors [control]="form.controls.title" label="Title" />
    </form>
  `,
})
class HostComponent {
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(5)] }),
    notes: new FormControl('', { nonNullable: true }),
  });
}

describe('FieldErrors / applyServerErrors', () => {
  it('builds messages for common validators', () => {
    expect(errorMessages({ required: true }, 'Title')).toEqual(['Title is required.']);
    expect(errorMessages({ maxlength: { requiredLength: 5, actualLength: 9 } }, 'Title')).toEqual([
      'Title must be at most 5 characters.',
    ]);
    expect(errorMessages({ server: ['Taken.'] })).toEqual(['Taken.']);
    expect(errorMessages({ pattern: {} }, 'Code', { pattern: 'Letters only.' })).toEqual(['Letters only.']);
  });

  it('shows errors only after the control is touched', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.field-errors')).toBeNull();

    fixture.componentInstance.form.controls.title.markAsTouched();
    fixture.detectChanges();
    expect(el.querySelector('.field-errors')?.textContent).toContain('Title is required.');
  });

  it('applies server field errors to controls and returns unmatched messages', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges(); // bind the form first, as in a real page before the API responds
    const form = fixture.componentInstance.form;
    form.controls.title.setValue('ok');
    const error = new ApiError(400, 'Validation', null, {
      title: ['Title already exists.'],
      other: ['Something else.'],
    });

    const unmatched = applyServerErrors(form, error);
    fixture.detectChanges();

    expect(unmatched).toEqual(['Something else.']);
    expect(form.controls.title.hasError('server')).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Title already exists.');

    form.controls.title.setValue('new');
    expect(form.controls.title.hasError('server')).toBeFalse();
  });
});
