namespace QuickFlow.Application.Features.Habits;

/// <summary>
/// Habit use cases (M03). Methods throw <c>NotFoundException</c> (404) for missing or soft-deleted habits,
/// <c>ValidationException</c> (400) for invalid input and <c>ConflictException</c> (409) for a duplicate completion.
/// <c>today</c> is the effective date from <c>ITodayProvider</c>. It drives the progress fields and the future-date rule.
/// </summary>
public interface IHabitService
{
    /// <summary>All habits (oldest first). <paramref name="active"/>: null = all, true = active only, false = inactive only.</summary>
    Task<IReadOnlyList<HabitResponse>> ListAsync(bool? active, DateOnly today, CancellationToken cancellationToken = default);

    Task<HabitResponse> GetAsync(int id, DateOnly today, CancellationToken cancellationToken = default);

    Task<HabitResponse> CreateAsync(CreateHabitRequest request, DateOnly today, CancellationToken cancellationToken = default);

    Task<HabitResponse> UpdateAsync(int id, UpdateHabitRequest request, DateOnly today, CancellationToken cancellationToken = default);

    /// <summary>Sets isActive = true. Idempotent.</summary>
    Task<HabitResponse> ActivateAsync(int id, DateOnly today, CancellationToken cancellationToken = default);

    /// <summary>Sets isActive = false. Idempotent. Completions are kept.</summary>
    Task<HabitResponse> DeactivateAsync(int id, DateOnly today, CancellationToken cancellationToken = default);

    /// <summary>Soft delete (BR-14). Afterwards the habit is 404 everywhere and its completions are no longer returned.</summary>
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Records a completion for <paramref name="date"/> (default <paramref name="today"/>).
    /// 400 if the habit is inactive or the date is after today (A-11), 409 if that date is already completed (BR-07).
    /// </summary>
    Task<CompletionResponse> AddCompletionAsync(int id, DateOnly? date, DateOnly today, CancellationToken cancellationToken = default);

    /// <summary>Removes the completion for <paramref name="date"/>. 404 if the habit or that completion does not exist.</summary>
    Task RemoveCompletionAsync(int id, DateOnly date, CancellationToken cancellationToken = default);

    /// <summary>Completions ordered by date ascending, optionally limited to [from, to] (inclusive). 400 if to &lt; from.</summary>
    Task<IReadOnlyList<CompletionResponse>> ListCompletionsAsync(int id, DateOnly? from, DateOnly? to, CancellationToken cancellationToken = default);

    /// <summary>For other modules (e.g. M06): true if the habit exists and is not deleted (active or inactive).</summary>
    Task<bool> ExistsAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// For other modules (e.g. M06): names of the given habits that exist and are not deleted (active or inactive).
    /// Ids that are missing or deleted are absent from the result. With <paramref name="includeDeleted"/> soft-deleted
    /// habits are included too (M06 "source removed" display, A-24); missing ids are always absent.
    /// </summary>
    Task<IReadOnlyDictionary<int, string>> GetNamesAsync(IEnumerable<int> ids, bool includeDeleted = false, CancellationToken cancellationToken = default);
}
