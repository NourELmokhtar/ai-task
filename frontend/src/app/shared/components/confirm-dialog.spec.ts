import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `
    <app-confirm-dialog
      [(open)]="open"
      title="Delete task?"
      message="This can't be undone."
      confirmLabel="Delete"
      [danger]="true"
      (confirmed)="confirmed = confirmed + 1"
      (cancelled)="cancelled = cancelled + 1"
    />
  `,
})
class HostComponent {
  readonly open = signal(false);
  confirmed = 0;
  cancelled = 0;
}

describe('ConfirmDialog', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const dialog = (): HTMLDialogElement =>
      (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    const button = (label: string): HTMLButtonElement =>
      Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    return { fixture, host, dialog, button };
  }

  it('opens from the bound signal and emits confirmed', () => {
    const { fixture, host, dialog, button } = setup();
    expect(dialog().open).toBeFalse();

    host.open.set(true);
    fixture.detectChanges();
    expect(dialog().open).toBeTrue();
    expect(dialog().textContent).toContain('Delete task?');

    button('Delete').click();
    fixture.detectChanges();
    expect(host.confirmed).toBe(1);
    expect(host.cancelled).toBe(0);
    expect(host.open()).toBeFalse();
    expect(dialog().open).toBeFalse();
  });

  it('emits cancelled when Cancel is clicked', () => {
    const { fixture, host, dialog, button } = setup();
    host.open.set(true);
    fixture.detectChanges();

    button('Cancel').click();
    fixture.detectChanges();
    expect(host.cancelled).toBe(1);
    expect(host.confirmed).toBe(0);
    expect(dialog().open).toBeFalse();
  });
});
