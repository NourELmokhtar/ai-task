using QuickFlow.Application.Domain.Habits;

namespace QuickFlow.Application.Features.Habits;

/// <summary>Progress of one habit as of a given "today" (B5).</summary>
/// <param name="CompletedToday">There is a completion dated exactly today.</param>
/// <param name="CompletedForCurrentPeriod">Daily: same as <paramref name="CompletedToday"/>. Weekly: any completion in the ISO week (Mon-Sun) containing today.</param>
/// <param name="CurrentStreak">Consecutive periods (days or ISO weeks) with at least one completion, counted back from the current
/// period if it is complete, otherwise from the previous period (A-10). 0 when that period has no completion.</param>
/// <param name="LastCompletionDate">Latest completion date on or before today; null when none.</param>
public sealed record HabitProgress(bool CompletedToday, bool CompletedForCurrentPeriod, int CurrentStreak, DateOnly? LastCompletionDate)
{
    public static readonly HabitProgress None = new(false, false, 0, null);
}

/// <summary>
/// Pure, clock-independent habit progress calculation (B5). Reusable by any module (e.g. M08 Dashboard):
/// pass the habit's frequency, its completion dates and the effective today (from <c>ITodayProvider</c>).
/// Completion dates after <c>today</c> are ignored, duplicates are tolerated, input order does not matter.
/// </summary>
public static class HabitProgressCalculator
{
    public static HabitProgress Calculate(HabitFrequency frequency, IEnumerable<DateOnly> completionDates, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(completionDates);

        var dates = completionDates.Where(d => d <= today).ToHashSet();
        if (dates.Count == 0)
        {
            return HabitProgress.None;
        }

        var completedPeriods = dates.Select(d => GetPeriodStart(frequency, d)).ToHashSet();
        var step = GetPeriodLengthInDays(frequency);
        var currentPeriod = GetPeriodStart(frequency, today);
        var completedForCurrentPeriod = completedPeriods.Contains(currentPeriod);

        // A-10: count back from the current period when it is complete, otherwise from the previous one.
        var period = completedForCurrentPeriod ? currentPeriod : currentPeriod.AddDays(-step);
        var streak = 0;
        while (completedPeriods.Contains(period))
        {
            streak++;
            period = period.AddDays(-step);
        }

        return new HabitProgress(
            CompletedToday: dates.Contains(today),
            CompletedForCurrentPeriod: completedForCurrentPeriod,
            CurrentStreak: streak,
            LastCompletionDate: dates.Max());
    }

    /// <summary>First day of the period containing <paramref name="date"/>: the date itself (Daily) or the Monday of its ISO week (Weekly, A-09).</summary>
    public static DateOnly GetPeriodStart(HabitFrequency frequency, DateOnly date) => frequency switch
    {
        HabitFrequency.Daily => date,
        HabitFrequency.Weekly => date.AddDays(-(((int)date.DayOfWeek + 6) % 7)), // Monday = 0 ... Sunday = 6
        _ => throw new ArgumentOutOfRangeException(nameof(frequency), frequency, null),
    };

    /// <summary>Last day of the period containing <paramref name="date"/> (the Sunday for Weekly).</summary>
    public static DateOnly GetPeriodEnd(HabitFrequency frequency, DateOnly date) =>
        GetPeriodStart(frequency, date).AddDays(GetPeriodLengthInDays(frequency) - 1);

    private static int GetPeriodLengthInDays(HabitFrequency frequency) => frequency == HabitFrequency.Weekly ? 7 : 1;
}
