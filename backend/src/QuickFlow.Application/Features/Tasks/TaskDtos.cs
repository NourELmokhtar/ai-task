using System.ComponentModel;
using QuickFlow.Application.Domain.Tasks;

namespace QuickFlow.Application.Features.Tasks;

/// <summary>Task as returned by the API. <see cref="IsOverdue"/> is computed for the effective "today" (A-05).</summary>
public sealed record TaskResponse(
    int Id,
    string Title,
    string? Description,
    TaskItemStatus Status,
    TaskPriority Priority,
    DateOnly? DueDate,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool IsArchived,
    DateTime? CompletedAt,
    bool IsOverdue)
{
    public static TaskResponse From(TaskItem task, DateOnly today) => new(
        task.Id,
        task.Title,
        task.Description,
        task.Status,
        task.Priority,
        task.DueDate,
        task.CreatedAt,
        task.UpdatedAt,
        task.IsArchived,
        task.CompletedAt,
        task.IsOverdue(today));
}

/// <summary>
/// Body of <c>POST /api/tasks</c>. Status/priority are strings validated by the service (BR-03) so that invalid
/// values produce a field error (<c>errors.status</c> / <c>errors.priority</c>) instead of a JSON conversion error.
/// </summary>
public sealed class CreateTaskRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Optional. Up to 2000 characters. Empty or whitespace-only is stored as null.")]
    public string? Description { get; set; }

    [Description("Optional. One of: Todo, InProgress, Done. Default: Todo.")]
    public string? Status { get; set; }

    [Description("Optional. One of: Low, Medium, High. Default: Medium.")]
    public string? Priority { get; set; }

    [Description("Optional due date, YYYY-MM-DD.")]
    public DateOnly? DueDate { get; set; }
}

/// <summary>Body of <c>PUT /api/tasks/{id}</c>. Full replacement: omitted description/dueDate are cleared.</summary>
public sealed class UpdateTaskRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Optional. Up to 2000 characters. Null, empty or whitespace-only clears it.")]
    public string? Description { get; set; }

    [Description("Required. One of: Todo, InProgress, Done.")]
    public string? Status { get; set; }

    [Description("Required. One of: Low, Medium, High.")]
    public string? Priority { get; set; }

    [Description("Optional due date, YYYY-MM-DD. Null clears it.")]
    public DateOnly? DueDate { get; set; }
}

/// <summary>Raw list filters from <c>GET /api/tasks</c> (B5). Validated by <see cref="TaskInputValidator.ValidateQuery"/>.</summary>
public sealed record TaskListQuery
{
    public string? Search { get; init; }
    public string? Status { get; init; }
    public string? Priority { get; init; }
    public DateOnly? DueFrom { get; init; }
    public DateOnly? DueTo { get; init; }
    public bool? Overdue { get; init; }
    public bool? Archived { get; init; }
    public string? SortBy { get; init; }
    public string? SortDir { get; init; }
}
