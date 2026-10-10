/**
 * Public, reusable pieces of the Learning Resources feature (M04) for other features:
 * - M06 Todo Plans item picker: `LearningApi.list()`, `LearningCardSummary`
 * - M08 Dashboard: `LearningCardFormDialog` (quick add), `LearningApi.list()` for a snapshot
 * The route page (`LearningPage`) is intentionally not exported.
 */
export * from './learning.models';
export { LearningApi } from './learning-api.service';
export { LearningCardFormDialog } from './components/learning-card-form-dialog';
export { LearningCard } from './components/learning-card';
export {
  createLearningCardForm,
  createMilestoneForm,
  createNoteForm,
  toLearningCardFormRequest,
  toMilestoneFormRequest,
  toNoteFormRequest,
  type LearningCardForm,
  type MilestoneForm,
  type NoteForm,
} from './learning-form';
