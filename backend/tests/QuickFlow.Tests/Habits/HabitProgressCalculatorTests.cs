using QuickFlow.Application.Domain.Habits;
using QuickFlow.Application.Features.Habits;

namespace QuickFlow.Tests.Habits;

/// <summary>TR-1 / B5: pure progress calculator. 2026-10-10 is a Saturday; its ISO week is Mon 10-05 .. Sun 10-11.</summary>
public class HabitProgressCalculatorTests
{
    private static DateOnly D(int month, int day) => new(2026, month, day);

    private static HabitProgress Daily(DateOnly today, params DateOnly[] dates) =>
        HabitProgressCalculator.Calculate(HabitFrequency.Daily, dates, today);

    private static HabitProgress Weekly(DateOnly today, params DateOnly[] dates) =>
        HabitProgressCalculator.Calculate(HabitFrequency.Weekly, dates, today);

    [Fact]
    public void No_completions_gives_empty_progress()
    {
        Assert.Equal(HabitProgress.None, Daily(D(10, 10)));
        Assert.Equal(HabitProgress.None, Weekly(D(10, 10)));
    }

    [Fact]
    public void Daily_consecutive_days_including_today_form_a_streak()
    {
        var p = Daily(D(10, 10), D(10, 8), D(10, 9), D(10, 10));

        Assert.True(p.CompletedToday);
        Assert.True(p.CompletedForCurrentPeriod);
        Assert.Equal(3, p.CurrentStreak);
        Assert.Equal(D(10, 10), p.LastCompletionDate);
    }

    [Fact]
    public void Daily_gap_resets_the_streak()
    {
        var p = Daily(D(10, 10), D(10, 5), D(10, 6), D(10, 7), D(10, 9), D(10, 10));
        Assert.Equal(2, p.CurrentStreak); // 10-08 missing
    }

    [Fact]
    public void Daily_today_not_done_counts_from_yesterday()
    {
        var p = Daily(D(10, 10), D(10, 7), D(10, 8), D(10, 9));

        Assert.False(p.CompletedToday);
        Assert.False(p.CompletedForCurrentPeriod);
        Assert.Equal(3, p.CurrentStreak);
        Assert.Equal(D(10, 9), p.LastCompletionDate);
    }

    [Fact]
    public void Daily_neither_today_nor_yesterday_done_gives_zero_streak()
    {
        var p = Daily(D(10, 10), D(10, 7), D(10, 8));

        Assert.Equal(0, p.CurrentStreak);
        Assert.Equal(D(10, 8), p.LastCompletionDate);
    }

    [Fact]
    public void Single_completion_today_gives_streak_of_one()
    {
        var p = Daily(D(10, 10), D(10, 10));
        Assert.True(p.CompletedToday);
        Assert.Equal(1, p.CurrentStreak);
    }

    [Fact]
    public void Weekly_streak_counts_across_the_Sunday_to_Monday_boundary()
    {
        // Sun 10-04 (week of 09-28) and Mon 10-05 (week of 10-05) are consecutive days in different ISO weeks.
        var p = Weekly(D(10, 10), D(10, 4), D(10, 5));

        Assert.True(p.CompletedForCurrentPeriod);
        Assert.False(p.CompletedToday);
        Assert.Equal(2, p.CurrentStreak);
    }

    [Fact]
    public void Weekly_new_week_starts_on_Monday()
    {
        // Today Mon 10-12 (new week, not done yet): last week (done Sun 10-11) and the week before count.
        var notDoneYet = Weekly(D(10, 12), D(10, 4), D(10, 11));
        Assert.False(notDoneYet.CompletedForCurrentPeriod);
        Assert.Equal(2, notDoneYet.CurrentStreak);

        // Done on Mon 10-12 as well: three consecutive weeks.
        var done = Weekly(D(10, 12), D(10, 4), D(10, 11), D(10, 12));
        Assert.True(done.CompletedForCurrentPeriod);
        Assert.True(done.CompletedToday);
        Assert.Equal(3, done.CurrentStreak);
    }

    [Fact]
    public void Weekly_several_completions_in_one_week_count_as_one_period()
    {
        var p = Weekly(D(10, 10), D(10, 5), D(10, 7), D(10, 10));
        Assert.Equal(1, p.CurrentStreak);
    }

    [Fact]
    public void Weekly_missing_week_resets_the_streak()
    {
        // Weeks of 09-21 and 10-05 done, week of 09-28 missing.
        var p = Weekly(D(10, 10), D(9, 22), D(10, 6));
        Assert.Equal(1, p.CurrentStreak);
    }

    [Fact]
    public void Weekly_completed_earlier_in_the_week_counts_for_the_current_period()
    {
        // Completed Tuesday 10-06, today Saturday 10-10.
        var p = Weekly(D(10, 10), D(10, 6));

        Assert.True(p.CompletedForCurrentPeriod);
        Assert.False(p.CompletedToday);
        Assert.Equal(1, p.CurrentStreak);
        Assert.Equal(D(10, 6), p.LastCompletionDate);
    }

    [Fact]
    public void Daily_completion_earlier_in_the_week_does_not_count_for_today()
    {
        var p = Daily(D(10, 10), D(10, 6));
        Assert.False(p.CompletedForCurrentPeriod);
        Assert.Equal(0, p.CurrentStreak);
    }

    [Fact]
    public void Completions_after_today_are_ignored()
    {
        var p = Daily(D(10, 8), D(10, 7), D(10, 8), D(10, 9), D(10, 10));

        Assert.True(p.CompletedToday);
        Assert.Equal(2, p.CurrentStreak);
        Assert.Equal(D(10, 8), p.LastCompletionDate);
        Assert.Equal(HabitProgress.None, Daily(D(10, 1), D(10, 9)));
    }

    [Fact]
    public void Input_order_and_duplicates_do_not_matter()
    {
        var p = Daily(D(10, 10), D(10, 10), D(10, 8), D(10, 9), D(10, 10));
        Assert.Equal(3, p.CurrentStreak);
    }

    [Theory]
    [InlineData(2026, 10, 5, 2026, 10, 5)]   // Monday
    [InlineData(2026, 10, 10, 2026, 10, 5)]  // Saturday
    [InlineData(2026, 10, 11, 2026, 10, 5)]  // Sunday belongs to the week that started on Monday
    [InlineData(2026, 10, 12, 2026, 10, 12)] // next Monday
    [InlineData(2027, 1, 1, 2026, 12, 28)]   // Friday across a year boundary
    public void Weekly_period_is_the_ISO_week_Monday_to_Sunday(int y, int m, int d, int sy, int sm, int sd)
    {
        var date = new DateOnly(y, m, d);
        Assert.Equal(new DateOnly(sy, sm, sd), HabitProgressCalculator.GetPeriodStart(HabitFrequency.Weekly, date));
        Assert.Equal(new DateOnly(sy, sm, sd).AddDays(6), HabitProgressCalculator.GetPeriodEnd(HabitFrequency.Weekly, date));
        Assert.Equal(date, HabitProgressCalculator.GetPeriodStart(HabitFrequency.Daily, date));
    }
}
