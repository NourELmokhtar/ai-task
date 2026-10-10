namespace QuickFlow.Application.Domain.Plans;

/// <summary>Plan lifecycle status, computed by <c>PlanStatusCalculator</c> (M07, A-20) from the window, item progress and the clock.</summary>
public enum PlanStatus
{
    NotStarted,
    InProgress,
    Completed,
}
