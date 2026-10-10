using QuickFlow.Application.Domain.Habits;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Application.Features.Plans;
using QuickFlow.Application.Features.Tasks;

namespace QuickFlow.Application.Features.Dashboard;

/// <summary>
/// Aggregated dashboard (M08, <c>GET /api/dashboard</c>). Every metric is computed at one request from the existing module
/// services and calculators (NFR-M2). <see cref="ServerNow"/> is the server UTC instant used for the plan status/rest time
/// and the rolling 7×24 h learning window; <see cref="Today"/> is the effective date (<c>?today=</c> or server local date).
/// </summary>
public sealed record DashboardResponse(
    DateTime ServerNow,
    DateOnly Today,
    DashboardTasks Tasks,
    DashboardHabits Habits,
    DashboardPlans Plans,
    DashboardLearning Learning);

/// <summary>Task metrics. All exclude archived and deleted tasks.</summary>
/// <param name="DueToday">Non-archived tasks with <c>dueDate == today</c>, any status (M02 list order: createdAt desc).</param>
/// <param name="Overdue">M02 overdue rule (A-05) via the M02 list query, ordered by dueDate asc.</param>
/// <param name="CompletedTodayCount">Done tasks whose <c>completedAt</c>, converted to the server-local date, equals today.</param>
/// <param name="TotalActive">Non-archived tasks.</param>
/// <param name="DoneCount">Non-archived Done tasks.</param>
/// <param name="CompletionPercent">round(DoneCount / TotalActive × 100), midpoint away from zero; 0 when there are no tasks (A-25).</param>
public sealed record DashboardTasks(
    IReadOnlyList<TaskResponse> DueToday,
    IReadOnlyList<TaskResponse> Overdue,
    int CompletedTodayCount,
    int TotalActive,
    int DoneCount,
    int CompletionPercent);

/// <summary>Active habits with their progress for today (A-26, M03 calculator).</summary>
public sealed record DashboardHabits(int ActiveCount, int CompletedTodayCount, IReadOnlyList<DashboardHabitItem> Items);

/// <summary>One active habit (M03 progress fields).</summary>
public sealed record DashboardHabitItem(
    int Id,
    string Name,
    HabitFrequency Frequency,
    bool CompletedToday,
    bool CompletedForCurrentPeriod,
    int CurrentStreak)
{
    public static DashboardHabitItem From(HabitResponse habit) => new(
        habit.Id, habit.Name, habit.Frequency, habit.CompletedToday, habit.CompletedForCurrentPeriod, habit.CurrentStreak);
}

/// <summary>Plan counts per computed status and the InProgress plans (M07 tracking summary).</summary>
public sealed record DashboardPlans(int InProgressCount, int UpcomingCount, int CompletedCount, IReadOnlyList<ActivePlanSummary> Active);

/// <summary>Learning snapshot (A-27). Only non-deleted cards and their milestones are counted.</summary>
/// <param name="MilestonesCompletedLast7Days">Milestones with <c>isDone</c> and <c>completedAt ≥ serverNow − 7×24 h</c> (rolling window).</param>
public sealed record DashboardLearning(
    int NotStartedCount,
    int InProgressCount,
    int CompletedCount,
    int MilestonesDone,
    int MilestonesTotal,
    int MilestonesCompletedLast7Days);
