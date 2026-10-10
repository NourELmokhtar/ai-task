using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Habits;

/// <summary>
/// One completion of a habit on a calendar date. At most one per (<see cref="HabitId"/>, <see cref="CompletionDate"/>)
/// (BR-07): checked by the service and enforced by a unique index. Removing a completion deletes the row
/// (not soft-deleted) so the date can be completed again.
/// </summary>
public class HabitCompletion : Entity
{
    public int HabitId { get; set; }
    public Habit Habit { get; set; } = null!;

    public DateOnly CompletionDate { get; set; }

    /// <summary>UTC time the completion was recorded (set by the service from <see cref="TimeProvider"/>).</summary>
    public DateTime CreatedAt { get; set; }
}
