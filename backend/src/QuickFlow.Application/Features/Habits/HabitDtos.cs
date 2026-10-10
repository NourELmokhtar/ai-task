using System.ComponentModel;
using QuickFlow.Application.Domain.Habits;

namespace QuickFlow.Application.Features.Habits;

/// <summary>Habit as returned by the API. Progress fields are computed for the effective "today" (see <see cref="HabitProgress"/>).</summary>
public sealed record HabitResponse(
    int Id,
    string Name,
    string? Description,
    HabitFrequency Frequency,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool CompletedToday,
    bool CompletedForCurrentPeriod,
    int CurrentStreak,
    DateOnly? LastCompletionDate)
{
    public static HabitResponse From(Habit habit, IEnumerable<DateOnly> completionDates, DateOnly today) =>
        From(habit, HabitProgressCalculator.Calculate(habit.Frequency, completionDates, today));

    public static HabitResponse From(Habit habit, HabitProgress progress) => new(
        habit.Id,
        habit.Name,
        habit.Description,
        habit.Frequency,
        habit.IsActive,
        habit.CreatedAt,
        habit.UpdatedAt,
        progress.CompletedToday,
        progress.CompletedForCurrentPeriod,
        progress.CurrentStreak,
        progress.LastCompletionDate);
}

/// <summary>
/// Body of <c>POST /api/habits</c>. Frequency is a string validated by the service so that an invalid value
/// produces <c>errors.frequency</c> instead of a JSON conversion error.
/// </summary>
public sealed class CreateHabitRequest
{
    [Description("Required. Trimmed; 1-150 characters.")]
    public string? Name { get; set; }

    [Description("Optional. Up to 2000 characters. Empty or whitespace-only is stored as null.")]
    public string? Description { get; set; }

    [Description("Required. One of: Daily, Weekly.")]
    public string? Frequency { get; set; }
}

/// <summary>Body of <c>PUT /api/habits/{id}</c>. Full replacement of the editable fields (an omitted description is cleared). Does not change isActive.</summary>
public sealed class UpdateHabitRequest
{
    [Description("Required. Trimmed; 1-150 characters.")]
    public string? Name { get; set; }

    [Description("Optional. Up to 2000 characters. Null, empty or whitespace-only clears it.")]
    public string? Description { get; set; }

    [Description("Required. One of: Daily, Weekly.")]
    public string? Frequency { get; set; }
}

/// <summary>Body of <c>POST /api/habits/{id}/completions</c>. The body itself is optional.</summary>
public sealed class CompletionRequest
{
    [Description("Completion date, YYYY-MM-DD. Optional; defaults to today. Must not be after today.")]
    public DateOnly? Date { get; set; }
}

/// <summary>One recorded completion.</summary>
public sealed record CompletionResponse(int Id, int HabitId, DateOnly Date, DateTime CreatedAt)
{
    public static CompletionResponse From(HabitCompletion completion) =>
        new(completion.Id, completion.HabitId, completion.CompletionDate, completion.CreatedAt);
}
