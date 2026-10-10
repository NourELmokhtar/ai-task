using QuickFlow.Application.Domain.Tasks;

namespace QuickFlow.Application.Features.Tasks;

/// <summary>
/// Task use cases (M02). Methods throw <c>NotFoundException</c> (404) for missing or soft-deleted tasks and
/// <c>ValidationException</c> (400) for invalid input. Map results with <see cref="TaskResponse.From"/>.
/// </summary>
public interface ITaskService
{
    /// <summary>Filtered, sorted list (B5). <paramref name="today"/> drives the overdue filter.</summary>
    Task<IReadOnlyList<TaskItem>> ListAsync(TaskListQuery query, DateOnly today, CancellationToken cancellationToken = default);

    Task<TaskItem> GetAsync(int id, CancellationToken cancellationToken = default);

    Task<TaskItem> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken = default);

    Task<TaskItem> UpdateAsync(int id, UpdateTaskRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reusable completion operation (B4; used by M06 for BR-13, NFR-M2). Sets Status = Done and CompletedAt = now (UTC)
    /// and saves. Idempotent: an already-done task keeps its original CompletedAt. Works on archived tasks.
    /// Saves through the shared scoped DbContext, so pending changes of the caller in the same scope are saved too.
    /// Throws NotFoundException if the task does not exist or is deleted.
    /// </summary>
    Task<TaskItem> CompleteAsync(int id, CancellationToken cancellationToken = default);

    Task<TaskItem> ArchiveAsync(int id, CancellationToken cancellationToken = default);

    Task<TaskItem> RestoreAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>Soft delete (BR-14). Afterwards the task is 404 on get and absent from all lists.</summary>
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// For other modules (M06): titles of the given tasks (archived or not). By default only tasks that exist and are not
    /// deleted; with <paramref name="includeDeleted"/> soft-deleted tasks are included too (for "source removed" display, A-24).
    /// Ids that are not found are absent from the result.
    /// </summary>
    Task<IReadOnlyDictionary<int, string>> GetTitlesAsync(IEnumerable<int> ids, bool includeDeleted = false, CancellationToken cancellationToken = default);
}
