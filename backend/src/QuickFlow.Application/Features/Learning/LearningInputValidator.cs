using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Learning;

namespace QuickFlow.Application.Features.Learning;

/// <summary>Validated, normalized card fields.</summary>
public sealed record LearningCardInput(string Title, string? Description, LearningCardStatus Status);

/// <summary>Validated, normalized milestone fields.</summary>
public sealed record LearningMilestoneInput(string Title, DateOnly? TargetDate, bool IsDone);

/// <summary>
/// Learning validation (BR-08, A-14, status enum). Collects all field errors into one <see cref="ValidationException"/>
/// with camelCase keys (title, description, status, isDone, text).
/// </summary>
public static class LearningInputValidator
{
    public const string TitleRequired = "Title is required.";
    public static readonly string TitleTooLong = $"Title must be at most {LearningCard.TitleMaxLength} characters.";
    public static readonly string DescriptionTooLong = $"Description must be at most {LearningCard.DescriptionMaxLength} characters.";
    public const string StatusRequired = "Status is required.";
    public static readonly string StatusInvalid = $"Status must be one of: {string.Join(", ", Enum.GetNames<LearningCardStatus>())}.";
    public static readonly string MilestoneTitleTooLong = $"Title must be at most {LearningMilestone.TitleMaxLength} characters.";
    public const string IsDoneRequired = "IsDone is required.";
    public const string TextRequired = "Text is required.";
    public static readonly string TextTooLong = $"Text must be at most {LearningNote.TextMaxLength} characters.";

    /// <summary>Create: title and description only; status starts as NotStarted.</summary>
    public static LearningCardInput Validate(CreateLearningCardRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var title = ValidateCardTitleAndDescription(request.Title, request.Description, errors, out var description);
        ThrowIfAny(errors);
        return new LearningCardInput(title, description, LearningCardStatus.NotStarted);
    }

    /// <summary>Update: title, description and the user-set status (A-12), which is required.</summary>
    public static LearningCardInput Validate(UpdateLearningCardRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var title = ValidateCardTitleAndDescription(request.Title, request.Description, errors, out var description);

        var status = LearningCardStatus.NotStarted;
        if (string.IsNullOrWhiteSpace(request.Status)) errors["status"] = [StatusRequired];
        else if (!TryParseStatus(request.Status, out status)) errors["status"] = [StatusInvalid];

        ThrowIfAny(errors);
        return new LearningCardInput(title, description, status);
    }

    /// <summary>List filter: null/empty = all cards, otherwise a valid status name.</summary>
    public static LearningCardStatus? ParseStatusFilter(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return null;
        if (TryParseStatus(status, out var parsed)) return parsed;
        throw new ValidationException("status", StatusInvalid);
    }

    /// <summary>A-14: milestone title required, max 200. New milestones are not done.</summary>
    public static LearningMilestoneInput Validate(CreateLearningMilestoneRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var title = ValidateMilestoneTitle(request.Title, errors);
        ThrowIfAny(errors);
        return new LearningMilestoneInput(title, request.TargetDate, IsDone: false);
    }

    /// <summary>A-14: milestone title required, max 200; isDone required.</summary>
    public static LearningMilestoneInput Validate(UpdateLearningMilestoneRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var title = ValidateMilestoneTitle(request.Title, errors);
        if (request.IsDone is null) errors["isDone"] = [IsDoneRequired];
        ThrowIfAny(errors);
        return new LearningMilestoneInput(title, request.TargetDate, request.IsDone!.Value);
    }

    /// <summary>A-14: note text required (not whitespace-only), max 4000 after trimming. Returns the trimmed text.</summary>
    public static string Validate(CreateLearningNoteRequest request)
    {
        var text = request.Text?.Trim() ?? string.Empty;
        if (text.Length == 0) throw new ValidationException("text", TextRequired);
        if (text.Length > LearningNote.TextMaxLength) throw new ValidationException("text", TextTooLong);
        return text;
    }

    private static string ValidateCardTitleAndDescription(
        string? title, string? description, Dictionary<string, string[]> errors, out string? normalizedDescription)
    {
        // BR-08: title required (trimmed, not whitespace-only), max 200.
        var normalizedTitle = title?.Trim() ?? string.Empty;
        if (normalizedTitle.Length == 0) errors["title"] = [TitleRequired];
        else if (normalizedTitle.Length > LearningCard.TitleMaxLength) errors["title"] = [TitleTooLong];

        // Description optional, max 2000. Whitespace-only is treated as no description.
        normalizedDescription = string.IsNullOrWhiteSpace(description) ? null : description;
        if (normalizedDescription is { Length: > LearningCard.DescriptionMaxLength }) errors["description"] = [DescriptionTooLong];

        return normalizedTitle;
    }

    private static string ValidateMilestoneTitle(string? title, Dictionary<string, string[]> errors)
    {
        var normalizedTitle = title?.Trim() ?? string.Empty;
        if (normalizedTitle.Length == 0) errors["title"] = [TitleRequired];
        else if (normalizedTitle.Length > LearningMilestone.TitleMaxLength) errors["title"] = [MilestoneTitleTooLong];
        return normalizedTitle;
    }

    private static void ThrowIfAny(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    /// <summary>Case-insensitive name match. Numbers and undefined names are rejected.</summary>
    private static bool TryParseStatus(string value, out LearningCardStatus result)
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
