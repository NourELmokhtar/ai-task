/**
 * Learning Resources DTOs mirroring the M04 API contract (see the M04 handoff), plus small helpers.
 */

export type LearningCardStatus = 'NotStarted' | 'InProgress' | 'Completed';

export const LEARNING_CARD_STATUSES: readonly LearningCardStatus[] = ['NotStarted', 'InProgress', 'Completed'];

export const LEARNING_CARD_STATUS_LABELS: Readonly<Record<LearningCardStatus, string>> = {
  NotStarted: 'Not started',
  InProgress: 'In progress',
  Completed: 'Completed',
};

/** Validation limits (BR-08, A-14). Titles and note text are measured after trimming. */
export const LEARNING_TITLE_MAX = 200;
export const LEARNING_DESCRIPTION_MAX = 2000;
export const MILESTONE_TITLE_MAX = 200;
export const NOTE_TEXT_MAX = 4000;

/** `LearningCardSummary` (list item). */
export interface LearningCardSummary {
  id: number;
  title: string;
  /** Description or source (link, book, course name). */
  description: string | null;
  /** User-set (A-12); never derived from milestones. */
  status: LearningCardStatus;
  /** ISO UTC */
  createdAt: string;
  /** ISO UTC. Changes on card PUT only. */
  updatedAt: string;
  milestonesTotal: number;
  milestonesDone: number;
}

/** `LearningMilestoneResponse`. */
export interface LearningMilestone {
  id: number;
  learningCardId: number;
  title: string;
  isDone: boolean;
  /** `YYYY-MM-DD` or null */
  targetDate: string | null;
  /** ISO UTC, set while `isDone` is true. */
  completedAt: string | null;
}

/** `LearningNoteResponse`. */
export interface LearningNote {
  id: number;
  learningCardId: number;
  text: string;
  /** ISO UTC (the note timestamp to display). */
  createdAt: string;
}

/** `LearningCardDetail` (GET by id, POST, PUT). */
export interface LearningCardDetail extends LearningCardSummary {
  /** Creation order. */
  milestones: LearningMilestone[];
  /** Oldest first. */
  notes: LearningNote[];
}

/** `POST /api/learning-cards`. */
export interface CreateLearningCardRequest {
  title: string;
  description: string | null;
}

/** `PUT /api/learning-cards/{id}`: full replacement (an omitted/null description clears it). */
export interface UpdateLearningCardRequest {
  title: string;
  description: string | null;
  status: LearningCardStatus;
}

/** `POST /api/learning-cards/{id}/milestones`. */
export interface CreateLearningMilestoneRequest {
  title: string;
  /** `YYYY-MM-DD` or null */
  targetDate: string | null;
}

/** `PUT /api/learning-cards/{id}/milestones/{milestoneId}`: full replacement (null targetDate clears it). */
export interface UpdateLearningMilestoneRequest {
  title: string;
  targetDate: string | null;
  isDone: boolean;
}

/** `POST /api/learning-cards/{id}/notes`. */
export interface CreateLearningNoteRequest {
  text: string;
}

/** `GET /api/learning-cards` query. `status` omitted (or empty) returns all cards. */
export type LearningCardListQuery = {
  status?: LearningCardStatus | '';
};

/** Full card PUT body from a card, keeping title and description, with optional overrides. */
export function toLearningCardUpdateRequest(
  card: Pick<LearningCardSummary, 'title' | 'description' | 'status'>,
  changes: Partial<UpdateLearningCardRequest> = {},
): UpdateLearningCardRequest {
  return { title: card.title, description: card.description, status: card.status, ...changes };
}

/** Full milestone PUT body from a milestone, keeping title and targetDate, with optional overrides. */
export function toMilestoneUpdateRequest(
  milestone: Pick<LearningMilestone, 'title' | 'targetDate' | 'isDone'>,
  changes: Partial<UpdateLearningMilestoneRequest> = {},
): UpdateLearningMilestoneRequest {
  return { title: milestone.title, targetDate: milestone.targetDate, isDone: milestone.isDone, ...changes };
}

/** Strips milestones and notes from a detail (for lists of summaries). */
export function toLearningCardSummary(card: LearningCardSummary | LearningCardDetail): LearningCardSummary {
  const { id, title, description, status, createdAt, updatedAt, milestonesTotal, milestonesDone } = card;
  return { id, title, description, status, createdAt, updatedAt, milestonesTotal, milestonesDone };
}

/** `"1/2"` (done/total). */
export function formatMilestoneProgress(card: Pick<LearningCardSummary, 'milestonesDone' | 'milestonesTotal'>): string {
  return `${card.milestonesDone}/${card.milestonesTotal}`;
}

/** Done share in percent (0 when there are no milestones). */
export function milestonePercent(card: Pick<LearningCardSummary, 'milestonesDone' | 'milestonesTotal'>): number {
  return card.milestonesTotal > 0 ? Math.round((card.milestonesDone / card.milestonesTotal) * 100) : 0;
}

/** True when the whole description is a single http(s) URL (rendered as a link). */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value || /\s/.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
