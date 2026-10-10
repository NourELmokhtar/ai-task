import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConnectivityBanner } from './core/connectivity/connectivity-banner';
import { ConnectivityService } from './core/connectivity/connectivity.service';
import { NAV_ITEMS } from './core/layout/nav-items';
// Direct import (not the plans barrel) so only the watcher, not the plan UI, lands in the main bundle.
import { PlanStartWatcherService } from './features/plans/plan-start-watcher.service';
import { ToastHost } from './shared/toast/toast-host';

/**
 * App shell: brand, persistent main navigation, connectivity banner, routed page, toast host.
 * Starts the global plan start watcher (M07) once, so start notifications work on every route.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConnectivityBanner, ToastHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly connectivity = inject(ConnectivityService);
  private readonly planWatcher = inject(PlanStartWatcherService);
  protected readonly navItems = NAV_ITEMS;

  ngOnInit(): void {
    this.connectivity.check();
    this.planWatcher.start();
  }
}
