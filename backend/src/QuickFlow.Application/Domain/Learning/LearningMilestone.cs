using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Learning;

/// <summary>
/// A milestone of exactly one learning card (BR-09). Removing a milestone deletes the row (not soft-deleted).
/// Milestones of a soft-deleted card stay in the database but are hidden by the query filter (BR-14).
/// </summary>
public class LearningMilestone : Entity
{
    public const int TitleMaxLength = 200;

    public int LearningCardId { get; set; }
    public LearningCard LearningCard { get; set; } = null!;

    public string Title { get; set; } = string.Empty;

    public bool IsDone { get; set; }

    public DateOnly? TargetDate { get; set; }

    /// <summary>A-13: UTC time the milestone was marked done (from <see cref="TimeProvider"/>); null while not done.</summary>
    public DateTime? CompletedAt { get; set; }
}
