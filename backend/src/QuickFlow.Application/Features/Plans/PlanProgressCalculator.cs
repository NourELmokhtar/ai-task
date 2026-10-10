namespace QuickFlow.Application.Features.Plans;

/// <summary>Completion roll-up of a plan (FR-08 completion %). <c>ProgressPercent</c> is 0–100.</summary>
public sealed record PlanProgress(int TotalItems, int DoneItems, int ProgressPercent)
{
    public static readonly PlanProgress Empty = new(0, 0, 0);

    /// <summary>True when the plan has at least one item and every item is done.</summary>
    public bool IsComplete => TotalItems > 0 && DoneItems == TotalItems;
}

/// <summary>
/// Pure, clock-independent plan progress calculator (B5). Reused by M07 (lifecycle) and M08 (dashboard).
/// <c>progressPercent = round(done / total × 100)</c>, midpoint rounded away from zero (1/3 = 33, 2/3 = 67, 1/8 = 13).
/// Every item counts, including items whose source was deleted later (A-24). An empty plan is 0%.
/// </summary>
public static class PlanProgressCalculator
{
    public static PlanProgress Calculate(int totalItems, int doneItems)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(totalItems);
        ArgumentOutOfRangeException.ThrowIfNegative(doneItems);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(doneItems, totalItems);

        if (totalItems == 0)
        {
            return PlanProgress.Empty;
        }

        var percent = (int)Math.Round(doneItems * 100m / totalItems, MidpointRounding.AwayFromZero);
        return new PlanProgress(totalItems, doneItems, percent);
    }

    /// <summary>Calculates from the items' done flags (one entry per item).</summary>
    public static PlanProgress Calculate(IEnumerable<bool> itemDoneFlags)
    {
        var total = 0;
        var done = 0;
        foreach (var isDone in itemDoneFlags)
        {
            total++;
            if (isDone) done++;
        }

        return Calculate(total, done);
    }
}
