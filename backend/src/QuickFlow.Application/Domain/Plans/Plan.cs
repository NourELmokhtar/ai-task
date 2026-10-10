using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Plans;

/// <summary>
/// A time-boxed Todo Plan built from existing tasks, habits and learning cards (API resource <c>/api/plans</c>).
/// Soft-deletable (BR-14): a deleted plan is 404 and its items are hidden by their query filter.
/// Items are fixed after creation (A-17); only the metadata on this entity is editable.
/// </summary>
public class Plan : SoftDeletableEntity
{
    public const int TitleMaxLength = 200;

    public string Title { get; set; } = string.Empty;

    /// <summary>A-15: integer minutes, &gt; 0. Not validated against the start/end window.</summary>
    public int EstimatedDurationMinutes { get; set; }

    /// <summary>UTC.</summary>
    public DateTime StartDateTime { get; set; }

    /// <summary>UTC, after <see cref="StartDateTime"/> (BR-11).</summary>
    public DateTime EndDateTime { get; set; }

    /// <summary>A-16: integer ≥ 1, lower = higher priority. Duplicates allowed.</summary>
    public int PriorityOrder { get; set; }

    /// <summary>
    /// Last computed lifecycle status (M07, A-20). Derived from the window, the items and the clock on every read and
    /// persisted when it changes; responses always use the freshly computed value.
    /// </summary>
    public PlanStatus Status { get; set; } = PlanStatus.NotStarted;

    public List<PlanItem> Items { get; set; } = [];
}
