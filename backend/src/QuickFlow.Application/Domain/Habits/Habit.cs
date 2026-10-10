using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Habits;

/// <summary>
/// A recurring habit (API resource <c>/api/habits</c>). Soft-deletable (BR-14): a deleted habit is 404 and
/// its completions are hidden by the query filter on <see cref="HabitCompletion"/>.
/// </summary>
public class Habit : SoftDeletableEntity
{
    public const int NameMaxLength = 150;
    public const int DescriptionMaxLength = 2000;

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public HabitFrequency Frequency { get; set; } = HabitFrequency.Daily;

    /// <summary>Inactive habits keep their history but cannot be completed (A-11).</summary>
    public bool IsActive { get; set; } = true;
}
