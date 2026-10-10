using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Habits;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Infrastructure.Persistence.Conventions;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Habits;

/// <summary>TR-1: habit service against the real AppDbContext conventions (in-memory provider). 2026-10-10 is a Saturday.</summary>
public class HabitServiceTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 10, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 10);

    private readonly FixedTimeProvider _clock = new(T0);
    private readonly TestDbContext _db;
    private readonly HabitService _service;

    public HabitServiceTests()
    {
        _db = TestDbContext.CreateInMemory(_clock);
        _service = new HabitService(_db, _clock);
    }

    private async Task<HabitResponse> Create(string name, string frequency = "Daily")
    {
        var habit = await _service.CreateAsync(new CreateHabitRequest { Name = name, Frequency = frequency }, Today);
        _clock.UtcNow = _clock.UtcNow.AddMinutes(1); // distinct CreatedAt values
        return habit;
    }

    /// <summary>Simulates a new request scope (nothing tracked).</summary>
    private void NewScope() => _db.ChangeTracker.Clear();

    [Fact]
    public async Task Create_trims_name_defaults_to_active_and_has_empty_progress()
    {
        var habit = await _service.CreateAsync(new CreateHabitRequest { Name = "  Read ", Description = "  ", Frequency = "weekly" }, Today);

        Assert.True(habit.Id > 0);
        Assert.Equal("Read", habit.Name);
        Assert.Null(habit.Description);
        Assert.Equal(HabitFrequency.Weekly, habit.Frequency);
        Assert.True(habit.IsActive);
        Assert.Equal(T0.UtcDateTime, habit.CreatedAt);
        Assert.False(habit.CompletedToday);
        Assert.False(habit.CompletedForCurrentPeriod);
        Assert.Equal(0, habit.CurrentStreak);
        Assert.Null(habit.LastCompletionDate);
    }

    [Fact]
    public async Task Create_with_invalid_input_throws_validation_and_saves_nothing()
    {
        await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(new CreateHabitRequest { Name = " ", Frequency = "Daily" }, Today));
        await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(new CreateHabitRequest { Name = "n", Frequency = "Monthly" }, Today));
        Assert.Empty(await _service.ListAsync(null, Today));
    }

    [Fact]
    public async Task Complete_today_updates_progress()
    {
        var habit = await Create("Run");

        var completion = await _service.AddCompletionAsync(habit.Id, null, Today);

        Assert.Equal(Today, completion.Date);
        Assert.Equal(habit.Id, completion.HabitId);
        var reloaded = await _service.GetAsync(habit.Id, Today);
        Assert.True(reloaded.CompletedToday);
        Assert.True(reloaded.CompletedForCurrentPeriod);
        Assert.Equal(1, reloaded.CurrentStreak);
        Assert.Equal(Today, reloaded.LastCompletionDate);
    }

    [Fact]
    public async Task Duplicate_completion_is_a_conflict()
    {
        var habit = await Create("Run");
        await _service.AddCompletionAsync(habit.Id, Today.AddDays(-1), Today);

        NewScope();
        await Assert.ThrowsAsync<ConflictException>(() => _service.AddCompletionAsync(habit.Id, Today.AddDays(-1), Today));
        Assert.Single(await _service.ListCompletionsAsync(habit.Id, null, null));
    }

    [Fact]
    public async Task Future_completion_is_invalid()
    {
        var habit = await Create("Run");
        var ex = await Assert.ThrowsAsync<ValidationException>(() => _service.AddCompletionAsync(habit.Id, Today.AddDays(1), Today));
        Assert.True(ex.Errors.ContainsKey("date"));
    }

    [Fact]
    public async Task Inactive_habit_completion_is_invalid_until_reactivated()
    {
        var habit = await Create("Run");

        var deactivated = await _service.DeactivateAsync(habit.Id, Today);
        Assert.False(deactivated.IsActive);
        var ex = await Assert.ThrowsAsync<ValidationException>(() => _service.AddCompletionAsync(habit.Id, null, Today));
        Assert.True(ex.Errors.ContainsKey("habit"));

        var activated = await _service.ActivateAsync(habit.Id, Today);
        Assert.True(activated.IsActive);
        await _service.AddCompletionAsync(habit.Id, null, Today);
    }

    [Fact]
    public async Task Remove_completion_then_complete_again()
    {
        var habit = await Create("Run");
        await _service.AddCompletionAsync(habit.Id, null, Today);

        NewScope();
        await _service.RemoveCompletionAsync(habit.Id, Today);
        Assert.False((await _service.GetAsync(habit.Id, Today)).CompletedToday);

        NewScope();
        await _service.AddCompletionAsync(habit.Id, null, Today);
        Assert.True((await _service.GetAsync(habit.Id, Today)).CompletedToday);
    }

    [Fact]
    public async Task Remove_missing_completion_or_habit_is_not_found()
    {
        var habit = await Create("Run");
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveCompletionAsync(habit.Id, Today));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveCompletionAsync(999, Today));
    }

    [Fact]
    public async Task Weekly_habit_shows_done_this_week_and_streak()
    {
        var habit = await Create("Review", "Weekly");
        await _service.AddCompletionAsync(habit.Id, new DateOnly(2026, 10, 4), Today); // Sunday, previous ISO week
        await _service.AddCompletionAsync(habit.Id, new DateOnly(2026, 10, 6), Today); // Tuesday, current week

        var progress = await _service.GetAsync(habit.Id, Today);

        Assert.False(progress.CompletedToday);
        Assert.True(progress.CompletedForCurrentPeriod);
        Assert.Equal(2, progress.CurrentStreak);
        Assert.Equal(new DateOnly(2026, 10, 6), progress.LastCompletionDate);
    }

    [Fact]
    public async Task List_filters_by_active_and_computes_progress_per_habit()
    {
        var a = await Create("A");
        var b = await Create("B");
        await _service.AddCompletionAsync(a.Id, Today.AddDays(-1), Today);
        await _service.AddCompletionAsync(a.Id, Today, Today);
        await _service.DeactivateAsync(b.Id, Today);

        var all = await _service.ListAsync(null, Today);
        Assert.Equal(["A", "B"], all.Select(h => h.Name));
        Assert.Equal(2, all[0].CurrentStreak);
        Assert.Equal(0, all[1].CurrentStreak);

        Assert.Equal(["A"], (await _service.ListAsync(true, Today)).Select(h => h.Name));
        Assert.Equal(["B"], (await _service.ListAsync(false, Today)).Select(h => h.Name));

        // An earlier "today" ignores later completions.
        var yesterday = (await _service.ListAsync(true, Today.AddDays(-1))).Single();
        Assert.True(yesterday.CompletedToday);
        Assert.Equal(1, yesterday.CurrentStreak);
    }

    [Fact]
    public async Task Update_replaces_fields_and_keeps_active_state()
    {
        var habit = await Create("Run");
        await _service.DeactivateAsync(habit.Id, Today);
        _clock.UtcNow = T0.AddHours(2);

        var updated = await _service.UpdateAsync(habit.Id, new UpdateHabitRequest { Name = " Walk ", Description = "daily walk", Frequency = "Weekly" }, Today);

        Assert.Equal("Walk", updated.Name);
        Assert.Equal("daily walk", updated.Description);
        Assert.Equal(HabitFrequency.Weekly, updated.Frequency);
        Assert.False(updated.IsActive);
        Assert.Equal(T0.AddHours(2).UtcDateTime, updated.UpdatedAt);
        await Assert.ThrowsAsync<ValidationException>(() => _service.UpdateAsync(habit.Id, new UpdateHabitRequest { Name = "x" }, Today));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.UpdateAsync(999, new UpdateHabitRequest { Name = "x", Frequency = "Daily" }, Today));
    }

    [Fact]
    public async Task Deleted_habit_is_not_found_and_its_completions_are_hidden()
    {
        var habit = await Create("Run");
        await _service.AddCompletionAsync(habit.Id, null, Today);

        NewScope();
        await _service.DeleteAsync(habit.Id);

        NewScope();
        await Assert.ThrowsAsync<NotFoundException>(() => _service.GetAsync(habit.Id, Today));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.ListCompletionsAsync(habit.Id, null, null));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.AddCompletionAsync(habit.Id, null, Today));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.DeleteAsync(habit.Id));
        Assert.Empty(await _service.ListAsync(null, Today));
        Assert.Empty(_db.HabitCompletions.ToList()); // query filter hides completions of the deleted habit

        // Row is kept (soft delete) and the completion still exists in storage.
        var stored = _db.Habits.IgnoreQueryFilters([SoftDeleteModelBuilderExtensions.SoftDeleteFilter]).Single();
        Assert.True(stored.IsDeleted);
        Assert.Single(_db.HabitCompletions.IgnoreQueryFilters([SoftDeleteModelBuilderExtensions.SoftDeleteFilter]));
    }

    [Fact]
    public async Task Completions_are_listed_by_date_within_the_range()
    {
        var habit = await Create("Run");
        foreach (var offset in new[] { 0, -3, -1, -2 })
        {
            await _service.AddCompletionAsync(habit.Id, Today.AddDays(offset), Today);
        }

        var all = await _service.ListCompletionsAsync(habit.Id, null, null);
        Assert.Equal([Today.AddDays(-3), Today.AddDays(-2), Today.AddDays(-1), Today], all.Select(c => c.Date));

        var range = await _service.ListCompletionsAsync(habit.Id, Today.AddDays(-2), Today.AddDays(-1));
        Assert.Equal([Today.AddDays(-2), Today.AddDays(-1)], range.Select(c => c.Date));

        await Assert.ThrowsAsync<ValidationException>(() => _service.ListCompletionsAsync(habit.Id, Today, Today.AddDays(-1)));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.ListCompletionsAsync(999, null, null));
    }

    [Fact]
    public async Task Exists_and_names_cover_active_and_inactive_but_not_deleted_habits()
    {
        var a = await Create("A");
        var b = await Create("B");
        var c = await Create("C");
        await _service.DeactivateAsync(b.Id, Today);
        await _service.DeleteAsync(c.Id);

        Assert.True(await _service.ExistsAsync(a.Id));
        Assert.True(await _service.ExistsAsync(b.Id));
        Assert.False(await _service.ExistsAsync(c.Id));
        Assert.False(await _service.ExistsAsync(999));

        var names = await _service.GetNamesAsync([a.Id, b.Id, c.Id, 999]);
        Assert.Equal(new Dictionary<int, string> { [a.Id] = "A", [b.Id] = "B" }, names);
        Assert.Empty(await _service.GetNamesAsync([]));
    }

    [Fact]
    public async Task Names_including_deleted_resolve_soft_deleted_habits_for_M06()
    {
        var a = await Create("A");
        var b = await Create("B");
        await _service.DeleteAsync(b.Id);
        NewScope();

        var withDeleted = await _service.GetNamesAsync([a.Id, b.Id, 999], includeDeleted: true);
        Assert.Equal(new Dictionary<int, string> { [a.Id] = "A", [b.Id] = "B" }, withDeleted);
        Assert.Equal(new Dictionary<int, string> { [a.Id] = "A" }, await _service.GetNamesAsync([a.Id, b.Id]));
        Assert.Empty(await _service.GetNamesAsync([], includeDeleted: true));
    }
}
