import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { makeItem, makePlan, threeItems } from '../testing/plan-fixtures';
import { PlanCard, PlanItemDoneChange } from './plan-card';
import { PlanProgressBar } from './plan-progress-bar';

describe('PlanProgressBar', () => {
  let fixture: ComponentFixture<PlanProgressBar>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(PlanProgressBar);
  });

  it('renders percent, counts and ARIA values', () => {
    fixture.componentRef.setInput('percent', 33);
    fixture.componentRef.setInput('done', 1);
    fixture.componentRef.setInput('total', 3);
    fixture.detectChanges();
    const bar = el().querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('33');
    expect(el().querySelector('[data-testid="plan-progress"]')!.getAttribute('data-percent')).toBe('33');
    expect(el().querySelector('[data-testid="plan-progress-text"]')!.textContent!.trim()).toBe('33% · 1/3');
    expect(el().querySelector<HTMLElement>('.progress__fill')!.style.width).toBe('33%');
  });

  it('clamps and rounds; text without counts is just the percent', () => {
    fixture.componentRef.setInput('percent', 140.4);
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="plan-progress-text"]')!.textContent!.trim()).toBe('100%');
    fixture.componentRef.setInput('percent', -3);
    fixture.detectChanges();
    expect(el().querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('PlanCard', () => {
  let fixture: ComponentFixture<PlanCard>;
  let changes: PlanItemDoneChange[];
  const el = () => fixture.nativeElement as HTMLElement;
  const items = () => Array.from(el().querySelectorAll<HTMLElement>('[data-testid="plan-item"]'));
  const box = (i: number) => items()[i].querySelector<HTMLInputElement>('input[type="checkbox"]')!;

  beforeEach(() => {
    fixture = TestBed.createComponent(PlanCard);
    changes = [];
    fixture.componentInstance.itemDoneChange.subscribe((c) => changes.push(c));
    fixture.componentRef.setInput('plan', makePlan({ id: 4, title: 'Morning', priorityOrder: 2, items: threeItems() }));
    fixture.detectChanges();
  });

  it('shows title, priority, duration, progress and items with type labels', () => {
    expect(el().querySelector('h2')!.textContent).toContain('Morning');
    expect(el().querySelector('[data-testid="plan-card"]')!.getAttribute('data-plan-id')).toBe('4');
    expect(el().querySelector('[data-testid="plan-priority"]')!.textContent).toContain('Priority 2');
    expect(el().querySelector('[data-testid="plan-duration"]')!.textContent).toContain('1h 30m');
    expect(el().querySelector('[data-testid="plan-window"]')!.textContent!.trim()).not.toBe('');
    expect(el().querySelector('[data-testid="plan-progress-text"]')!.textContent!.trim()).toBe('0% · 0/3');
    expect(items().map((i) => i.querySelector('[data-testid="plan-item-type"]')!.textContent!.trim())).toEqual([
      '✓ Task',
      '↻ Habit',
      '◆ Learning',
    ]);
    expect(box(0).getAttribute('aria-label')).toBe('Mark Write report as done');
    expect(el().querySelector('[data-testid="plan-item-removed"]')).toBeNull();
  });

  it('labels items whose source was removed', () => {
    fixture.componentRef.setInput('plan', makePlan({ items: [makeItem({ sourceAvailable: false })] }));
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="plan-item-removed"]')!.textContent).toContain('Source removed');
  });

  it('emits itemDoneChange with the requested state', () => {
    box(1).click();
    expect(changes.length).toBe(1);
    expect(changes[0].item.id).toBe(2);
    expect(changes[0].isDone).toBeTrue();
  });

  it('keeps the requested state while busy and reverts if busy clears without a plan change', () => {
    box(0).click();
    fixture.componentRef.setInput('busyItemIds', new Set([1]));
    fixture.detectChanges();
    expect(box(0).checked).toBeTrue();
    expect(box(0).disabled).toBeTrue();
    fixture.componentRef.setInput('busyItemIds', new Set());
    fixture.detectChanges();
    expect(box(0).checked).toBeFalse();
    expect(box(0).disabled).toBeFalse();
  });

  it('hides actions when actions=false and emits edit/remove otherwise', () => {
    let edits = 0;
    let removes = 0;
    fixture.componentInstance.edit.subscribe(() => edits++);
    fixture.componentInstance.remove.subscribe(() => removes++);
    el().querySelector<HTMLButtonElement>('button[aria-label="Edit Morning"]')!.click();
    el().querySelector<HTMLButtonElement>('button[aria-label="Remove Morning"]')!.click();
    expect([edits, removes]).toEqual([1, 1]);
    fixture.componentRef.setInput('actions', false);
    fixture.detectChanges();
    expect(el().querySelector('button[aria-label="Edit Morning"]')).toBeNull();
  });
});

@Component({
  imports: [PlanCard],
  template: `<app-plan-card [plan]="plan"><span planCardStatus data-testid="status-slot">Active</span><p planCardExtra data-testid="extra-slot">Rest 5m</p></app-plan-card>`,
})
class SlotHost {
  plan = makePlan();
}

describe('PlanCard extension slots (for M07)', () => {
  it('projects planCardStatus into the header and planCardExtra above the progress bar', () => {
    const fixture = TestBed.createComponent(SlotHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.plan__heading [data-testid="status-slot"]')).not.toBeNull();
    const extra = el.querySelector('[data-testid="extra-slot"]')!;
    expect(extra.nextElementSibling!.tagName.toLowerCase()).toBe('app-plan-progress-bar');
  });
});
