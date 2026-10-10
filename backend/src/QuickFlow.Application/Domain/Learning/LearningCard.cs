using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Learning;

/// <summary>
/// A learning resource such as a course, book or topic (API resource <c>/api/learning-cards</c>).
/// Soft-deletable (BR-14): a deleted card is 404 and its milestones and notes are hidden by their query filters.
/// </summary>
public class LearningCard : SoftDeletableEntity
{
    public const int TitleMaxLength = 200;
    public const int DescriptionMaxLength = 2000;

    public string Title { get; set; } = string.Empty;

    /// <summary>Optional description or source (link, book or course name).</summary>
    public string? Description { get; set; }

    public LearningCardStatus Status { get; set; } = LearningCardStatus.NotStarted;
}
