namespace QuickFlow.Application.Features.Plans;

/// <summary>
/// Todo Plan use cases (M06) with the time-driven lifecycle (M07). Methods throw <c>NotFoundException</c> (404) for a
/// missing or soft-deleted plan and for an item that does not belong to the given plan, and <c>ValidationException</c>
/// (400) for invalid input. Every returned plan carries the computed progress (<see cref="PlanProgressCalculator"/>), the
/// status/rest time evaluated at the injected clock (<see cref="PlanTracking"/>) and resolved source titles. A computed
/// status that differs from the stored one is persisted (A-20, NFR-R2).
/// </summary>
public interface IPlanService
{
    /// <summary>
    /// Plans, optionally filtered by computed status (M07 B5). <c>null</c> = all plans and <see cref="PlanGroup.Active"/> /
    /// <see cref="PlanGroup.Upcoming"/> (InProgress / NotStarted) are ordered by PriorityOrder, StartDateTime, id (A-16);
    /// <see cref="PlanGroup.Completed"/> (history, A-23) is ordered by EndDateTime descending, then id descending.
    /// </summary>
    Task<IReadOnlyList<PlanResponse>> ListAsync(PlanGroup? group = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reusable tracking roll-up for M08 (M07 B6): counts per computed status and the InProgress plans (A-16 order) with
    /// progress and rest time, evaluated at one server "now". Persists changed statuses like every other read.
    /// </summary>
    Task<PlanTrackingSummary> GetTrackingSummaryAsync(CancellationToken cancellationToken = default);

    Task<PlanResponse> GetAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>Creates a plan with ≥ 1 item, each referencing an available source (BR-10, BR-11, A-17). Status is computed.</summary>
    Task<PlanResponse> CreateAsync(CreatePlanRequest request, CancellationToken cancellationToken = default);

    /// <summary>Replaces the metadata (title, duration, start/end, priority) and recomputes the status. Items are unchanged (A-17).</summary>
    Task<PlanResponse> UpdateAsync(int id, UpdatePlanRequest request, CancellationToken cancellationToken = default);

    /// <summary>Soft delete (BR-14). Afterwards the plan is 404 and its items are no longer returned.</summary>
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sets one item's done flag and returns the full plan with the recomputed status (all done → Completed; un-marking
    /// inside the window → InProgress). BR-13 / A-19: <c>isDone=true</c> on a Task item also completes the task through
    /// <c>ITaskService.CompleteAsync</c>, saved in the same SaveChanges as the item and status (atomic). Un-done never
    /// reverts the task; Habit and LearningResource items change only the item flag.
    /// </summary>
    Task<PlanResponse> SetItemDoneAsync(int planId, int itemId, UpdatePlanItemRequest request, CancellationToken cancellationToken = default);
}
