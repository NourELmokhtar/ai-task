/**
 * Public pieces of the Dashboard feature (M08) for other modules (e.g. M09 journeys):
 * `DashboardApi` (`GET /api/dashboard?today=`), the response types and the pure helpers
 * (`toDashboardMetrics`, `greeting`, `timeOfDay`, `formatLongDate`).
 * The route page (`DashboardPage`) is intentionally not exported.
 */
export * from './dashboard.models';
export { DashboardApi } from './dashboard-api.service';
export { DashboardMetricCards } from './components/dashboard-metrics';
