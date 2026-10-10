namespace QuickFlow.Application.Features.Learning;

/// <summary>
/// Learning resource use cases (M04). Methods throw <c>NotFoundException</c> (404) for a missing or soft-deleted card,
/// and for a milestone or note that does not exist on the given card (BR-09), and <c>ValidationException</c> (400)
/// for invalid input.
/// </summary>
public interface ILearningService
{
    /// <summary>Cards (oldest first) with milestone counts. <paramref name="status"/>: null/empty = all, else a status name (400 if invalid).</summary>
    Task<IReadOnlyList<LearningCardSummary>> ListAsync(string? status, CancellationToken cancellationToken = default);

    /// <summary>One card with its milestones and notes.</summary>
    Task<LearningCardDetail> GetAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>Creates a card with status NotStarted (BR-08).</summary>
    Task<LearningCardDetail> CreateAsync(CreateLearningCardRequest request, CancellationToken cancellationToken = default);

    /// <summary>Replaces title, description and the user-set status (A-12).</summary>
    Task<LearningCardDetail> UpdateAsync(int id, UpdateLearningCardRequest request, CancellationToken cancellationToken = default);

    /// <summary>Soft delete (BR-14). Afterwards the card, its milestones and its notes are 404 / no longer returned.</summary>
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>Adds a milestone (not done) to the card (A-14).</summary>
    Task<LearningMilestoneResponse> AddMilestoneAsync(int cardId, CreateLearningMilestoneRequest request, CancellationToken cancellationToken = default);

    /// <summary>Replaces title, targetDate and isDone. isDone true sets completedAt (kept if already done); false clears it (A-13).</summary>
    Task<LearningMilestoneResponse> UpdateMilestoneAsync(int cardId, int milestoneId, UpdateLearningMilestoneRequest request, CancellationToken cancellationToken = default);

    /// <summary>Deletes the milestone row (hard delete).</summary>
    Task RemoveMilestoneAsync(int cardId, int milestoneId, CancellationToken cancellationToken = default);

    /// <summary>Adds a timestamped note (A-14).</summary>
    Task<LearningNoteResponse> AddNoteAsync(int cardId, CreateLearningNoteRequest request, CancellationToken cancellationToken = default);

    /// <summary>Deletes the note row (hard delete).</summary>
    Task RemoveNoteAsync(int cardId, int noteId, CancellationToken cancellationToken = default);

    /// <summary>For other modules (e.g. M06): true if the card exists and is not deleted (any status).</summary>
    Task<bool> ExistsAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// For other modules (e.g. M06): titles of the given cards. By default only cards that exist and are not deleted;
    /// with <paramref name="includeDeleted"/> soft-deleted cards are included too (for "source removed" display, A-24).
    /// Ids that are not found are absent from the result.
    /// </summary>
    Task<IReadOnlyDictionary<int, string>> GetTitlesAsync(IEnumerable<int> ids, bool includeDeleted = false, CancellationToken cancellationToken = default);
}
