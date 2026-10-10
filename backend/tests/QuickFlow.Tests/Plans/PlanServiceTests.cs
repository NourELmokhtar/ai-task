using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Habits;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Domain.Tasks;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Application.Features.Learning;
using QuickFlow.Application.Features.Plans;
using QuickFlow.Application.Features.Tasks;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Plans;

/// <summary>TR-1: plan service with the real M02/M03/M04 services against the AppDbContext conventions (in-memory provider).</summary>
public class PlanServiceTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 10, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 10);
    private static readonly DateTime Start = new(2026, 10, 10, 9, 0, 0, DateTimeKind.Utc);

    private readonly FixedTimeProvider _clock = new(T0);
    private readonly TestDbContext _db;
    private readonly TaskService _tasks;
    private readonly HabitService _habits;
    private readonly LearningService _learning;
    private readonly PlanService _service;

    public PlanServiceTests()
    {
        _db = TestDbContext.CreateInMemory(_clock);
        _tasks = new TaskService(_db, _clock);
        _habits = new HabitService(_db, _clock);
        _learning = new LearningService(_db, _clock);
        _service = new PlanService(_db, new PlanSourceResolver(_tasks, _habits, _learning), _tasks, _clock);
    }

    /// <summary>Simulates a new request scope (nothing tracked).</summary>
    private void NewScope() => _db.ChangeTracker.Clear();

    private async Task<(int TaskId, int HabitId, int CardId)> CreateSources()
    {
        var task = await _tasks.CreateAsync(new CreateTaskRequest { Title = "Write report" });
        var habit = await _habits.CreateAsync(new CreateHabitRequest { Name = "Drink water", Frequency = "Daily" }, Today);
        var card = await _learning.CreateAsync(new CreateLearningCardRequest { Title = "Clean Code" });
        NewScope();
        return (task.Id, habit.Id, card.Id);
    }

    private static CreatePlanRequest Request(params (string Type, int Id)[] items) => new()
    {
        Title = "Morning plan",
        EstimatedDurationMinutes = 120,
        StartDateTime = Start,
        EndDateTime = Start.AddHours(3),
        PriorityOrder = 1,
        Items = items.Select(i => (CreatePlanItemRequest?)new CreatePlanItemRequest { SourceType = i.Type, SourceId = i.Id }).ToList(),
    };

    private async Task<PlanResponse> CreateThreeItemPlan((int TaskId, int HabitId, int CardId) s)
    {
        var plan = await _service.CreateAsync(Request(("Task", s.TaskId), ("Habit", s.HabitId), ("LearningResource", s.CardId)));
        NewScope();
        return plan;
    }

    private async Task<PlanResponse> SetDone(PlanResponse plan, PlanItemSourceType type, bool isDone)
    {
        var item = plan.Items.Single(i => i.SourceType == type);
        var result = await _service.SetItemDoneAsync(plan.Id, item.Id, new UpdatePlanItemRequest { IsDone = isDone });
        NewScope();
        return result;
    }

    [Fact]
    public async Task Create_with_three_sources_starts_at_zero_percent_with_resolved_titles()
    {
        var s = await CreateSources();

        var plan = await CreateThreeItemPlan(s);

        Assert.True(plan.Id > 0);
        Assert.Equal("Morning plan", plan.Title);
        Assert.Equal(120, plan.EstimatedDurationMinutes);
        Assert.Equal(Start, plan.StartDateTime);
        Assert.Equal(Start.AddHours(3), plan.EndDateTime);
        Assert.Equal(PlanStatus.NotStarted, plan.Status);
        Assert.Equal(T0.UtcDateTime, plan.CreatedAt);
        Assert.Equal((3, 0, 0), (plan.TotalItems, plan.DoneItems, plan.ProgressPercent));
        Assert.Equal(
            [
                (PlanItemSourceType.Task, s.TaskId, "Write report"),
                (PlanItemSourceType.Habit, s.HabitId, "Drink water"),
                (PlanItemSourceType.LearningResource, s.CardId, "Clean Code"),
            ],
            plan.Items.Select(i => (i.SourceType, i.SourceId, i.SourceTitle!)));
        Assert.All(plan.Items, i => Assert.True(i.SourceAvailable));
        Assert.All(plan.Items, i => Assert.False(i.IsDone));

        Assert.Equivalent(plan, await _service.GetAsync(plan.Id));
    }

    [Fact]
    public async Task Non_existent_source_is_invalid_and_names_the_item()
    {
        var s = await CreateSources();

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            _service.CreateAsync(Request(("Task", s.TaskId), ("Task", 999), ("Habit", 998), ("LearningResource", 997))));

        Assert.Equal(["Task with id '999' does not exist or has been deleted."], ex.Errors["items[1].sourceId"]);
        Assert.Equal(["Habit with id '998' does not exist or has been deleted."], ex.Errors["items[2].sourceId"]);
        Assert.Equal(["Learning resource with id '997' does not exist or has been deleted."], ex.Errors["items[3].sourceId"]);
        Assert.Equal(3, ex.Errors.Count);
        Assert.Empty(await _service.ListAsync());
    }

    [Fact]
    public async Task Deleted_source_cannot_be_added_but_archived_task_and_inactive_habit_can()
    {
        var s = await CreateSources();
        await _learning.DeleteAsync(s.CardId);
        await _tasks.ArchiveAsync(s.TaskId);
        await _habits.DeactivateAsync(s.HabitId, Today);
        NewScope();

        var ex = await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(Request(("LearningResource", s.CardId))));
        Assert.True(ex.Errors.ContainsKey("items[0].sourceId"));

        var plan = await _service.CreateAsync(Request(("Task", s.TaskId), ("Habit", s.HabitId)));
        Assert.Equal(2, plan.TotalItems);
    }

    [Fact]
    public async Task Duplicate_item_and_empty_items_are_invalid()
    {
        var s = await CreateSources();

        var dup = await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(Request(("Task", s.TaskId), ("Task", s.TaskId))));
        Assert.True(dup.Errors.ContainsKey("items[1]"));

        var empty = await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(Request()));
        Assert.True(empty.Errors.ContainsKey("items"));

        Assert.Empty(await _service.ListAsync());
    }

    [Fact]
    public async Task Metadata_and_source_errors_are_reported_together()
    {
        var request = Request(("Task", 999));
        request.EndDateTime = Start.AddHours(-1);
        request.EstimatedDurationMinutes = 0;
        request.PriorityOrder = 0;

        var ex = await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(request));

        Assert.Equal(["endDateTime", "estimatedDurationMinutes", "items[0].sourceId", "priorityOrder"], ex.Errors.Keys.Order());
    }

    [Fact]
    public async Task Task_item_done_completes_the_task_via_M02_and_progress_rises()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);
        _clock.UtcNow = T0.AddMinutes(30);

        var updated = await SetDone(plan, PlanItemSourceType.Task, true);

        Assert.Equal((3, 1, 33), (updated.TotalItems, updated.DoneItems, updated.ProgressPercent));
        Assert.True(updated.Items.Single(i => i.SourceType == PlanItemSourceType.Task).IsDone);
        var task = await _tasks.GetAsync(s.TaskId);
        Assert.Equal(TaskItemStatus.Done, task.Status);
        Assert.Equal(T0.AddMinutes(30).UtcDateTime, task.CompletedAt);
    }

    [Fact]
    public async Task Task_item_undone_leaves_the_task_done()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);
        await SetDone(plan, PlanItemSourceType.Task, true);
        var completedAt = (await _tasks.GetAsync(s.TaskId)).CompletedAt;
        NewScope();

        var updated = await SetDone(plan, PlanItemSourceType.Task, false);

        Assert.Equal(0, updated.ProgressPercent);
        Assert.False(updated.Items.Single(i => i.SourceType == PlanItemSourceType.Task).IsDone);
        var task = await _tasks.GetAsync(s.TaskId);
        Assert.Equal(TaskItemStatus.Done, task.Status);
        Assert.Equal(completedAt, task.CompletedAt);
    }

    [Fact]
    public async Task Habit_item_done_creates_no_habit_completion()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);

        var updated = await SetDone(plan, PlanItemSourceType.Habit, true);

        Assert.Equal(33, updated.ProgressPercent);
        Assert.Empty(await _db.Set<HabitCompletion>().ToListAsync());
        Assert.False((await _habits.GetAsync(s.HabitId, Today)).CompletedToday);
        Assert.Equal(TaskItemStatus.Todo, (await _tasks.GetAsync(s.TaskId)).Status);
    }

    [Fact]
    public async Task Learning_item_done_leaves_the_card_unchanged()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);
        var before = await _learning.GetAsync(s.CardId);
        _clock.UtcNow = T0.AddMinutes(10);

        var updated = await SetDone(plan, PlanItemSourceType.LearningResource, true);

        Assert.Equal(33, updated.ProgressPercent);
        Assert.Equivalent(before, await _learning.GetAsync(s.CardId));
    }

    [Fact]
    public async Task Progress_goes_0_33_67_33()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);

        Assert.Equal(0, plan.ProgressPercent);
        Assert.Equal(33, (await SetDone(plan, PlanItemSourceType.Task, true)).ProgressPercent);
        Assert.Equal(67, (await SetDone(plan, PlanItemSourceType.Habit, true)).ProgressPercent);
        Assert.Equal(33, (await SetDone(plan, PlanItemSourceType.Task, false)).ProgressPercent);
        Assert.Equal(67, (await SetDone(plan, PlanItemSourceType.Task, true)).ProgressPercent);
        Assert.Equal(100, (await SetDone(plan, PlanItemSourceType.LearningResource, true)).ProgressPercent);
    }

    [Fact]
    public async Task Source_deleted_later_is_unavailable_with_title_and_still_counts()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);
        await SetDone(plan, PlanItemSourceType.LearningResource, true);
        await _learning.DeleteAsync(s.CardId);
        await _habits.DeleteAsync(s.HabitId);
        NewScope();

        var reloaded = await _service.GetAsync(plan.Id);

        var card = reloaded.Items.Single(i => i.SourceType == PlanItemSourceType.LearningResource);
        Assert.False(card.SourceAvailable);
        Assert.Equal("Clean Code", card.SourceTitle);
        Assert.True(card.IsDone);
        var habit = reloaded.Items.Single(i => i.SourceType == PlanItemSourceType.Habit);
        Assert.False(habit.SourceAvailable);
        Assert.Equal("Drink water", habit.SourceTitle);
        Assert.True(reloaded.Items.Single(i => i.SourceType == PlanItemSourceType.Task).SourceAvailable);
        Assert.Equal((3, 1, 33), (reloaded.TotalItems, reloaded.DoneItems, reloaded.ProgressPercent));
        Assert.Equivalent(reloaded, (await _service.ListAsync()).Single());
    }

    [Fact]
    public async Task Task_item_of_deleted_task_can_be_marked_done_without_touching_the_task()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);
        await _tasks.DeleteAsync(s.TaskId);
        NewScope();

        var updated = await SetDone(plan, PlanItemSourceType.Task, true);

        var item = updated.Items.Single(i => i.SourceType == PlanItemSourceType.Task);
        Assert.True(item.IsDone);
        Assert.False(item.SourceAvailable);
        Assert.Equal("Write report", item.SourceTitle);
        var task = await _db.Set<TaskItem>().IgnoreQueryFilters().SingleAsync(t => t.Id == s.TaskId);
        Assert.Equal(TaskItemStatus.Todo, task.Status);
    }

    [Fact]
    public async Task List_is_ordered_by_priority_then_start()
    {
        var s = await CreateSources();
        async Task Create(string title, int priority, int startHour)
        {
            var request = Request(("Task", s.TaskId));
            request.Title = title;
            request.PriorityOrder = priority;
            request.StartDateTime = Start.AddHours(startHour);
            request.EndDateTime = Start.AddHours(startHour + 1);
            await _service.CreateAsync(request);
            NewScope();
        }

        await Create("p2-early", 2, 0);
        await Create("p1-late", 1, 5);
        await Create("p1-early", 1, 1);
        await Create("p3", 3, 0);

        Assert.Equal(["p1-early", "p1-late", "p2-early", "p3"], (await _service.ListAsync()).Select(p => p.Title));
    }

    [Fact]
    public async Task Update_changes_metadata_only()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);
        await SetDone(plan, PlanItemSourceType.Task, true);
        _clock.UtcNow = T0.AddMinutes(5);

        var updated = await _service.UpdateAsync(plan.Id, new UpdatePlanRequest
        {
            Title = " Evening plan ",
            EstimatedDurationMinutes = 45,
            StartDateTime = Start.AddHours(8),
            EndDateTime = Start.AddHours(10),
            PriorityOrder = 3,
        });

        Assert.Equal("Evening plan", updated.Title);
        Assert.Equal(45, updated.EstimatedDurationMinutes);
        Assert.Equal(Start.AddHours(8), updated.StartDateTime);
        Assert.Equal(Start.AddHours(10), updated.EndDateTime);
        Assert.Equal(3, updated.PriorityOrder);
        Assert.Equal(T0.UtcDateTime, updated.CreatedAt);
        Assert.Equal(T0.AddMinutes(5).UtcDateTime, updated.UpdatedAt);
        Assert.Equal(plan.Items.Select(i => i.Id), updated.Items.Select(i => i.Id));
        Assert.Equal(33, updated.ProgressPercent);
    }

    [Fact]
    public async Task Update_with_end_before_start_is_invalid_and_changes_nothing()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => _service.UpdateAsync(plan.Id, new UpdatePlanRequest
        {
            Title = "x",
            EstimatedDurationMinutes = 10,
            StartDateTime = Start,
            EndDateTime = Start.AddMinutes(-1),
            PriorityOrder = 1,
        }));
        NewScope();

        Assert.True(ex.Errors.ContainsKey("endDateTime"));
        Assert.Equal("Morning plan", (await _service.GetAsync(plan.Id)).Title);
    }

    [Fact]
    public async Task Delete_hides_the_plan_and_its_items_but_keeps_rows()
    {
        var s = await CreateSources();
        var plan = await CreateThreeItemPlan(s);
        var itemId = plan.Items[0].Id;

        await _service.DeleteAsync(plan.Id);
        NewScope();

        await Assert.ThrowsAsync<NotFoundException>(() => _service.GetAsync(plan.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.DeleteAsync(plan.Id));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            _service.SetItemDoneAsync(plan.Id, itemId, new UpdatePlanItemRequest { IsDone = true }));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.UpdateAsync(plan.Id, new UpdatePlanRequest()));
        Assert.Empty(await _service.ListAsync());
        Assert.Empty(await _db.Set<PlanItem>().ToListAsync());

        Assert.Equal(3, await _db.Set<PlanItem>().IgnoreQueryFilters().CountAsync());
        Assert.True((await _db.Set<Plan>().IgnoreQueryFilters().SingleAsync()).IsDeleted);
        Assert.Equal(TaskItemStatus.Todo, (await _tasks.GetAsync(s.TaskId)).Status);
    }

    [Fact]
    public async Task Item_of_another_plan_or_missing_isDone_is_rejected()
    {
        var s = await CreateSources();
        var first = await CreateThreeItemPlan(s);
        var second = await _service.CreateAsync(Request(("Habit", s.HabitId)));
        NewScope();

        var notFound = await Assert.ThrowsAsync<NotFoundException>(() =>
            _service.SetItemDoneAsync(second.Id, first.Items[0].Id, new UpdatePlanItemRequest { IsDone = true }));
        Assert.Equal($"Plan item with id '{first.Items[0].Id}' was not found on plan '{second.Id}'.", notFound.Message);

        var invalid = await Assert.ThrowsAsync<ValidationException>(() =>
            _service.SetItemDoneAsync(first.Id, first.Items[0].Id, new UpdatePlanItemRequest()));
        Assert.True(invalid.Errors.ContainsKey("isDone"));

        Assert.Equal(TaskItemStatus.Todo, (await _tasks.GetAsync(s.TaskId)).Status);
        Assert.Equal(0, (await _service.GetAsync(first.Id)).ProgressPercent);
    }
}
