using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Tasks;

/// <summary>
/// A task (API resource <c>/api/tasks</c>). Named <c>TaskItem</c> to avoid clashing with <see cref="System.Threading.Tasks.Task"/>.
/// Soft-deletable (BR-14). <see cref="CompletedAt"/> is derived from <see cref="Status"/> (BR-05, A-06):
/// change the status only through <see cref="SetStatus"/> / <see cref="MarkCompleted"/>.
/// </summary>
public class TaskItem : SoftDeletableEntity
{
    public const int TitleMaxLength = 200;
    public const int DescriptionMaxLength = 2000;

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TaskItemStatus Status { get; private set; } = TaskItemStatus.Todo;
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    public DateOnly? DueDate { get; set; }
    public bool IsArchived { get; set; }

    /// <summary>UTC time the task last entered <see cref="TaskItemStatus.Done"/>; null when not done.</summary>
    public DateTime? CompletedAt { get; private set; }

    /// <summary>
    /// Sets the status and maintains <see cref="CompletedAt"/> (BR-05): entering Done sets it to <paramref name="utcNow"/>,
    /// staying Done keeps the original value, leaving Done clears it.
    /// </summary>
    public void SetStatus(TaskItemStatus status, DateTime utcNow)
    {
        if (status == TaskItemStatus.Done)
        {
            if (Status != TaskItemStatus.Done || CompletedAt is null)
            {
                CompletedAt = utcNow;
            }
        }
        else
        {
            CompletedAt = null;
        }

        Status = status;
    }

    /// <summary>Completes the task (Status = Done, CompletedAt = now). Idempotent: an already-done task keeps its CompletedAt.</summary>
    public void MarkCompleted(DateTime utcNow) => SetStatus(TaskItemStatus.Done, utcNow);

    /// <summary>Overdue (A-05): due date before <paramref name="today"/>, not Done, not archived. Due today is not overdue.</summary>
    public bool IsOverdue(DateOnly today) =>
        DueDate is { } due && due < today && Status != TaskItemStatus.Done && !IsArchived;
}
