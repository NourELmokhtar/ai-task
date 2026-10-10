/**
 * Public, reusable pieces of the Todo Plans feature (M06 + M07) for other features:
 * - M06: `PlansApi`, `PlanDto`, `PlanCard` (slots `planCardStatus` / `planCardExtra`), `PlanProgressBar`
 * - M07 (for M08 Dashboard): `RestTime` (live countdown), `PlanStatusBadge`, `PlanTiming`
 *   (rest time / "Starts …" / "Ended …"), `PlanStartWatcherService` (global start watcher,
 *   `highlighted()`, `started$`), pure helpers in `plan-tracking.ts` (`groupPlans`, `serverOffsetMs`,
 *   `msUntil`, `formatCountdown`, `PLAN_STATUS_LABELS`)
 * The route pages (`PlansPage`, `PlanBuilderPage`) are intentionally not exported.
 */
export * from './plans.models';
export * from './plan-tracking';
export { RestTime, REST_TIME_TICK_MS } from './components/rest-time';
export { PlanStatusBadge } from './components/plan-status-badge';
export { PlanTiming } from './components/plan-timing';
export {
  PlanStartWatcherService,
  PLAN_NOTIFIED_STORAGE_KEY,
  PLAN_START_TIMER_BUFFER_MS,
  PLAN_START_TIMER_HORIZON_MS,
  PLAN_START_TOAST_MS,
  PLAN_WATCH_POLL_MS,
  type PlanStartedEvent,
} from './plan-start-watcher.service';
export { PlansApi, planItemPath } from './plans-api.service';
export { PlanCard, type PlanItemDoneChange } from './components/plan-card';
export { PlanProgressBar } from './components/plan-progress-bar';
export { PlanItemPicker, filterOptions, type PickerOption } from './components/plan-item-picker';
export {
  applyPlanServerErrors,
  createPlanForm,
  defaultPlanWindow,
  planFormValue,
  toCreatePlanRequest,
  toPlanMetadataRequest,
  PLAN_MESSAGES,
  type PlanForm,
} from './plan-form';
