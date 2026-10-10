/**
 * Public, reusable pieces of the Habits feature (M03) for other features:
 * - M06 Todo Plans item picker: `HabitsApi.list({ active: true })`, `HabitDto`
 * - M08 Dashboard: `HabitCard` (checklist row with today's toggle), `HabitFormDialog` (quick add),
 *   `HabitsApi.setCompletedToday`
 * The route page (`HabitsPage`) is intentionally not exported.
 */
export * from './habits.models';
export { HabitsApi } from './habits-api.service';
export { HabitCard } from './components/habit-card';
export { HabitFormDialog } from './components/habit-form-dialog';
export { createHabitForm, habitFormValue, habitFrequency, toHabitFormRequest, type HabitForm } from './habit-form';
