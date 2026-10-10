import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

/** App-wide toast notifications, rendered by `<app-toast-host>` (mounted once in the app shell). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _toasts = signal<readonly Toast[]>([]);

  /** Currently visible toasts, oldest first. */
  readonly toasts = this._toasts.asReadonly();

  /** Shows a toast. `durationMs <= 0` keeps it until dismissed. Returns the toast id. */
  show(message: string, kind: ToastKind = 'info', durationMs = 4000): number {
    const id = this.nextId++;
    this._toasts.update((list) => [...list, { id, kind, message }]);
    if (durationMs > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), durationMs),
      );
    }
    return id;
  }

  success(message: string, durationMs = 4000): number {
    return this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs = 6000): number {
    return this.show(message, 'error', durationMs);
  }

  info(message: string, durationMs = 4000): number {
    return this.show(message, 'info', durationMs);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(id);
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this._toasts.set([]);
  }
}
