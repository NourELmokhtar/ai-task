using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Habits;

namespace QuickFlow.Application.Features.Habits;

/// <summary>Validated, normalized habit fields.</summary>
public sealed record HabitInput(string Name, string? Description, HabitFrequency Frequency);

/// <summary>Habit validation (BR-06, frequency, A-11). Collects all field errors into one <see cref="ValidationException"/>.</summary>
public static class HabitInputValidator
{
    public const string NameRequired = "Name is required.";
    public static readonly string NameTooLong = $"Name must be at most {Habit.NameMaxLength} characters.";
    public static readonly string DescriptionTooLong = $"Description must be at most {Habit.DescriptionMaxLength} characters.";
    public const string FrequencyRequired = "Frequency is required.";
    public static readonly string FrequencyInvalid = $"Frequency must be one of: {string.Join(", ", Enum.GetNames<HabitFrequency>())}.";
    public const string HabitInactive = "Inactive habits cannot be completed. Activate the habit first.";
    public const string DateInFuture = "Completion date cannot be in the future.";
    public const string RangeInvalid = "to must be on or after from.";

    public static HabitInput Validate(CreateHabitRequest request) => Validate(request.Name, request.Description, request.Frequency);

    public static HabitInput Validate(UpdateHabitRequest request) => Validate(request.Name, request.Description, request.Frequency);

    /// <summary>A-11: only active habits can be completed, and not for a date after <paramref name="today"/>.</summary>
    public static void ValidateCompletion(Habit habit, DateOnly date, DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();
        if (!habit.IsActive) errors["habit"] = [HabitInactive];
        if (date > today) errors["date"] = [DateInFuture];

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    /// <summary>Completions list range: <c>to</c> must not be before <c>from</c>.</summary>
    public static void ValidateRange(DateOnly? from, DateOnly? to)
    {
        if (from is { } f && to is { } t && t < f)
        {
            throw new ValidationException("to", RangeInvalid);
        }
    }

    private static HabitInput Validate(string? name, string? description, string? frequency)
    {
        var errors = new Dictionary<string, string[]>();

        // BR-06: name required (trimmed, not whitespace-only), max 150.
        var normalizedName = name?.Trim() ?? string.Empty;
        if (normalizedName.Length == 0) errors["name"] = [NameRequired];
        else if (normalizedName.Length > Habit.NameMaxLength) errors["name"] = [NameTooLong];

        // Description optional, max 2000. Whitespace-only is treated as no description.
        var normalizedDescription = string.IsNullOrWhiteSpace(description) ? null : description;
        if (normalizedDescription is { Length: > Habit.DescriptionMaxLength }) errors["description"] = [DescriptionTooLong];

        var parsedFrequency = HabitFrequency.Daily;
        if (string.IsNullOrWhiteSpace(frequency)) errors["frequency"] = [FrequencyRequired];
        else if (!TryParseFrequency(frequency, out parsedFrequency)) errors["frequency"] = [FrequencyInvalid];

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }

        return new HabitInput(normalizedName, normalizedDescription, parsedFrequency);
    }

    /// <summary>Case-insensitive name match. Numbers and undefined names are rejected.</summary>
    private static bool TryParseFrequency(string value, out HabitFrequency result)
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
