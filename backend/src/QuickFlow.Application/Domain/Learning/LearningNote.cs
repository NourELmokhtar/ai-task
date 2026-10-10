using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Learning;

/// <summary>
/// A free-form, timestamped note of exactly one learning card. Notes are added and removed, never edited.
/// Removing a note deletes the row. Notes of a soft-deleted card are hidden by the query filter (BR-14).
/// </summary>
public class LearningNote : Entity
{
    public const int TextMaxLength = 4000;

    public int LearningCardId { get; set; }
    public LearningCard LearningCard { get; set; } = null!;

    public string Text { get; set; } = string.Empty;

    /// <summary>UTC time the note was added (set by the service from <see cref="TimeProvider"/>).</summary>
    public DateTime CreatedAt { get; set; }
}
