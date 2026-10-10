import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import {
  CreateLearningCardRequest,
  CreateLearningMilestoneRequest,
  CreateLearningNoteRequest,
  LearningCardDetail,
  LearningCardListQuery,
  LearningCardStatus,
  LearningCardSummary,
  LearningMilestone,
  LearningNote,
  toLearningCardUpdateRequest,
  toMilestoneUpdateRequest,
  UpdateLearningCardRequest,
  UpdateLearningMilestoneRequest,
} from './learning.models';

const BASE = '/api/learning-cards';

/**
 * Learning cards API (M04 handoff). Errors arrive as `ApiError`.
 *
 * Milestone and note mutations return only the child: refetch the card (`get`) to update
 * `milestonesTotal` / `milestonesDone`. Card and milestone PUTs are full replacements, so use
 * `setStatus` / `setMilestoneDone`, which keep the other fields.
 *
 * Reusable: M06 (item picker: `list()`), M08 (snapshot: `list()`; quick-add via the dialog).
 */
@Injectable({ providedIn: 'root' })
export class LearningApi {
  private readonly api = inject(ApiClient);

  /** `GET /api/learning-cards` (oldest first). `status` omitted or empty returns all cards. */
  list(query: LearningCardListQuery = {}): Observable<LearningCardSummary[]> {
    return this.api.get<LearningCardSummary[]>(BASE, { status: query.status || undefined });
  }

  /** `GET /api/learning-cards/{id}` with milestones and notes. 404 when missing or deleted. */
  get(id: number): Observable<LearningCardDetail> {
    return this.api.get<LearningCardDetail>(`${BASE}/${id}`);
  }

  create(body: CreateLearningCardRequest): Observable<LearningCardDetail> {
    return this.api.post<LearningCardDetail>(BASE, body);
  }

  /** Full replacement: `title`, `status` and `description` (null clears it). */
  update(id: number, body: UpdateLearningCardRequest): Observable<LearningCardDetail> {
    return this.api.put<LearningCardDetail>(`${BASE}/${id}`, body);
  }

  /** Changes only the status: PUTs the card's current title and description with the new status. */
  setStatus(
    card: Pick<LearningCardSummary, 'id' | 'title' | 'description' | 'status'>,
    status: LearningCardStatus,
  ): Observable<LearningCardDetail> {
    return this.update(card.id, toLearningCardUpdateRequest(card, { status }));
  }

  /** Soft delete (204). Afterwards the card and all its milestone/note routes give 404. */
  delete(id: number): Observable<void> {
    return this.api.delete<void>(`${BASE}/${id}`);
  }

  addMilestone(cardId: number, body: CreateLearningMilestoneRequest): Observable<LearningMilestone> {
    return this.api.post<LearningMilestone>(`${BASE}/${cardId}/milestones`, body);
  }

  /** Full replacement (`title`, `targetDate`, `isDone`). */
  updateMilestone(
    cardId: number,
    milestoneId: number,
    body: UpdateLearningMilestoneRequest,
  ): Observable<LearningMilestone> {
    return this.api.put<LearningMilestone>(`${BASE}/${cardId}/milestones/${milestoneId}`, body);
  }

  /** Completes/un-completes a milestone, re-sending its current title and target date. */
  setMilestoneDone(
    milestone: Pick<LearningMilestone, 'id' | 'learningCardId' | 'title' | 'targetDate' | 'isDone'>,
    isDone: boolean,
  ): Observable<LearningMilestone> {
    return this.updateMilestone(
      milestone.learningCardId,
      milestone.id,
      toMilestoneUpdateRequest(milestone, { isDone }),
    );
  }

  /** Hard delete (204). */
  deleteMilestone(cardId: number, milestoneId: number): Observable<void> {
    return this.api.delete<void>(`${BASE}/${cardId}/milestones/${milestoneId}`);
  }

  addNote(cardId: number, body: CreateLearningNoteRequest): Observable<LearningNote> {
    return this.api.post<LearningNote>(`${BASE}/${cardId}/notes`, body);
  }

  /** Hard delete (204). */
  deleteNote(cardId: number, noteId: number): Observable<void> {
    return this.api.delete<void>(`${BASE}/${cardId}/notes/${noteId}`);
  }
}
