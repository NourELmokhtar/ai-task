using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Tasks;

namespace QuickFlow.Application.Features.Tasks;

/// <summary>Validated, normalized task fields.</summary>
public sealed record TaskInput(string Title, string? Description, TaskItemStatus Status, TaskPriority Priority, DateOnly? DueDate);

public enum TaskSortBy
{
    CreatedAt,
    DueDate,
}

/// <summary>Validated list filters.</summary>
public sealed record TaskFilter(
    string? Search,
    TaskItemStatus? Status,
    TaskPriority? Priority,
    DateOnly? DueFrom,
    DateOnly? DueTo,
    bool OverdueOnly,
    bool Archived,
    TaskSortBy SortBy,
    bool Descending);

/// <summary>Task validation (BR-01..03) and filter parsing. Collects all field errors into one <see cref="ValidationException"/>.</summary>
public static class TaskInputValidator
{
    public const string TitleRequired = "Title is required.";
    public static readonly string TitleTooLong = $"Title must be at most {TaskItem.TitleMaxLength} characters.";
    public static readonly string DescriptionTooLong = $"Description must be at most {TaskItem.DescriptionMaxLength} characters.";
    public static readonly string StatusInvalid = $"Status must be one of: {string.Join(", ", Enum.GetNames<TaskItemStatus>())}.";
    public static readonly string PriorityInvalid = $"Priority must be one of: {string.Join(", ", Enum.GetNames<TaskPriority>())}.";
    public const string StatusRequired = "Status is required.";
    public const string PriorityRequired = "Priority is required.";
    public const string SortByInvalid = "SortBy must be one of: dueDate, createdAt.";
    public const string SortDirInvalid = "SortDir must be one of: asc, desc.";
    public const string DueRangeInvalid = "dueTo must be on or after dueFrom.";

    public static TaskInput ValidateCreate(CreateTaskRequest request) =>
        Validate(request.Title, request.Description, request.Status, request.Priority, request.DueDate, statusAndPriorityRequired: false);

    public static TaskInput ValidateUpdate(UpdateTaskRequest request) =>
        Validate(request.Title, request.Description, request.Status, request.Priority, request.DueDate, statusAndPriorityRequired: true);

    public static TaskFilter ValidateQuery(TaskListQuery query)
    {
        var errors = new Dictionary<string, string[]>();

        TaskItemStatus? status = null;
        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            if (TryParseEnum<TaskItemStatus>(query.Status, out var s)) status = s;
            else errors["status"] = [StatusInvalid];
        }

        TaskPriority? priority = null;
        if (!string.IsNullOrWhiteSpace(query.Priority))
        {
            if (TryParseEnum<TaskPriority>(query.Priority, out var p)) priority = p;
            else errors["priority"] = [PriorityInvalid];
        }

        var sortBy = TaskSortBy.CreatedAt;
        if (!string.IsNullOrWhiteSpace(query.SortBy))
        {
            if (TryParseEnum<TaskSortBy>(query.SortBy, out var sb)) sortBy = sb;
            else errors["sortBy"] = [SortByInvalid];
        }

        var descending = true;
        if (!string.IsNullOrWhiteSpace(query.SortDir))
        {
            switch (query.SortDir.Trim().ToLowerInvariant())
            {
                case "asc": descending = false; break;
                case "desc": descending = true; break;
                default: errors["sortDir"] = [SortDirInvalid]; break;
            }
        }

        if (query.DueFrom is { } from && query.DueTo is { } to && to < from)
        {
            errors["dueTo"] = [DueRangeInvalid];
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }

        var search = string.IsNullOrWhiteSpace(query.Search) ? null : query.Search.Trim();
        return new TaskFilter(search, status, priority, query.DueFrom, query.DueTo,
            OverdueOnly: query.Overdue == true, Archived: query.Archived == true, sortBy, descending);
    }

    private static TaskInput Validate(string? title, string? description, string? status, string? priority, DateOnly? dueDate, bool statusAndPriorityRequired)
    {
        var errors = new Dictionary<string, string[]>();

        // BR-01: title required (trimmed, not whitespace-only), max 200.
        var normalizedTitle = title?.Trim() ?? string.Empty;
        if (normalizedTitle.Length == 0) errors["title"] = [TitleRequired];
        else if (normalizedTitle.Length > TaskItem.TitleMaxLength) errors["title"] = [TitleTooLong];

        // BR-02: description optional, max 2000. Whitespace-only is treated as no description.
        var normalizedDescription = string.IsNullOrWhiteSpace(description) ? null : description;
        if (normalizedDescription is { Length: > TaskItem.DescriptionMaxLength }) errors["description"] = [DescriptionTooLong];

        // BR-03: valid status/priority names.
        var parsedStatus = TaskItemStatus.Todo;
        if (string.IsNullOrWhiteSpace(status))
        {
            if (statusAndPriorityRequired) errors["status"] = [StatusRequired];
        }
        else if (!TryParseEnum(status, out parsedStatus))
        {
            errors["status"] = [StatusInvalid];
        }

        var parsedPriority = TaskPriority.Medium;
        if (string.IsNullOrWhiteSpace(priority))
        {
            if (statusAndPriorityRequired) errors["priority"] = [PriorityRequired];
        }
        else if (!TryParseEnum(priority, out parsedPriority))
        {
            errors["priority"] = [PriorityInvalid];
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }

        return new TaskInput(normalizedTitle, normalizedDescription, parsedStatus, parsedPriority, dueDate);
    }

    /// <summary>Case-insensitive enum name match. Numbers and undefined names are rejected.</summary>
    public static bool TryParseEnum<TEnum>(string value, out TEnum result) where TEnum : struct, Enum
    {
        var trimmed = value.Trim();
        if (trimmed.Length > 0 && trimmed.All(char.IsLetter)
            && Enum.TryParse(trimmed, ignoreCase: true, out result) && Enum.IsDefined(result))
        {
            return true;
        }

        result = default;
        return false;
    }
}
