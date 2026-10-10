import { Routes } from '@angular/router';
import { NotFound } from './core/pages/not-found';
import { defaultViewRedirect } from './core/settings';

/**
 * Top-level routes. Each feature is lazy-loaded from `features/<name>/<name>.routes.ts`.
 * `''` redirects to the default view from Settings (M05; `/dashboard` when settings are unavailable).
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: defaultViewRedirect },
  {
    path: 'dashboard',
    title: 'Dashboard · QuickFlow',
    loadChildren: () => import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
  },
  {
    path: 'tasks',
    title: 'Tasks · QuickFlow',
    loadChildren: () => import('./features/tasks/tasks.routes').then((m) => m.TASKS_ROUTES),
  },
  {
    path: 'habits',
    title: 'Habits · QuickFlow',
    loadChildren: () => import('./features/habits/habits.routes').then((m) => m.HABITS_ROUTES),
  },
  {
    path: 'learning',
    title: 'Learning Resources · QuickFlow',
    loadChildren: () => import('./features/learning/learning.routes').then((m) => m.LEARNING_ROUTES),
  },
  {
    path: 'plans',
    title: 'Todo Plans · QuickFlow',
    loadChildren: () => import('./features/plans/plans.routes').then((m) => m.PLANS_ROUTES),
  },
  {
    path: 'settings',
    title: 'Settings · QuickFlow',
    loadChildren: () => import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
  },
  { path: '**', title: 'Page not found · QuickFlow', component: NotFound },
];
