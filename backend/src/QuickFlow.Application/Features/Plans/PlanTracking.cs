using QuickFlow.Application.Domain.Plans;

namespace QuickFlow.Application.Features.Plans;

/// <summary>
/// Pure, clock-injected plan status rule (M07 B1, A-20). Evaluated in order:
/// (1) all items done → <see cref="PlanStatus.Completed"/>; (2) now &lt; start → <see cref="PlanStatus.NotStarted"/>;
/// (3) start ≤ now &lt; end → <see cref="PlanStatus.InProgress"/>; (4) now ≥ end → <see cref="PlanStatus.Completed"/>.
/// The status is derived only from stored data and the clock, so it is the same after a restart (NFR-R2).
/// All date-times are compared in UTC (<see cref="DateTimeKind.Unspecified"/> is treated as UTC).
/// </summary>
public static class PlanStatusCalculator
{
    public static PlanStatus Calculate(DateTime start, DateTime end, int totalItems, int doneItems, DateTime now) =>
        Calculate(start, end, PlanProgressCalculator.Calculate(totalItems, doneItems), now);

    public static PlanStatus Calculate(DateTime start, DateTime end, PlanProgress progress, DateTime now)
    {
        ArgumentNullException.ThrowIfNull(progress);

        if (progress.IsComplete) return PlanStatus.Completed;

        var utcNow = Utc(now);
        if (utcNow < Utc(start)) return PlanStatus.NotStarted;
        return utcNow < Utc(end) ? PlanStatus.InProgress : PlanStatus.Completed;
    }

    internal static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}

/// <summary>
/// Pure, clock-injected rest time (M07 B2, BR-12 / A-21): <c>EndDateTime − now</c> in whole seconds (truncated) while the
/// status is <see cref="PlanStatus.InProgress"/>; otherwise <c>null</c>.
/// </summary>
public static class PlanRestTimeCalculator
{
    public static long? CalculateSeconds(PlanStatus status, DateTime end, DateTime now)
    {
        if (status != PlanStatus.InProgress) return null;

        var remaining = PlanStatusCalculator.Utc(end) - PlanStatusCalculator.Utc(now);
        return Math.Max(0, remaining.Ticks / TimeSpan.TicksPerSecond);
    }
}

/// <summary>
/// The live tracking state of one plan at <c>now</c>: computed status, progress and rest time. This is the single place
/// that combines <see cref="PlanProgressCalculator"/>, <see cref="PlanStatusCalculator"/> and
/// <see cref="PlanRestTimeCalculator"/>; reuse it (M08) instead of re-implementing the lifecycle (NFR-M2).
/// </summary>
public sealed record PlanTracking(PlanStatus Status, PlanProgress Progress, long? RestTimeSeconds)
{
    public static PlanTracking Evaluate(DateTime start, DateTime end, PlanProgress progress, DateTime now)
    {
        var status = PlanStatusCalculator.Calculate(start, end, progress, now);
        return new PlanTracking(status, progress, PlanRestTimeCalculator.CalculateSeconds(status, end, now));
    }

    /// <summary>Evaluates a plan from its items' done flags.</summary>
    public static PlanTracking Evaluate(Plan plan, IEnumerable<PlanItem> items, DateTime now)
    {
        ArgumentNullException.ThrowIfNull(plan);
        return Evaluate(plan.StartDateTime, plan.EndDateTime, PlanProgressCalculator.Calculate(items.Select(i => i.IsDone)), now);
    }
}
