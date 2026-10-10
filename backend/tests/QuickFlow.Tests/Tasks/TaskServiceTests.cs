using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Tasks;
using QuickFlow.Application.Features.Tasks;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Tasks;

/// <summary>TR-1: task service against the real AppDbContext conventions (in-memory provider).</summary>
public class TaskServiceTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 10, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 10);

    private readonly FixedTimeProvider _clock = new(T0);
    private readonly TestDbContext _db;
    private readonly TaskService _service;

    public TaskServiceTests()
    {
        _db = TestDbContext.CreateInMemory(_clock);
        _service = new TaskService(_db, _clock);
    }

    private async Task<TaskItem> Create(string title, string? status = null, string? priority = null, DateOnly? due = null)
    {
        var task = await _service.CreateAsync(new CreateTaskRequest { Title = title, Status = status, Priority = priority, DueDate = due });
        _clock.UtcNow = _clock.UtcNow.AddMinutes(1); // distinct CreatedAt values
        return task;
    }

    private async Task<List<string>> Titles(TaskListQuery query, DateOnly? today = null) =>
        (await _service.ListAsync(query, today ?? Today)).Select(t => t.Title).ToList();

    [Fact]
    public async Task Create_applies_defaults_and_audit_timestamps()
    {
        var task = await _service.CreateAsync(new CreateTaskRequest { Title = "  Write report " });

        Assert.True(task.Id > 0);
        Assert.Equal("Write report", task.Title);
        Assert.Equal(TaskItemStatus.Todo, task.Status);
        Assert.Equal(TaskPriority.Medium, task.Priority);
        Assert.False(task.IsArchived);
        Assert.Null(task.CompletedAt);
        Assert.Equal(T0.UtcDateTime, task.CreatedAt);
    }

    [Fact]
    public async Task Create_with_status_Done_sets_CompletedAt()
    {
        var task = await _service.CreateAsync(new CreateTaskRequest { Title = "t", Status = "Done" });
        Assert.Equal(T0.UtcDateTime, task.CompletedAt);
    }

    [Fact]
    public async Task Create_with_invalid_input_throws_validation_and_saves_nothing()
    {
        await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(new CreateTaskRequest { Title = " " }));
        Assert.Empty(await Titles(new TaskListQuery()));
    }

    [Fact]
    public async Task Complete_sets_Done_and_CompletedAt()
    {
        var task = await Create("t");
        _clock.UtcNow = T0.AddHours(3);

        var completed = await _service.CompleteAsync(task.Id);

        Assert.Equal(TaskItemStatus.Done, completed.Status);
        Assert.Equal(T0.AddHours(3).UtcDateTime, completed.CompletedAt);
        Assert.Equal(T0.AddHours(3).UtcDateTime, completed.UpdatedAt);
    }

    [Fact]
    public async Task Update_moving_status_away_from_Done_clears_CompletedAt()
    {
        var task = await Create("t");
        await _service.CompleteAsync(task.Id);

        var updated = await _service.UpdateAsync(task.Id, new UpdateTaskRequest { Title = "t2", Status = "InProgress", Priority = "High" });

        Assert.Equal(TaskItemStatus.InProgress, updated.Status);
        Assert.Null(updated.CompletedAt);
        Assert.Equal("t2", updated.Title);
        Assert.Equal(TaskPriority.High, updated.Priority);
    }

    [Fact]
    public async Task Update_changes_values_and_UpdatedAt()
    {
        var task = await Create("t", due: Today);
        var createdAt = task.CreatedAt;
        _clock.UtcNow = T0.AddHours(5);

        var updated = await _service.UpdateAsync(task.Id, new UpdateTaskRequest
        {
            Title = "new", Description = "desc", Status = "Todo", Priority = "Low", DueDate = null,
        });

        Assert.Equal("new", updated.Title);
        Assert.Equal("desc", updated.Description);
        Assert.Equal(TaskPriority.Low, updated.Priority);
        Assert.Null(updated.DueDate);
        Assert.Equal(createdAt, updated.CreatedAt);
        Assert.Equal(T0.AddHours(5).UtcDateTime, updated.UpdatedAt);
    }

    [Fact]
    public async Task Archived_tasks_are_excluded_by_default_and_returned_with_archived_true()
    {
        await Create("active");
        var archived = await Create("archived");
        await _service.ArchiveAsync(archived.Id);

        Assert.Equal(["active"], await Titles(new TaskListQuery()));
        Assert.Equal(["active"], await Titles(new TaskListQuery { Archived = false }));
        Assert.Equal(["archived"], await Titles(new TaskListQuery { Archived = true }));
    }

    [Fact]
    public async Task Restore_returns_task_to_default_list()
    {
        var task = await Create("t");
        await _service.ArchiveAsync(task.Id);
        var restored = await _service.RestoreAsync(task.Id);

        Assert.False(restored.IsArchived);
        Assert.Equal(["t"], await Titles(new TaskListQuery()));
        Assert.Empty(await Titles(new TaskListQuery { Archived = true }));
    }

    [Fact]
    public async Task Deleted_task_is_not_found_and_absent_from_all_lists()
    {
        var task = await Create("gone");
        var archivedThenDeleted = await Create("gone-archived");
        await _service.ArchiveAsync(archivedThenDeleted.Id);

        await _service.DeleteAsync(task.Id);
        await _service.DeleteAsync(archivedThenDeleted.Id);

        await Assert.ThrowsAsync<NotFoundException>(() => _service.GetAsync(task.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.CompleteAsync(task.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.UpdateAsync(task.Id, new UpdateTaskRequest { Title = "x", Status = "Todo", Priority = "Low" }));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.ArchiveAsync(task.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RestoreAsync(archivedThenDeleted.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.DeleteAsync(task.Id));
        Assert.Empty(await Titles(new TaskListQuery()));
        Assert.Empty(await Titles(new TaskListQuery { Archived = true }));
    }

    [Fact]
    public async Task Unknown_id_throws_not_found()
    {
        var ex = await Assert.ThrowsAsync<NotFoundException>(() => _service.GetAsync(999));
        Assert.Equal("Task with id '999' was not found.", ex.Message);
    }

    [Fact]
    public async Task Overdue_filter_uses_today_and_excludes_done_archived_due_today_and_undated()
    {
        await Create("past", due: Today.AddDays(-1));
        await Create("past-inprogress", status: "InProgress", due: Today.AddDays(-3));
        await Create("past-done", status: "Done", due: Today.AddDays(-1));
        var archived = await Create("past-archived", due: Today.AddDays(-1));
        await _service.ArchiveAsync(archived.Id);
        await Create("today", due: Today);
        await Create("future", due: Today.AddDays(1));
        await Create("undated");

        var overdue = await Titles(new TaskListQuery { Overdue = true });
        Assert.Equal(["past", "past-inprogress"], overdue.Order());

        // A different "today" changes the result.
        Assert.Equal(["future", "past", "past-inprogress", "today"],
            (await Titles(new TaskListQuery { Overdue = true }, Today.AddDays(2))).Order());

        // Overdue flag on the response matches the filter.
        var flagged = (await _service.ListAsync(new TaskListQuery(), Today))
            .Where(t => TaskResponse.From(t, Today).IsOverdue).Select(t => t.Title).Order();
        Assert.Equal(["past", "past-inprogress"], flagged);
    }

    [Fact]
    public async Task Search_matches_title_substring_case_insensitively()
    {
        await Create("Buy Milk");
        await Create("Call the plumber");
        await Create("milkshake recipe");

        Assert.Equal(["Buy Milk", "milkshake recipe"], (await Titles(new TaskListQuery { Search = "  MILK " })).Order());
        Assert.Equal(["Call the plumber"], await Titles(new TaskListQuery { Search = "plumb" }));
        Assert.Empty(await Titles(new TaskListQuery { Search = "nothing" }));
    }

    [Fact]
    public async Task Status_and_priority_filters()
    {
        await Create("todo-low", priority: "Low");
        await Create("progress-high", status: "InProgress", priority: "High");
        await Create("done-high", status: "Done", priority: "High");

        Assert.Equal(["progress-high"], await Titles(new TaskListQuery { Status = "InProgress" }));
        Assert.Equal(["done-high", "progress-high"], (await Titles(new TaskListQuery { Priority = "high" })).Order());
        Assert.Equal(["done-high"], await Titles(new TaskListQuery { Status = "Done", Priority = "High" }));
    }

    [Fact]
    public async Task Due_date_range_filter_is_inclusive_and_excludes_undated()
    {
        await Create("d9", due: new DateOnly(2026, 10, 9));
        await Create("d10", due: new DateOnly(2026, 10, 10));
        await Create("d12", due: new DateOnly(2026, 10, 12));
        await Create("d13", due: new DateOnly(2026, 10, 13));
        await Create("undated");

        Assert.Equal(["d10", "d12"], (await Titles(new TaskListQuery { DueFrom = new DateOnly(2026, 10, 10), DueTo = new DateOnly(2026, 10, 12) })).Order());
        Assert.Equal(["d12", "d13"], (await Titles(new TaskListQuery { DueFrom = new DateOnly(2026, 10, 11) })).Order());
        Assert.Equal(["d9"], await Titles(new TaskListQuery { DueTo = new DateOnly(2026, 10, 9) }));
    }

    [Fact]
    public async Task Default_sort_is_createdAt_desc_and_asc_is_supported()
    {
        await Create("first");
        await Create("second");
        await Create("third");

        Assert.Equal(["third", "second", "first"], await Titles(new TaskListQuery()));
        Assert.Equal(["first", "second", "third"], await Titles(new TaskListQuery { SortBy = "createdAt", SortDir = "asc" }));
    }

    [Fact]
    public async Task Sort_by_dueDate_puts_null_due_dates_last_in_both_directions()
    {
        await Create("undated");
        await Create("d12", due: new DateOnly(2026, 10, 12));
        await Create("d9", due: new DateOnly(2026, 10, 9));
        await Create("d10", due: new DateOnly(2026, 10, 10));

        Assert.Equal(["d9", "d10", "d12", "undated"], await Titles(new TaskListQuery { SortBy = "dueDate", SortDir = "asc" }));
        Assert.Equal(["d12", "d10", "d9", "undated"], await Titles(new TaskListQuery { SortBy = "dueDate", SortDir = "desc" }));
    }

    [Fact]
    public async Task Invalid_filter_value_throws_validation()
    {
        var ex = await Assert.ThrowsAsync<ValidationException>(() => _service.ListAsync(new TaskListQuery { SortBy = "title" }, Today));
        Assert.True(ex.Errors.ContainsKey("sortBy"));
    }

    [Fact]
    public async Task Titles_for_other_modules_cover_archived_and_optionally_deleted_tasks()
    {
        var a = await Create("Alpha");
        var b = await Create("Beta");
        var c = await Create("Gamma");
        await _service.ArchiveAsync(b.Id);
        await _service.DeleteAsync(c.Id);
        _db.ChangeTracker.Clear();

        var titles = await _service.GetTitlesAsync([a.Id, b.Id, c.Id, 999]);
        Assert.Equal(new Dictionary<int, string> { [a.Id] = "Alpha", [b.Id] = "Beta" }, titles);

        var withDeleted = await _service.GetTitlesAsync([a.Id, b.Id, c.Id, 999], includeDeleted: true);
        Assert.Equal(new Dictionary<int, string> { [a.Id] = "Alpha", [b.Id] = "Beta", [c.Id] = "Gamma" }, withDeleted);

        Assert.Empty(await _service.GetTitlesAsync([]));
    }
}
