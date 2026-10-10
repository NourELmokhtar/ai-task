using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Application.Features.Learning;
using QuickFlow.Application.Features.Plans;
using QuickFlow.Application.Features.Tasks;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Plans;

/// <summary>
/// TR-2 (M07): the plan service applies the lifecycle on every read/return path with a controlled clock, persists the
/// computed status, groups plans and exposes the tracking summary for M08.
/// </summary>
public class PlanTrackingServiceTests
{
    private static readonly DateOnly Today = new(2026, 10, 10);
    private static readonly DateTime Start = new(2026, 10, 10, 9, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime End = Start.AddHours(3);

    private readonly string _databaseName = Guid.NewGuid().ToString();
    private readonly FixedTimeProvider _clock = new(new DateTimeOffset(Start.AddHours(-1)));
    private readonly TestDbContext _db;
    private readonly TaskService _tasks;
    private readonly HabitService _habits;
    private readonly LearningService _learning;
    private PlanService _service;

    public PlanTrackingServiceTests()
    {
        _db = TestDbContext.CreateInMemory(_clock, _databaseName);
        _tasks = new TaskService(_db, _clock);
        _habits = new HabitService(_db, _clock);
        _learning = new LearningService(_db, _clock);
        _service = CreateService(_db);
    }

    private PlanService CreateService(TestDbContext db) =>
        new(db, new PlanSourceResolver(new TaskService(db, _clock), new HabitService(db, _clock), new LearningService(db, _clock)),
            new TaskService(db, _clock), _clock);

    private void At(DateTime utc) => _clock.UtcNow = new DateTimeOffset(utc);

    private void NewScope() => _db.ChangeTracker.Clear();

    private async Task<(string Type, int Id)[]> CreateSources()
    {
        var task = await _tasks.CreateAsync(new CreateTaskRequest { Title = "Write report" });
        var habit = await _habits.CreateAsync(new CreateHabitRequest { Name = "Drink water", Frequency = "Daily" }, Today);
        var card = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "Clean Code" });
        NewScope();
        return [("Task", task.Id), ("Habit", habit.Id), ("LearningResource", card.Id)];
    }

    private async Task<PlanResponse> CreatePlan(
        (string Type, int Id)[] items, DateTime? start = null, DateTime? end = null, string title = "Plan", int priority = 1)
    {
        var plan = await _service.CreateAsync(new CreatePlanRequest
        {
            Title = title,
            EstimatedDurationMinutes = 60,
            StartDateTime = start ?? Start,
            EndDateTime = end ?? End,
            PriorityOrder = priority,
            Items = items.Select(i => (CreatePlanItemRequest?)new CreatePlanItemRequest { SourceType = i.Type, SourceId = i.Id }).ToList(),
        });
        NewScope();
        return plan;
    }

    private async Task<PlanResponse> SetDone(PlanResponse plan, int index, bool isDone)
    {
        var result = await _service.SetItemDoneAsync(plan.Id, plan.Items[index].Id, new UpdatePlanItemRequest { IsDone = isDone });
        NewScope();
        return result;
    }

    private async Task<PlanStatus> StoredStatus(int planId) =>
        (await _db.Set<Plan>().AsNoTracking().SingleAsync(p => p.Id == planId)).Status;

    [Fact]
    public async Task Create_before_start_is_NotStarted_with_null_rest_time_and_serverNow()
    {
        var sources = await CreateSources();

        var plan = await CreatePlan(sources);

        Assert.Equal(PlanStatus.NotStarted, plan.Status);
        Assert.Null(plan.RestTimeSeconds);
        Assert.Equal(Start.AddHours(-1), plan.ServerNow);
        Assert.Equal(DateTimeKind.Utc, plan.ServerNow.Kind);
        Assert.Equal(PlanStatus.NotStarted, await StoredStatus(plan.Id));
    }

    [Fact]
    public async Task Create_inside_the_window_is_InProgress_and_stored()
    {
        var sources = await CreateSources();
        At(Start.AddMinutes(10));

        var plan = await CreatePlan(sources);

        Assert.Equal(PlanStatus.InProgress, plan.Status);
        Assert.Equal(10_200, plan.RestTimeSeconds);
        Assert.Equal(PlanStatus.InProgress, await StoredStatus(plan.Id));
    }

    [Fact]
    public async Task Create_with_a_past_window_is_Completed_and_in_history()
    {
        var sources = await CreateSources();
        At(End.AddHours(1));

        var plan = await CreatePlan(sources);

        Assert.Equal(PlanStatus.Completed, plan.Status);
        Assert.Null(plan.RestTimeSeconds);
        Assert.Equal([plan.Id], (await _service.ListAsync(PlanGroup.Completed)).Select(p => p.Id));
    }

    [Fact]
    public async Task Status_and_rest_time_are_recomputed_after_the_clock_advances_without_writes()
    {
        var sources = await CreateSources();
        var plan = await CreatePlan(sources);

        At(Start);
        var atStart = await _service.GetAsync(plan.Id);
        Assert.Equal((PlanStatus.InProgress, 10_800L), (atStart.Status, atStart.RestTimeSeconds!.Value));
        Assert.Equal(Start, atStart.ServerNow);
        NewScope();
        Assert.Equal(PlanStatus.InProgress, await StoredStatus(plan.Id));

        At(Start.AddMinutes(1));
        var oneMinuteLater = (await _service.ListAsync()).Single();
        Assert.Equal(10_740, oneMinuteLater.RestTimeSeconds);
        NewScope();

        // "Restart": a new context and service over the same stored data; only the clock moved.
        At(End);
        await using var restartedDb = TestDbContext.CreateInMemory(_clock, _databaseName);
        var restarted = await CreateService(restartedDb).GetAsync(plan.Id);
        Assert.Equal(PlanStatus.Completed, restarted.Status);
        Assert.Null(restarted.RestTimeSeconds);
        Assert.Equal(PlanStatus.Completed, await StoredStatus(plan.Id));
    }

    [Fact]
    public async Task All_items_done_mid_window_completes_and_unmarking_one_returns_to_InProgress()
    {
        var sources = await CreateSources();
        var plan = await CreatePlan(sources);
        At(Start.AddHours(1));

        await SetDone(plan, 0, true);
        Assert.Equal(PlanStatus.InProgress, (await SetDone(plan, 1, true)).Status);
        var done = await SetDone(plan, 2, true);

        Assert.Equal((PlanStatus.Completed, 100), (done.Status, done.ProgressPercent));
        Assert.Null(done.RestTimeSeconds);
        Assert.Equal(PlanStatus.Completed, await StoredStatus(plan.Id));
        Assert.Equal([plan.Id], (await _service.ListAsync(PlanGroup.Completed)).Select(p => p.Id));
        NewScope();

        var undone = await SetDone(plan, 1, false);

        Assert.Equal((PlanStatus.InProgress, 67), (undone.Status, undone.ProgressPercent));
        Assert.Equal(7_200, undone.RestTimeSeconds);
        Assert.Equal(PlanStatus.InProgress, await StoredStatus(plan.Id));
        Assert.Equal([plan.Id], (await _service.ListAsync(PlanGroup.Active)).Select(p => p.Id));
    }

    [Fact]
    public async Task All_items_done_before_start_is_Completed_and_unmarking_returns_to_NotStarted()
    {
        var sources = await CreateSources();
        var plan = await CreatePlan(sources[..1]);

        var done = await SetDone(plan, 0, true);
        Assert.Equal(PlanStatus.Completed, done.Status);
        Assert.Equal(PlanStatus.Completed, await StoredStatus(plan.Id));

        var undone = await SetDone(plan, 0, false);
        Assert.Equal(PlanStatus.NotStarted, undone.Status);
        Assert.Null(undone.RestTimeSeconds);
    }

    [Fact]
    public async Task Past_end_with_one_of_three_done_is_Completed_with_33_percent_in_history()
    {
        var sources = await CreateSources();
        var plan = await CreatePlan(sources);
        At(Start.AddMinutes(30));
        await SetDone(plan, 2, true);

        At(End.AddDays(1));
        var history = await _service.ListAsync(PlanGroup.Completed);

        var item = Assert.Single(history);
        Assert.Equal((PlanStatus.Completed, 33, 1, 3), (item.Status, item.ProgressPercent, item.DoneItems, item.TotalItems));
        Assert.Null(item.RestTimeSeconds);
        NewScope();
        Assert.Equal(PlanStatus.Completed, await StoredStatus(plan.Id));
    }

    [Fact]
    public async Task Update_recomputes_the_status_from_the_new_window()
    {
        var sources = await CreateSources();
        At(Start.AddMinutes(30));
        var plan = await CreatePlan(sources);
        Assert.Equal(PlanStatus.InProgress, plan.Status);

        var moved = await _service.UpdateAsync(plan.Id, new UpdatePlanRequest
        {
            Title = "Later",
            EstimatedDurationMinutes = 30,
            StartDateTime = Start.AddDays(1),
            EndDateTime = End.AddDays(1),
            PriorityOrder = 1,
        });
        NewScope();

        Assert.Equal(PlanStatus.NotStarted, moved.Status);
        Assert.Null(moved.RestTimeSeconds);
        Assert.Equal(PlanStatus.NotStarted, await StoredStatus(plan.Id));
    }

    [Fact]
    public async Task Groups_return_the_right_sets_in_the_right_order()
    {
        var sources = await CreateSources();
        At(Start.AddHours(1)); // now = 10:00
        await CreatePlan(sources, Start, End, "active-p2", 2);
        await CreatePlan(sources, Start.AddMinutes(30), End, "active-p1", 1);
        await CreatePlan(sources, End, End.AddHours(1), "upcoming-late", 1);
        await CreatePlan(sources, Start.AddHours(2), End, "upcoming-early", 1);
        await CreatePlan(sources, Start.AddHours(-5), Start.AddHours(-4), "ended-early", 1);
        await CreatePlan(sources, Start.AddHours(-3), Start.AddHours(-1), "ended-late", 3);
        var doneActive = await CreatePlan(sources[..1], Start, End.AddHours(5), "done-active", 9);
        await SetDone(doneActive, 0, true);

        Assert.Equal(["active-p1", "active-p2"], (await _service.ListAsync(PlanGroup.Active)).Select(p => p.Title));
        Assert.Equal(["upcoming-early", "upcoming-late"], (await _service.ListAsync(PlanGroup.Upcoming)).Select(p => p.Title));
        Assert.Equal(
            ["done-active", "ended-late", "ended-early"], // EndDateTime descending
            (await _service.ListAsync(PlanGroup.Completed)).Select(p => p.Title));

        var all = await _service.ListAsync();
        Assert.Equal(7, all.Count);
        Assert.Equal(
            ["ended-early", "active-p1", "upcoming-early", "upcoming-late", "active-p2", "ended-late", "done-active"],
            all.Select(p => p.Title)); // A-16 order unchanged
        Assert.All(all, p => Assert.Equal(Start.AddHours(1), p.ServerNow));
        Assert.All(all, p => Assert.Equal(p.Status == PlanStatus.InProgress, p.RestTimeSeconds is not null));
    }

    [Theory]
    [InlineData("active", PlanGroup.Active)]
    [InlineData(" UPCOMING ", PlanGroup.Upcoming)]
    [InlineData("Completed", PlanGroup.Completed)]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("  ", null)]
    public void Group_filter_parses_case_insensitively(string? value, PlanGroup? expected) =>
        Assert.Equal(expected, PlanInputValidator.ParseGroupFilter(value));

    [Theory]
    [InlineData("all")]
    [InlineData("0")]
    [InlineData("InProgress")]
    [InlineData("history")]
    public void Invalid_group_is_a_validation_error(string value)
    {
        var ex = Assert.Throws<ValidationException>(() => PlanInputValidator.ParseGroupFilter(value));
        Assert.Equal(["Group must be one of: active, upcoming, completed."], ex.Errors["group"]);
    }

    [Fact]
    public async Task Tracking_summary_counts_per_status_and_lists_active_plans_for_M08()
    {
        var sources = await CreateSources();
        At(Start.AddHours(1));
        var active = await CreatePlan(sources, Start, End, "active", 2);
        await CreatePlan(sources, End, End.AddHours(1), "upcoming", 1);
        await CreatePlan(sources, Start.AddHours(-3), Start.AddHours(-1), "ended", 1);
        var secondActive = await CreatePlan(sources, Start.AddMinutes(15), End.AddHours(1), "active-first", 1);
        await SetDone(active, 0, true);

        var summary = await _service.GetTrackingSummaryAsync();

        Assert.Equal(Start.AddHours(1), summary.ServerNow);
        Assert.Equal((2, 1, 1), (summary.InProgressCount, summary.UpcomingCount, summary.CompletedCount));
        Assert.Equal([secondActive.Id, active.Id], summary.Active.Select(p => p.Id));
        var a = summary.Active.Single(p => p.Id == active.Id);
        Assert.Equal((PlanStatus.InProgress, 33, 1, 3, 7_200L), (a.Status, a.ProgressPercent, a.DoneItems, a.TotalItems, a.RestTimeSeconds!.Value));

        // Same lifecycle as the list endpoint (NFR-M2): a later clock moves everything to Completed.
        At(End.AddHours(2));
        var later = await _service.GetTrackingSummaryAsync();
        Assert.Equal((0, 0, 4), (later.InProgressCount, later.UpcomingCount, later.CompletedCount));
        Assert.Empty(later.Active);
        Assert.Equal(4, await _db.Set<Plan>().AsNoTracking().CountAsync(p => p.Status == PlanStatus.Completed));
    }

    [Fact]
    public async Task Deleted_plans_are_not_tracked()
    {
        var sources = await CreateSources();
        At(Start.AddMinutes(5));
        var plan = await CreatePlan(sources);
        await _service.DeleteAsync(plan.Id);
        NewScope();

        Assert.Empty(await _service.ListAsync(PlanGroup.Active));
        Assert.Equal(0, (await _service.GetTrackingSummaryAsync()).InProgressCount);
        await Assert.ThrowsAsync<NotFoundException>(() => _service.GetAsync(plan.Id));
    }
}
