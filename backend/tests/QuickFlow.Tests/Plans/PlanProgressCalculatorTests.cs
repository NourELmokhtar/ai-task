using QuickFlow.Application.Features.Plans;

namespace QuickFlow.Tests.Plans;

/// <summary>TR-1: plan completion roll-up (pure).</summary>
public class PlanProgressCalculatorTests
{
    [Theory]
    [InlineData(3, 0, 0)]
    [InlineData(3, 1, 33)]
    [InlineData(3, 2, 67)]
    [InlineData(3, 3, 100)]
    [InlineData(8, 1, 13)] // 12.5 rounds away from zero
    [InlineData(1, 1, 100)]
    [InlineData(7, 3, 43)]
    public void Percent_is_rounded_done_over_total(int total, int done, int expected)
    {
        var progress = PlanProgressCalculator.Calculate(total, done);

        Assert.Equal(total, progress.TotalItems);
        Assert.Equal(done, progress.DoneItems);
        Assert.Equal(expected, progress.ProgressPercent);
    }

    [Fact]
    public void Calculates_from_item_flags()
    {
        Assert.Equal(new PlanProgress(3, 2, 67), PlanProgressCalculator.Calculate([true, false, true]));
        Assert.True(PlanProgressCalculator.Calculate([true, true]).IsComplete);
        Assert.False(PlanProgressCalculator.Calculate([true, false]).IsComplete);
    }

    [Fact]
    public void Empty_plan_is_zero_percent_and_not_complete()
    {
        Assert.Equal(PlanProgress.Empty, PlanProgressCalculator.Calculate([]));
        Assert.Equal(PlanProgress.Empty, PlanProgressCalculator.Calculate(0, 0));
        Assert.False(PlanProgress.Empty.IsComplete);
    }

    [Theory]
    [InlineData(-1, 0)]
    [InlineData(2, -1)]
    [InlineData(2, 3)]
    public void Invalid_counts_throw(int total, int done) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => PlanProgressCalculator.Calculate(total, done));
}
