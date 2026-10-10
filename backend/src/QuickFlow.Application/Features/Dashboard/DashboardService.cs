using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Application.Domain.Tasks;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Application.Features.Plans;
using QuickFlow.Application.Features.Tasks;

namespace QuickFlow.Application.Features.Dashboard;

/// <summary>The aggregated dashboard (M08 B1).</summary>
public interface IDashboardService
{
    /// <summary>All dashboard metrics for <paramref name="today"/> (the effective date from <c>ITodayProvider</c>).</summary>
    Task<DashboardResponse> GetAsync(DateOnly today, CancellationToken cancellationToken = default);
}

/// <summary>
/// Composes the module services instead of re-implementing their rules (NFR-M2):
/// tasks through <see cref="ITaskService.ListAsync"/> (M02 due-date and overdue queries, <see cref="TaskItem.IsOverdue"/>),
/// habits through <see cref="IHabitService.ListAsync"/> (<see cref="HabitProgressCalculator"/>), plans through
/// <see cref="IPlanService.GetTrackingSummaryAsync"/> (M07 status, progress and rest time) and learning counts through
/// set-based count queries. A fixed number of queries per request (no per-habit / per-plan queries).
/// </summary>
public sealed class DashboardService(
    IApplicationDbContext db,
    ITaskService tasks,
    IHabitService habits,
    IPlanService plans,
    TimeProvider timeProvider) : IDashboardService
{
    /// <summary>Orchestrator decision (M04/M08): "last 7 days" is a rolling 7×24 h window ending at server now.</summary>
    public static readonly TimeSpan RecentWindow = TimeSpan.FromDays(7);

    public async Task<DashboardResponse> GetAsync(DateOnly today, CancellationToken cancellationToken = default)
    {
        // The plan summary reads the clock once; that instant is the dashboard's serverNow for every time-based metric.
        var planSummary = await plans.GetTrackingSummaryAsync(cancellationToken);
        var serverNow = planSummary.ServerNow;

        var taskMetrics = await GetTasksAsync(today, cancellationToken);
        var habitMetrics = await GetHabitsAsync(today, cancellationToken);
        var learningMetrics = await GetLearningAsync(serverNow, cancellationToken);

        return new DashboardResponse(
            serverNow,
            today,
            taskMetrics,
            habitMetrics,
            new DashboardPlans(planSummary.InProgressCount, planSummary.UpcomingCount, planSummary.CompletedCount, planSummary.Active),
            learningMetrics);
    }

    /// <summary>A-25: Done ÷ all non-archived tasks × 100, rounded (midpoint away from zero); 0 when there are no tasks.</summary>
    public static int CompletionPercent(int doneCount, int totalCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(doneCount);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(doneCount, totalCount);
        return totalCount == 0 ? 0 : (int)Math.Round(doneCount * 100m / totalCount, MidpointRounding.AwayFromZero);
    }

    private async Task<DashboardTasks> GetTasksAsync(DateOnly today, CancellationToken cancellationToken)
    {
        // M02 list queries (archived excluded by default): "due today" recipe dueFrom=dueTo=today, and overdue=true (A-05).
        var dueToday = await tasks.ListAsync(new TaskListQuery { DueFrom = today, DueTo = today }, today, cancellationToken);
        var overdue = await tasks.ListAsync(
            new TaskListQuery { Overdue = true, SortBy = "dueDate", SortDir = "asc" }, today, cancellationToken);

        var active = db.Set<TaskItem>().AsNoTracking().Where(t => !t.IsArchived);
        var totalActive = await active.CountAsync(cancellationToken);
        var doneCount = await active.CountAsync(t => t.Status == TaskItemStatus.Done, cancellationToken);

        // A-06: completed today = CompletedAt converted to the server-local date equals today. A coarse UTC window
        // (covers every UTC offset) keeps the query small; the exact local-date comparison happens in memory.
        var windowStart = today.AddDays(-1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var windowEnd = today.AddDays(2).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var completedAtValues = await active
            .Where(t => t.Status == TaskItemStatus.Done && t.CompletedAt != null && t.CompletedAt >= windowStart && t.CompletedAt < windowEnd)
            .Select(t => t.CompletedAt!.Value)
            .ToListAsync(cancellationToken);
        var completedToday = completedAtValues.Count(c => ToServerLocalDate(c) == today);

        return new DashboardTasks(
            dueToday.Select(t => TaskResponse.From(t, today)).ToList(),
            overdue.Select(t => TaskResponse.From(t, today)).ToList(),
            completedToday,
            totalActive,
            doneCount,
            CompletionPercent(doneCount, totalActive));
    }

    private async Task<DashboardHabits> GetHabitsAsync(DateOnly today, CancellationToken cancellationToken)
    {
        // A-26: active habits with M03 progress (one query for habits, one for completions).
        var active = await habits.ListAsync(active: true, today, cancellationToken);
        return new DashboardHabits(
            active.Count,
            active.Count(h => h.CompletedToday),
            active.Select(DashboardHabitItem.From).ToList());
    }

    private async Task<DashboardLearning> GetLearningAsync(DateTime serverNow, CancellationToken cancellationToken)
    {
        // Query filters exclude deleted cards and the milestones of deleted cards (BR-14).
        var statusCounts = await db.Set<LearningCard>().AsNoTracking()
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        int CountOf(LearningCardStatus status) => statusCounts.Where(s => s.Status == status).Sum(s => s.Count);

        var milestones = db.Set<LearningMilestone>().AsNoTracking();
        var total = await milestones.CountAsync(cancellationToken);
        var done = await milestones.CountAsync(m => m.IsDone, cancellationToken);

        // Orchestrator decision: rolling window IsDone && CompletedAt >= now − 7×24 h.
        var since = serverNow - RecentWindow;
        var recent = await milestones.CountAsync(m => m.IsDone && m.CompletedAt != null && m.CompletedAt >= since, cancellationToken);

        return new DashboardLearning(
            CountOf(LearningCardStatus.NotStarted),
            CountOf(LearningCardStatus.InProgress),
            CountOf(LearningCardStatus.Completed),
            done,
            total,
            recent);
    }

    private DateOnly ToServerLocalDate(DateTime utc) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), timeProvider.LocalTimeZone));
}
