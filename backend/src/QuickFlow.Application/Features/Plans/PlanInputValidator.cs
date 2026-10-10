using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Plans;

namespace QuickFlow.Application.Features.Plans;

/// <summary>Validated, normalized plan metadata (times in UTC).</summary>
public sealed record PlanMetadataInput(string Title, int EstimatedDurationMinutes, DateTime StartDateTime, DateTime EndDateTime, int PriorityOrder);

/// <summary>A structurally valid item of the create request, with its index in the request's <c>items</c> array.</summary>
public sealed record PlanItemInput(int Index, PlanItemSourceType SourceType, int SourceId)
{
    public PlanSourceKey Key => new(SourceType, SourceId);
}

/// <summary>Validated create input. <see cref="Items"/> holds only the structurally valid items.</summary>
public sealed record PlanCreateInput(PlanMetadataInput Metadata, IReadOnlyList<PlanItemInput> Items);

/// <summary>
/// Plan validation (BR-10 structure, BR-11, A-14..A-17). Collects all field errors with camelCase keys
/// (title, estimatedDurationMinutes, startDateTime, endDateTime, priorityOrder, items, items[i], items[i].sourceType,
/// items[i].sourceId, isDone). Source existence (BR-10) needs the database and is checked by <see cref="PlanService"/>
/// into the same error map.
/// </summary>
public static class PlanInputValidator
{
    public const string TitleRequired = "Title is required.";
    public static readonly string TitleTooLong = $"Title must be at most {Plan.TitleMaxLength} characters.";
    public const string DurationRequired = "Estimated duration is required.";
    public const string DurationNotPositive = "Estimated duration must be greater than 0 minutes.";
    public const string StartRequired = "Start date/time is required.";
    public const string EndRequired = "End date/time is required.";
    public const string EndNotAfterStart = "End date/time must be after the start date/time.";
    public const string PriorityRequired = "Priority order is required.";
    public const string PriorityTooLow = "Priority order must be at least 1.";
    public const string ItemsRequired = "At least one item is required.";
    public const string ItemRequired = "Item is required.";
    public const string SourceTypeRequired = "Source type is required.";
    public static readonly string SourceTypeInvalid = $"Source type must be one of: {string.Join(", ", Enum.GetNames<PlanItemSourceType>())}.";
    public const string SourceIdRequired = "Source id is required.";
    public const string IsDoneRequired = "IsDone is required.";

    public static string ItemKey(int index) => $"items[{index}]";

    /// <summary>
    /// Metadata and item structure of a create request. Errors are added to <paramref name="errors"/> (not thrown) so the
    /// service can add source-existence errors before throwing once.
    /// </summary>
    public static PlanCreateInput Validate(CreatePlanRequest request, Dictionary<string, string[]> errors)
    {
        var metadata = ValidateMetadata(
            request.Title, request.EstimatedDurationMinutes, request.StartDateTime, request.EndDateTime, request.PriorityOrder, errors);

        var items = new List<PlanItemInput>();
        if (request.Items is null || request.Items.Count == 0)
        {
            errors["items"] = [ItemsRequired]; // BR-10
            return new PlanCreateInput(metadata, items);
        }

        var firstIndexByKey = new Dictionary<PlanSourceKey, int>();
        for (var i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];
            if (item is null)
            {
                errors[ItemKey(i)] = [ItemRequired];
                continue;
            }

            var valid = true;
            var sourceType = default(PlanItemSourceType);
            if (string.IsNullOrWhiteSpace(item.SourceType)) { errors[$"{ItemKey(i)}.sourceType"] = [SourceTypeRequired]; valid = false; }
            else if (!TryParseSourceType(item.SourceType, out sourceType)) { errors[$"{ItemKey(i)}.sourceType"] = [SourceTypeInvalid]; valid = false; }

            if (item.SourceId is null) { errors[$"{ItemKey(i)}.sourceId"] = [SourceIdRequired]; valid = false; }

            if (!valid) continue;

            var input = new PlanItemInput(i, sourceType, item.SourceId!.Value);
            if (firstIndexByKey.TryGetValue(input.Key, out var first))
            {
                // A-17: no duplicate (sourceType, sourceId) within one plan.
                errors[ItemKey(i)] = [DuplicateItem(input.SourceType, input.SourceId, first)];
                continue;
            }

            firstIndexByKey[input.Key] = i;
            items.Add(input);
        }

        return new PlanCreateInput(metadata, items);
    }

    /// <summary>Metadata of an update request (A-17: items are not editable). Throws <see cref="ValidationException"/>.</summary>
    public static PlanMetadataInput Validate(UpdatePlanRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var metadata = ValidateMetadata(
            request.Title, request.EstimatedDurationMinutes, request.StartDateTime, request.EndDateTime, request.PriorityOrder, errors);
        ThrowIfAny(errors);
        return metadata;
    }

    /// <summary>PATCH item body: isDone is required.</summary>
    public static bool Validate(UpdatePlanItemRequest request) =>
        request.IsDone ?? throw new ValidationException("isDone", IsDoneRequired);

    /// <summary>
    /// M07 list filter: null/empty/whitespace = all plans, otherwise active | upcoming | completed (case-insensitive).
    /// Anything else throws <see cref="ValidationException"/> keyed <c>group</c>.
    /// </summary>
    public static PlanGroup? ParseGroupFilter(string? group)
    {
        if (string.IsNullOrWhiteSpace(group)) return null;

        return group.Trim().ToLowerInvariant() switch
        {
            "active" => PlanGroup.Active,
            "upcoming" => PlanGroup.Upcoming,
            "completed" => PlanGroup.Completed,
            _ => throw new ValidationException("group", GroupInvalid),
        };
    }

    public const string GroupInvalid = "Group must be one of: active, upcoming, completed.";

    public static string DuplicateItem(PlanItemSourceType sourceType, int sourceId, int firstIndex) =>
        $"Duplicate item: {sourceType} {sourceId} is already in the plan (items[{firstIndex}]).";

    public static string SourceNotFound(PlanItemSourceType sourceType, int sourceId) =>
        $"{SourceTypeDisplayName(sourceType)} with id '{sourceId}' does not exist or has been deleted.";

    public static void ThrowIfAny(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private static PlanMetadataInput ValidateMetadata(
        string? title, int? durationMinutes, DateTime? start, DateTime? end, int? priorityOrder, Dictionary<string, string[]> errors)
    {
        // A-14: title required (trimmed, not whitespace-only), max 200.
        var normalizedTitle = title?.Trim() ?? string.Empty;
        if (normalizedTitle.Length == 0) errors["title"] = [TitleRequired];
        else if (normalizedTitle.Length > Plan.TitleMaxLength) errors["title"] = [TitleTooLong];

        // A-15: integer minutes > 0 (not checked against the start/end window).
        if (durationMinutes is null) errors["estimatedDurationMinutes"] = [DurationRequired];
        else if (durationMinutes <= 0) errors["estimatedDurationMinutes"] = [DurationNotPositive];

        // BR-11: end after start (UTC).
        var startUtc = start is { } s ? ToUtc(s) : default;
        var endUtc = end is { } e ? ToUtc(e) : default;
        if (start is null) errors["startDateTime"] = [StartRequired];
        if (end is null) errors["endDateTime"] = [EndRequired];
        else if (start is not null && endUtc <= startUtc) errors["endDateTime"] = [EndNotAfterStart];

        // A-16: integer >= 1; duplicates allowed.
        if (priorityOrder is null) errors["priorityOrder"] = [PriorityRequired];
        else if (priorityOrder < 1) errors["priorityOrder"] = [PriorityTooLow];

        return new PlanMetadataInput(normalizedTitle, durationMinutes ?? 0, startUtc, endUtc, priorityOrder ?? 0);
    }

    /// <summary>The API's JSON converter already yields UTC; this also normalizes direct (non-HTTP) callers.</summary>
    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    private static string SourceTypeDisplayName(PlanItemSourceType sourceType) => sourceType switch
    {
        PlanItemSourceType.Task => "Task",
        PlanItemSourceType.Habit => "Habit",
        PlanItemSourceType.LearningResource => "Learning resource",
        _ => sourceType.ToString(),
    };

    /// <summary>Case-insensitive name match. Numbers and undefined names are rejected.</summary>
    private static bool TryParseSourceType(string value, out PlanItemSourceType result)
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
