import { Routes } from '@angular/router';
import { TasksPage } from './tasks-page';

/** Lazy-loaded routes for /tasks. Add child routes here. */
export const TASKS_ROUTES: Routes = [{ path: '', component: TasksPage }];
