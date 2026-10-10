import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="page">
      <header class="page-header"><h1>Page not found</h1></header>
      <p class="muted">The page you're looking for doesn't exist.</p>
      <p><a class="btn btn--primary" routerLink="/dashboard">Go to Dashboard</a></p>
    </section>
  `,
})
export class NotFound {}
