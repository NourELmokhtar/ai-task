using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Domain.Habits;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Domain.Tasks;
using QuickFlow.Application.Features.Dashboard;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Application.Features.Learning;
using QuickFlow.Application.Features.Plans;
using QuickFlow.Application.Features.Tasks;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Dashboard;

/// <summary>
/// TR-3 (M08): every dashboard metric equals the underlying data across seeded scenarios, using the real module services
/// and a controlled clock.
/// </summary>
public class DashboardServiceTests
{
    /// <summary>Wednesday; its ISO week starts on Monday 2026-10-12.</summary>
    private static readonly DateOnly Today = new(2026, 10, 14);
    private static readonly DateTime Now = new(2026, 10, 14, 10, 0, 0, DateTimeKind.Utc);

    private readonly FixedTimeProvider _clock;
    private readonly TestDbContext _db;
    private readonly TaskService _tasks;
    private readonly HabitService _habits;
    private readonly LearningService _learning;
    private readonly PlanService _plans;
    private readonly DashboardService _service;

    public DashboardServiceTests() : this(null)
    {
    }

    private DashboardServiceTests(TimeZoneInfo? localTimeZone)
    {
        _clock = new FixedTimeProvider(new DateTimeOffset(Now), localTimeZone);
        _db = TestDbContext.CreateInMemory(_clock);
        _tasks = new TaskService(_db, _clock);
        _habits = new HabitService(_db, _clock);
        _learning = new LearningService(_db, _clock);
        _plans = new PlanService(_db, new PlanSourceResolver(_tasks, _habits, _learning), _tasks, _clock);
        _service = new DashboardService(_db, _tasks, _habits, _plans, _clock);
    }

    private void At(DateTime utc) => _clock.UtcNow = new DateTimeOffset(utc);

    private async Task<DashboardResponse> Get(DateOnly? today = null)
    {
        _db.ChangeTracker.Clear();
        return await _service.GetAsync(today ?? Today);
    }

    private async Task<TaskItem> AddTask(string title, DateOnly? due = null, string status = "Todo", bool archived = false)
    {
        var task = await _tasks.CreateAsync(new CreateTaskRequest { Title = title, DueDate = due, Status = status });
        if (archived) await _tasks.ArchiveAsync(task.Id);
        return task;
    }

    // ---------- general ----------

    [Fact]
    public async Task Empty_database_returns_zero_metrics_empty_lists_and_the_clock()
    {
        var result = await Get();

        Assert.Equal(Now, result.ServerNow);
        Assert.Equal(Today, result.Today);
        Assert.Empty(result.Tasks.DueToday);
        Assert.Empty(result.Tasks.Overdue);
        Assert.Equal((0, 0, 0, 0), (result.Tasks.CompletedTodayCount, result.Tasks.TotalActive, result.Tasks.DoneCount, result.Tasks.CompletionPercent));
        Assert.Equal((0, 0), (result.Habits.ActiveCount, result.Habits.CompletedTodayCount));
        Assert.Empty(result.Habits.Items);
        Assert.Equal((0, 0, 0), (result.Plans.InProgressCount, result.Plans.UpcomingCount, result.Plans.CompletedCount));
        Assert.Empty(result.Plans.Active);
        Assert.Equal(new DashboardLearning(0, 0, 0, 0, 0, 0), result.Learning);
    }

    // ---------- tasks ----------

    [Fact]
    public async Task Task_metrics_equal_direct_queries_over_seeded_data()
    {
        var dueTodayTodo = await AddTask("today todo", Today);
        var dueTodayDone = await AddTask("today done", Today, "Done");
        await AddTask("today archived", Today, archived: true);
        var overdueYesterday = await AddTask("yesterday todo", Today.AddDays(-1));
        await AddTask("yesterday done", Today.AddDays(-1), "Done");
        await AddTask("yesterday archived", Today.AddDays(-1), archived: true);
        var overdueOlder = await AddTask("older in progress", Today.AddDays(-5), "InProgress");
        await AddTask("no due date", null, "Done");
        await AddTask("tomorrow", Today.AddDays(1));
        var deleted = await AddTask("deleted overdue", Today.AddDays(-2));
        await _tasks.DeleteAsync(deleted.Id);

        var result = await Get();

        // Direct queries over the same data (soft-delete filter applies).
        var all = await _db.Set<TaskItem>().AsNoTracking().ToListAsync();
        var active = all.Where(t => !t.IsArchived).ToList();
        Assert.Equal(active.Count, result.Tasks.TotalActive);
        Assert.Equal(active.Count(t => t.Status == TaskItemStatus.Done), result.Tasks.DoneCount);
        Assert.Equal(all.Where(t => t.DueDate == Today && !t.IsArchived).Select(t => t.Id).Order(), result.Tasks.DueToday.Select(t => t.Id).Order());
        Assert.Equal(all.Where(t => t.IsOverdue(Today)).Select(t => t.Id).Order(), result.Tasks.Overdue.Select(t => t.Id).Order());

        // Concrete expectations.
        Assert.Equal(7, result.Tasks.TotalActive);
        Assert.Equal(3, result.Tasks.DoneCount);
        Assert.Equal(43, result.Tasks.CompletionPercent); // 3 / 7 = 42.86 %
        Assert.Equal(3, result.Tasks.CompletedTodayCount); // all three were completed at Now
        Assert.Equal(new[] { dueTodayTodo.Id, dueTodayDone.Id }.Order(), result.Tasks.DueToday.Select(t => t.Id).Order());
        Assert.Equal([overdueOlder.Id, overdueYesterday.Id], result.Tasks.Overdue.Select(t => t.Id)); // dueDate ascending
        Assert.All(result.Tasks.Overdue, t => Assert.True(t.IsOverdue));
        Assert.All(result.Tasks.DueToday, t => Assert.False(t.IsOverdue));
    }

    [Fact]
    public async Task Overdue_excludes_done_archived_due_today_and_undated_tasks()
    {
        var overdue = await AddTask("overdue", Today.AddDays(-1));
        await AddTask("done", Today.AddDays(-1), "Done");
        await AddTask("archived", Today.AddDays(-1), archived: true);
        await AddTask("due today", Today);
        await AddTask("no due date");

        var result = await Get();
        Assert.Equal([overdue.Id], result.Tasks.Overdue.Select(t => t.Id));

        // Completing the overdue task removes it from the list.
        await _tasks.CompleteAsync(overdue.Id);
        Assert.Empty((await Get()).Tasks.Overdue);
    }

    [Fact]
    public async Task Completed_today_uses_completedAt_not_the_due_date_and_excludes_archived()
    {
        At(Now.AddDays(-1));
        var doneYesterday = await AddTask("due today, completed yesterday", Today);
        await _tasks.CompleteAsync(doneYesterday.Id);
        At(Now);
        var doneToday = await AddTask("due last week, completed today", Today.AddDays(-7));
        await _tasks.CompleteAsync(doneToday.Id);
        await AddTask("completed today, archived", null, "Done", archived: true);

        var result = await Get();

        Assert.Equal(1, result.Tasks.CompletedTodayCount);
        Assert.Contains(result.Tasks.DueToday, t => t.Id == doneYesterday.Id);
        Assert.Equal(2, result.Tasks.TotalActive);
        Assert.Equal(2, result.Tasks.DoneCount);
        Assert.Equal(100, result.Tasks.CompletionPercent);

        // Un-completing clears completedAt, so the task no longer counts.
        await _tasks.UpdateAsync(doneToday.Id, new UpdateTaskRequest { Title = "x", Status = "Todo", Priority = "Medium" });
        Assert.Equal(0, (await Get()).Tasks.CompletedTodayCount);
    }

    [Fact]
    public async Task Completed_today_converts_completedAt_to_the_server_local_date()
    {
        var plus4 = TimeZoneInfo.CreateCustomTimeZone("Test+04", TimeSpan.FromHours(4), "Test+04", "Test+04");
        var sut = new DashboardServiceTests(plus4);

        // 2026-10-13T21:00Z is 2026-10-14 01:00 local (+04:00); 2026-10-13T19:00Z is 23:00 local on the 13th.
        sut.At(new DateTime(2026, 10, 13, 21, 0, 0, DateTimeKind.Utc));
        await sut.AddTask("local today", status: "Done");
        sut.At(new DateTime(2026, 10, 13, 19, 0, 0, DateTimeKind.Utc));
        await sut.AddTask("local yesterday", status: "Done");
        sut.At(new DateTime(2026, 10, 14, 19, 59, 59, DateTimeKind.Utc)); // 23:59:59 local on the 14th
        await sut.AddTask("local today, late", status: "Done");
        sut.At(new DateTime(2026, 10, 14, 20, 0, 0, DateTimeKind.Utc)); // 00:00 local on the 15th
        await sut.AddTask("local tomorrow", status: "Done");

        Assert.Equal(2, (await sut.Get(new DateOnly(2026, 10, 14))).Tasks.CompletedTodayCount);
        Assert.Equal(1, (await sut.Get(new DateOnly(2026, 10, 13))).Tasks.CompletedTodayCount);
        Assert.Equal(1, (await sut.Get(new DateOnly(2026, 10, 15))).Tasks.CompletedTodayCount);
    }

    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(0, 4, 0)]
    [InlineData(1, 3, 33)]
    [InlineData(2, 3, 67)]
    [InlineData(1, 2, 50)]
    [InlineData(1, 8, 13)] // 12.5 rounds away from zero
    [InlineData(3, 3, 100)]
    public void Completion_percent_rounds_and_is_zero_without_tasks(int done, int total, int expected) =>
        Assert.Equal(expected, DashboardService.CompletionPercent(done, total));

    [Fact]
    public async Task Completion_percent_with_mixed_statuses_ignores_archived_tasks()
    {
        await AddTask("todo");
        await AddTask("in progress", status: "InProgress");
        await AddTask("done", status: "Done");
        await AddTask("archived done", status: "Done", archived: true);
        await AddTask("archived todo", archived: true);

        var tasks = (await Get()).Tasks;

        Assert.Equal((3, 1, 33), (tasks.TotalActive, tasks.DoneCount, tasks.CompletionPercent));
    }

    [Fact]
    public async Task Archiving_a_task_removes_it_from_every_task_metric()
    {
        var task = await AddTask("due today", Today, "Done");
        var before = (await Get()).Tasks;
        Assert.Equal((1, 1, 1, 100, 1), (before.DueToday.Count, before.TotalActive, before.DoneCount, before.CompletionPercent, before.CompletedTodayCount));

        await _tasks.ArchiveAsync(task.Id);
        var after = (await Get()).Tasks;

        Assert.Empty(after.DueToday);
        Assert.Empty(after.Overdue);
        Assert.Equal((0, 0, 0, 0), (after.TotalActive, after.DoneCount, after.CompletionPercent, after.CompletedTodayCount));
    }

    // ---------- habits ----------

    [Fact]
    public async Task Habits_show_active_habits_with_M03_progress()
    {
        var weekly = await _habits.CreateAsync(new CreateHabitRequest { Name = "Long run", Frequency = "Weekly" }, Today);
        await _habits.AddCompletionAsync(weekly.Id, new DateOnly(2026, 10, 12), Today); // Monday of this ISO week
        var daily = await _habits.CreateAsync(new CreateHabitRequest { Name = "Water", Frequency = "Daily" }, Today);
        await _habits.AddCompletionAsync(daily.Id, Today.AddDays(-1), Today);
        await _habits.AddCompletionAsync(daily.Id, Today, Today);
        var notYet = await _habits.CreateAsync(new CreateHabitRequest { Name = "Read", Frequency = "Daily" }, Today);
        var inactive = await _habits.CreateAsync(new CreateHabitRequest { Name = "Inactive", Frequency = "Daily" }, Today);
        await _habits.AddCompletionAsync(inactive.Id, Today, Today);
        await _habits.DeactivateAsync(inactive.Id, Today);
        var deleted = await _habits.CreateAsync(new CreateHabitRequest { Name = "Deleted", Frequency = "Daily" }, Today);
        await _habits.AddCompletionAsync(deleted.Id, Today, Today);
        await _habits.DeleteAsync(deleted.Id);

        var habits = (await Get()).Habits;

        Assert.Equal(3, habits.ActiveCount);
        Assert.Equal(1, habits.CompletedTodayCount);
        Assert.Equal([weekly.Id, daily.Id, notYet.Id], habits.Items.Select(h => h.Id));

        var weeklyItem = habits.Items[0];
        Assert.Equal(("Long run", HabitFrequency.Weekly), (weeklyItem.Name, weeklyItem.Frequency));
        Assert.False(weeklyItem.CompletedToday);
        Assert.True(weeklyItem.CompletedForCurrentPeriod);
        Assert.Equal(1, weeklyItem.CurrentStreak);

        Assert.Equal(new DashboardHabitItem(daily.Id, "Water", HabitFrequency.Daily, true, true, 2), habits.Items[1]);
        Assert.Equal(new DashboardHabitItem(notYet.Id, "Read", HabitFrequency.Daily, false, false, 0), habits.Items[2]);

        // Each item equals the M03 list for the same day.
        var direct = await _habits.ListAsync(active: true, Today);
        Assert.Equal(direct.Select(DashboardHabitItem.From), habits.Items);
    }

    [Fact]
    public async Task Completing_a_habit_increments_completed_today()
    {
        var habit = await _habits.CreateAsync(new CreateHabitRequest { Name = "Stretch", Frequency = "Daily" }, Today);
        Assert.Equal(0, (await Get()).Habits.CompletedTodayCount);

        await _habits.AddCompletionAsync(habit.Id, null, Today);

        Assert.Equal(1, (await Get()).Habits.CompletedTodayCount);
    }

    // ---------- plans ----------

    private async Task<PlanResponse> AddPlan(string title, DateTime start, DateTime end, params (string Type, int Id)[] items) =>
        await _plans.CreateAsync(new CreatePlanRequest
        {
            Title = title,
            EstimatedDurationMinutes = 30,
            StartDateTime = start,
            EndDateTime = end,
            PriorityOrder = 1,
            Items = items.Select(i => (CreatePlanItemRequest?)new CreatePlanItemRequest { SourceType = i.Type, SourceId = i.Id }).ToList(),
        });

    [Fact]
    public async Task Active_plans_are_InProgress_only_with_progress_and_rest_time()
    {
        var task = await AddTask("plan task");
        var habit = await _habits.CreateAsync(new CreateHabitRequest { Name = "plan habit", Frequency = "Daily" }, Today);
        var card = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "plan card" });
        (string, int)[] items = [("Task", task.Id), ("Habit", habit.Id), ("LearningResource", card.Id)];

        var running = await AddPlan("running", Now.AddMinutes(-30), Now.AddMinutes(90), items);
        await AddPlan("upcoming", Now.AddHours(2), Now.AddHours(3), items);
        await AddPlan("past", Now.AddHours(-3), Now.AddHours(-2), items);
        var allDone = await AddPlan("all done in window", Now.AddMinutes(-10), Now.AddMinutes(50), ("Habit", habit.Id));
        await _plans.SetItemDoneAsync(allDone.Id, allDone.Items[0].Id, new UpdatePlanItemRequest { IsDone = true });
        var deleted = await AddPlan("deleted", Now.AddMinutes(-10), Now.AddMinutes(50), items);
        await _plans.DeleteAsync(deleted.Id);
        await _plans.SetItemDoneAsync(running.Id, running.Items[1].Id, new UpdatePlanItemRequest { IsDone = true });

        var result = await Get();
        var plans = result.Plans;

        Assert.Equal((1, 1, 2), (plans.InProgressCount, plans.UpcomingCount, plans.CompletedCount));
        var active = Assert.Single(plans.Active);
        Assert.Equal(running.Id, active.Id);
        Assert.Equal(PlanStatus.InProgress, active.Status);
        Assert.Equal((1, 3, 33), (active.DoneItems, active.TotalItems, active.ProgressPercent));
        Assert.Equal(90 * 60, active.RestTimeSeconds);
        Assert.Equal(Now.AddMinutes(90), active.EndDateTime);
        Assert.Equal(result.ServerNow, Now);

        // Same data as the M07 active group.
        var activeGroup = await _plans.ListAsync(PlanGroup.Active);
        Assert.Equal(activeGroup.Select(p => (p.Id, p.ProgressPercent, p.RestTimeSeconds)), plans.Active.Select(p => (p.Id, p.ProgressPercent, p.RestTimeSeconds)));
    }

    [Fact]
    public async Task Patching_a_plan_item_updates_the_dashboard_progress_and_rest_time_follows_the_clock()
    {
        var a = await AddTask("a");
        var b = await AddTask("b");
        var plan = await AddPlan("running", Now.AddMinutes(-5), Now.AddMinutes(60), ("Task", a.Id), ("Task", b.Id));
        Assert.Equal(0, Assert.Single((await Get()).Plans.Active).ProgressPercent);

        await _plans.SetItemDoneAsync(plan.Id, plan.Items[0].Id, new UpdatePlanItemRequest { IsDone = true });
        At(Now.AddMinutes(10));
        var result = await Get();

        var active = Assert.Single(result.Plans.Active);
        Assert.Equal(50, active.ProgressPercent);
        Assert.Equal(50 * 60, active.RestTimeSeconds);
        Assert.Equal(Now.AddMinutes(10), result.ServerNow);
        Assert.Equal(1, result.Tasks.DoneCount); // BR-13: the task item completed the task
    }

    // ---------- learning ----------

    [Fact]
    public async Task Learning_counts_cards_by_status_and_milestones_of_non_deleted_cards()
    {
        var c1 = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "not started 1" });
        await _learning.CreateAsync(new CreateLearningCardRequest { Title = "not started 2" });
        var c3 = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "in progress" });
        await _learning.UpdateAsync(c3.Id, new UpdateLearningCardRequest { Title = "in progress", Status = "InProgress" });
        var c4 = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "completed" });
        await _learning.UpdateAsync(c4.Id, new UpdateLearningCardRequest { Title = "completed", Status = "Completed" });
        var gone = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "deleted" });

        var m1 = await _learning.AddMilestoneAsync(c1.Id, new CreateLearningMilestoneRequest { Title = "m1" });
        await _learning.AddMilestoneAsync(c1.Id, new CreateLearningMilestoneRequest { Title = "m2" });
        var m3 = await _learning.AddMilestoneAsync(c3.Id, new CreateLearningMilestoneRequest { Title = "m3" });
        var goneMilestone = await _learning.AddMilestoneAsync(gone.Id, new CreateLearningMilestoneRequest { Title = "deleted card" });

        At(Now.AddDays(-10));
        await _learning.UpdateMilestoneAsync(c3.Id, m3.Id, new UpdateLearningMilestoneRequest { Title = "m3", IsDone = true }); // old
        At(Now.AddDays(-1));
        await _learning.UpdateMilestoneAsync(c1.Id, m1.Id, new UpdateLearningMilestoneRequest { Title = "m1", IsDone = true }); // recent
        await _learning.UpdateMilestoneAsync(gone.Id, goneMilestone.Id, new UpdateLearningMilestoneRequest { Title = "x", IsDone = true });
        await _learning.DeleteAsync(gone.Id);
        At(Now);

        var learning = (await Get()).Learning;

        Assert.Equal(new DashboardLearning(
            NotStartedCount: 2, InProgressCount: 1, CompletedCount: 1,
            MilestonesDone: 2, MilestonesTotal: 3, MilestonesCompletedLast7Days: 1), learning);

        // Equal to direct queries (filters exclude the deleted card and its milestone).
        var cards = await _db.Set<LearningCard>().AsNoTracking().ToListAsync();
        var milestones = await _db.Set<LearningMilestone>().AsNoTracking().ToListAsync();
        Assert.Equal(cards.Count(c => c.Status == LearningCardStatus.NotStarted), learning.NotStartedCount);
        Assert.Equal(milestones.Count, learning.MilestonesTotal);
        Assert.Equal(milestones.Count(m => m.IsDone), learning.MilestonesDone);
    }

    [Fact]
    public async Task Last_7_days_is_a_rolling_7x24h_window_including_its_boundary()
    {
        var card = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "card" });
        var milestone = await _learning.AddMilestoneAsync(card.Id, new CreateLearningMilestoneRequest { Title = "m" });
        var completedAt = new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc);
        At(completedAt);
        await _learning.UpdateMilestoneAsync(card.Id, milestone.Id, new UpdateLearningMilestoneRequest { Title = "m", IsDone = true });

        At(completedAt.AddDays(7)); // exactly now − 7×24 h → inside
        Assert.Equal(1, (await Get()).Learning.MilestonesCompletedLast7Days);

        At(completedAt.AddDays(7).AddTicks(1)); // just outside
        var outside = (await Get()).Learning;
        Assert.Equal(0, outside.MilestonesCompletedLast7Days);
        Assert.Equal(1, outside.MilestonesDone); // still done overall

        // Un-completing clears completedAt; re-completing now counts again.
        await _learning.UpdateMilestoneAsync(card.Id, milestone.Id, new UpdateLearningMilestoneRequest { Title = "m", IsDone = false });
        Assert.Equal((0, 0), ((await Get()).Learning.MilestonesDone, (await Get()).Learning.MilestonesCompletedLast7Days));
        await _learning.UpdateMilestoneAsync(card.Id, milestone.Id, new UpdateLearningMilestoneRequest { Title = "m", IsDone = true });
        Assert.Equal((1, 1), ((await Get()).Learning.MilestonesDone, (await Get()).Learning.MilestonesCompletedLast7Days));
    }
}
