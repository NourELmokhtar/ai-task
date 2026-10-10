import { Routes } from '@angular/router';
import { HabitsPage } from './habits-page';

/** Lazy-loaded routes for /habits. Add child routes here. */
export const HABITS_ROUTES: Routes = [{ path: '', component: HabitsPage }];
