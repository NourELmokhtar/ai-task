using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Plans;

/// <summary>
/// One entry of a plan, referencing a task, habit or learning card by (<see cref="SourceType"/>, <see cref="SourceId"/>).
/// <see cref="SourceId"/> has no foreign key (polymorphic). The item is kept if the source is deleted later (A-24).
/// Items of a soft-deleted plan stay in the database but are hidden by the query filter (BR-14).
/// </summary>
public class PlanItem : Entity
{
    public int PlanId { get; set; }
    public Plan Plan { get; set; } = null!;

    public PlanItemSourceType SourceType { get; set; }

    public int SourceId { get; set; }

    /// <summary>Plan-local done flag. Only a Task item propagates "done" to its source (BR-13 / A-19).</summary>
    public bool IsDone { get; set; }
}
