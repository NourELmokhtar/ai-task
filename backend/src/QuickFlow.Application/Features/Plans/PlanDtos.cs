using System.ComponentModel;
using QuickFlow.Application.Domain.Plans;

namespace QuickFlow.Application.Features.Plans;

/// <summary>
/// One plan item. <c>sourceTitle</c> is resolved even when the source was deleted later; <c>sourceAvailable</c> is then
/// false (A-24). <c>sourceTitle</c> is null only if the source row cannot be found at all.
/// </summary>
public sealed record PlanItemResponse(
    int Id,
    PlanItemSourceType SourceType,
    int SourceId,
    string? SourceTitle,
    bool SourceAvailable,
    bool IsDone)
{
    public static PlanItemResponse From(PlanItem item, IReadOnlyDictionary<PlanSourceKey, PlanSourceInfo> sources)
    {
        var source = sources.GetValueOrDefault(new PlanSourceKey(item.SourceType, item.SourceId));
        return new PlanItemResponse(item.Id, item.SourceType, item.SourceId, source?.Title, source?.Available ?? false, item.IsDone);
    }
}

/// <summary>
/// A plan with its items (creation order), the computed progress (<see cref="PlanProgressCalculator"/>) and the live
/// tracking fields (M07): <c>status</c> computed at <c>serverNow</c> (A-20), <c>restTimeSeconds</c> (A-21, null unless
/// InProgress) and <c>serverNow</c> (the UTC instant used for the computation, for client clock-skew correction).
/// </summary>
public sealed record PlanResponse(
    int Id,
    string Title,
    int EstimatedDurationMinutes,
    DateTime StartDateTime,
    DateTime EndDateTime,
    int PriorityOrder,
    [property: Description("Computed at serverNow (A-20): all items done -> Completed; now < start -> NotStarted; start <= now < end -> InProgress; now >= end -> Completed.")]
    PlanStatus Status,
    [property: Description("Whole seconds until endDateTime (truncated) while status is InProgress; otherwise null (A-21).")]
    long? RestTimeSeconds,
    [property: Description("Server UTC time at which status and restTimeSeconds were computed; use it to correct the client clock.")]
    DateTime ServerNow,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int TotalItems,
    int DoneItems,
    int ProgressPercent,
    IReadOnlyList<PlanItemResponse> Items)
{
    /// <summary>Builds the API model. Status and rest time are computed from the items and <paramref name="now"/> (UTC).</summary>
    public static PlanResponse From(
        Plan plan, IReadOnlyList<PlanItem> items, IReadOnlyDictionary<PlanSourceKey, PlanSourceInfo> sources, DateTime now)
    {
        var tracking = PlanTracking.Evaluate(plan, items, now);
        var progress = tracking.Progress;
        return new PlanResponse(
            plan.Id,
            plan.Title,
            plan.EstimatedDurationMinutes,
            plan.StartDateTime,
            plan.EndDateTime,
            plan.PriorityOrder,
            tracking.Status,
            tracking.RestTimeSeconds,
            now,
            plan.CreatedAt,
            plan.UpdatedAt,
            progress.TotalItems,
            progress.DoneItems,
            progress.ProgressPercent,
            items.OrderBy(i => i.Id).Select(i => PlanItemResponse.From(i, sources)).ToList());
    }
}

/// <summary>
/// <c>GET /api/plans?group=</c> filter (M07 B5). <see cref="Active"/> = InProgress and <see cref="Upcoming"/> = NotStarted,
/// both in the A-16 order; <see cref="Completed"/> = history (A-23), EndDateTime descending.
/// </summary>
public enum PlanGroup
{
    Active,
    Upcoming,
    Completed,
}

/// <summary>One InProgress plan in <see cref="PlanTrackingSummary"/> (M08 dashboard "active plans").</summary>
public sealed record ActivePlanSummary(
    int Id,
    string Title,
    DateTime StartDateTime,
    DateTime EndDateTime,
    int PriorityOrder,
    PlanStatus Status,
    int ProgressPercent,
    int DoneItems,
    int TotalItems,
    long? RestTimeSeconds);

/// <summary>
/// Reusable plan tracking roll-up for M08 (M07 B6): counts per computed status and the InProgress plans (A-16 order) with
/// progress and rest time, all evaluated at <see cref="ServerNow"/>.
/// </summary>
public sealed record PlanTrackingSummary(
    DateTime ServerNow,
    int InProgressCount,
    int UpcomingCount,
    int CompletedCount,
    IReadOnlyList<ActivePlanSummary> Active);

/// <summary>Body of <c>POST /api/plans</c>. All items start not done; the status is computed from the window and the clock (M07).</summary>
public sealed class CreatePlanRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Required. Integer minutes, greater than 0.")]
    public int? EstimatedDurationMinutes { get; set; }

    [Description("Required. ISO-8601 date-time; an offset is converted to UTC, no offset is treated as UTC.")]
    public DateTime? StartDateTime { get; set; }

    [Description("Required. ISO-8601 date-time, after startDateTime.")]
    public DateTime? EndDateTime { get; set; }

    [Description("Required. Integer >= 1; lower = higher priority. Duplicates allowed.")]
    public int? PriorityOrder { get; set; }

    [Description("Required. At least one item; each source must exist and not be deleted; no duplicate (sourceType, sourceId). Fixed after creation.")]
    public List<CreatePlanItemRequest?>? Items { get; set; }
}

/// <summary>One item of <see cref="CreatePlanRequest"/>.</summary>
public sealed class CreatePlanItemRequest
{
    [Description("Required. One of: Task, Habit, LearningResource.")]
    public string? SourceType { get; set; }

    [Description("Required. Id of an existing, non-deleted task, habit or learning card.")]
    public int? SourceId { get; set; }
}

/// <summary>Body of <c>PUT /api/plans/{id}</c>. Full replacement of the metadata; items cannot be changed (A-17).</summary>
public sealed class UpdatePlanRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Required. Integer minutes, greater than 0.")]
    public int? EstimatedDurationMinutes { get; set; }

    [Description("Required. ISO-8601 date-time; an offset is converted to UTC, no offset is treated as UTC.")]
    public DateTime? StartDateTime { get; set; }

    [Description("Required. ISO-8601 date-time, after startDateTime.")]
    public DateTime? EndDateTime { get; set; }

    [Description("Required. Integer >= 1; lower = higher priority. Duplicates allowed.")]
    public int? PriorityOrder { get; set; }
}

/// <summary>Body of <c>PATCH /api/plans/{id}/items/{itemId}</c>.</summary>
public sealed class UpdatePlanItemRequest
{
    [Description("Required. true marks the item done (a Task item also completes the task, BR-13); false only clears the item flag.")]
    public bool? IsDone { get; set; }
}
