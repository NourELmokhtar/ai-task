import { LearningCardDetail, LearningCardSummary, LearningMilestone, LearningNote } from '../learning.models';

/* Test helpers with sensible defaults. Not used by app code. */

export function makeCard(changes: Partial<LearningCardSummary> = {}): LearningCardSummary {
  return {
    id: 1,
    title: 'Card',
    description: null,
    status: 'NotStarted',
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
    milestonesTotal: 0,
    milestonesDone: 0,
    ...changes,
  };
}

export function makeDetail(changes: Partial<LearningCardDetail> = {}): LearningCardDetail {
  const milestones = changes.milestones ?? [];
  return {
    ...makeCard({
      milestonesTotal: milestones.length,
      milestonesDone: milestones.filter((m) => m.isDone).length,
    }),
    milestones,
    notes: [],
    ...changes,
  };
}

export function makeMilestone(changes: Partial<LearningMilestone> = {}): LearningMilestone {
  return {
    id: 1,
    learningCardId: 1,
    title: 'Milestone',
    isDone: false,
    targetDate: null,
    completedAt: null,
    ...changes,
  };
}

export function makeNote(changes: Partial<LearningNote> = {}): LearningNote {
  return { id: 1, learningCardId: 1, text: 'Note', createdAt: '2026-10-10T10:00:00Z', ...changes };
}
