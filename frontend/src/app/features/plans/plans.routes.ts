import { Routes } from '@angular/router';
import { PlanBuilderPage } from './plan-builder-page';
import { PlansPage } from './plans-page';

/** Lazy-loaded routes for /plans: list, builder (create) and builder (edit metadata). */
export const PLANS_ROUTES: Routes = [
  { path: '', component: PlansPage },
  { path: 'new', title: 'Create Plan · QuickFlow', component: PlanBuilderPage },
  { path: ':id/edit', title: 'Edit Plan · QuickFlow', component: PlanBuilderPage },
];
