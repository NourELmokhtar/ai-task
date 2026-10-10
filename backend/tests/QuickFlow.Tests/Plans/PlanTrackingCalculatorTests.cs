using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Features.Plans;

namespace QuickFlow.Tests.Plans;

/// <summary>TR-2: pure, clock-controlled status (A-20) and rest-time (A-21) calculators.</summary>
public class PlanTrackingCalculatorTests
{
    private static readonly DateTime Start = new(2026, 10, 10, 9, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime End = Start.AddHours(3);

    private static PlanTracking Evaluate(int total, int done, DateTime now) =>
        PlanTracking.Evaluate(Start, End, PlanProgressCalculator.Calculate(total, done), now);

    [Fact]
    public void Before_start_is_NotStarted_without_rest_time()
    {
        var t = Evaluate(3, 0, Start.AddTicks(-1));

        Assert.Equal(PlanStatus.NotStarted, t.Status);
        Assert.Null(t.RestTimeSeconds);
    }

    [Fact]
    public void At_start_is_InProgress_with_rest_time_end_minus_start()
    {
        var t = Evaluate(3, 0, Start);

        Assert.Equal(PlanStatus.InProgress, t.Status);
        Assert.Equal((long)(End - Start).TotalSeconds, t.RestTimeSeconds);
        Assert.Equal(10_800, t.RestTimeSeconds);
    }

    [Fact]
    public void Mid_window_is_InProgress_with_rest_time_end_minus_now()
    {
        var now = Start.AddMinutes(70).AddSeconds(15);

        var t = Evaluate(3, 1, now);

        Assert.Equal(PlanStatus.InProgress, t.Status);
        Assert.Equal((long)(End - now).TotalSeconds, t.RestTimeSeconds);
        Assert.Equal(6_585, t.RestTimeSeconds);
    }

    [Fact]
    public void Rest_time_is_truncated_to_whole_seconds()
    {
        Assert.Equal(59, Evaluate(3, 0, End.AddMilliseconds(-59_900)).RestTimeSeconds);
        Assert.Equal(0, Evaluate(3, 0, End.AddTicks(-1)).RestTimeSeconds);
    }

    [Fact]
    public void At_end_is_Completed_without_rest_time()
    {
        var t = Evaluate(3, 2, End);

        Assert.Equal(PlanStatus.Completed, t.Status);
        Assert.Null(t.RestTimeSeconds);
    }

    [Fact]
    public void All_items_done_mid_window_is_Completed()
    {
        var t = Evaluate(3, 3, Start.AddHours(1));

        Assert.Equal(PlanStatus.Completed, t.Status);
        Assert.Null(t.RestTimeSeconds);
    }

    [Fact]
    public void All_items_done_before_start_is_Completed()
    {
        var t = Evaluate(2, 2, Start.AddDays(-1));

        Assert.Equal(PlanStatus.Completed, t.Status);
        Assert.Null(t.RestTimeSeconds);
    }

    [Fact]
    public void Unmarking_one_item_mid_window_returns_to_InProgress()
    {
        var now = Start.AddHours(1);
        Assert.Equal(PlanStatus.Completed, Evaluate(3, 3, now).Status);

        var t = Evaluate(3, 2, now);

        Assert.Equal(PlanStatus.InProgress, t.Status);
        Assert.Equal(7_200, t.RestTimeSeconds);
    }

    [Fact]
    public void Past_end_with_one_of_three_done_is_Completed_with_33_percent()
    {
        var t = Evaluate(3, 1, End.AddDays(2));

        Assert.Equal(PlanStatus.Completed, t.Status);
        Assert.Equal(33, t.Progress.ProgressPercent);
        Assert.Null(t.RestTimeSeconds);
    }

    [Fact]
    public void Status_follows_the_clock_with_unchanged_data()
    {
        var progress = PlanProgressCalculator.Calculate(3, 1);

        Assert.Equal(
            [PlanStatus.NotStarted, PlanStatus.InProgress, PlanStatus.InProgress, PlanStatus.Completed, PlanStatus.Completed],
            new[] { Start.AddMinutes(-1), Start, End.AddSeconds(-1), End, End.AddYears(1) }
                .Select(now => PlanStatusCalculator.Calculate(Start, End, progress, now)));
    }

    [Fact]
    public void Plan_without_items_is_never_complete_by_items()
    {
        Assert.Equal(PlanStatus.NotStarted, PlanStatusCalculator.Calculate(Start, End, 0, 0, Start.AddSeconds(-1)));
        Assert.Equal(PlanStatus.InProgress, PlanStatusCalculator.Calculate(Start, End, 0, 0, Start));
        Assert.Equal(PlanStatus.Completed, PlanStatusCalculator.Calculate(Start, End, 0, 0, End));
    }

    [Fact]
    public void Unspecified_kind_is_treated_as_utc()
    {
        var unspecifiedNow = DateTime.SpecifyKind(Start.AddMinutes(1), DateTimeKind.Unspecified);

        Assert.Equal(PlanStatus.InProgress, PlanStatusCalculator.Calculate(Start, End, 1, 0, unspecifiedNow));
        Assert.Equal(10_740, PlanRestTimeCalculator.CalculateSeconds(PlanStatus.InProgress, End, unspecifiedNow));
    }

    [Theory]
    [InlineData(PlanStatus.NotStarted)]
    [InlineData(PlanStatus.Completed)]
    public void Rest_time_is_null_unless_InProgress(PlanStatus status) =>
        Assert.Null(PlanRestTimeCalculator.CalculateSeconds(status, End, Start.AddMinutes(30)));

    [Fact]
    public void Invalid_counts_are_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => PlanStatusCalculator.Calculate(Start, End, 1, 2, Start));
    }
}
