import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

/** Renders toasts from `ToastService`. Mount once (the app shell does this). */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-host" aria-live="polite" aria-atomic="false" data-testid="toast-host">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast toast--{{ toast.kind }}" [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="toast__message">{{ toast.message }}</span>
          <button
            type="button"
            class="icon-btn"
            aria-label="Dismiss notification"
            (click)="toastService.dismiss(toast.id)"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-host {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      left: auto;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: min(24rem, calc(100vw - 2rem));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem 0.75rem 0.75rem 1rem;
      border-radius: var(--radius);
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--info);
      box-shadow: var(--shadow);
    }
    .toast--success {
      border-left-color: var(--success);
    }
    .toast--error {
      border-left-color: var(--danger);
    }
    .toast__message {
      flex: 1;
    }
  `,
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
}
