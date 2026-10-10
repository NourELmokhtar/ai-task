using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Settings;
using QuickFlow.Application.Features.Settings;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Settings;

/// <summary>Settings service against the real AppDbContext conventions (in-memory provider).</summary>
public class SettingsServiceTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 10, 8, 0, 0, TimeSpan.Zero);

    private readonly FixedTimeProvider _clock = new(T0);
    private readonly string _databaseName = Guid.NewGuid().ToString();
    private readonly TestDbContext _db;
    private readonly SettingsService _service;

    public SettingsServiceTests()
    {
        _db = NewContext();
        _service = new SettingsService(_db);
    }

    private TestDbContext NewContext() => TestDbContext.CreateInMemory(_clock, _databaseName);

    private static UpdateSettingsRequest Request(string? displayName, bool notifications, string defaultView) =>
        new() { DisplayName = displayName, PlanStartNotificationsEnabled = notifications, DefaultView = defaultView };

    [Fact]
    public async Task First_read_returns_defaults_and_creates_the_row()
    {
        var settings = await _service.GetAsync();

        Assert.Null(settings.DisplayName);
        Assert.True(settings.PlanStartNotificationsEnabled);
        Assert.Equal(DefaultView.Dashboard, settings.DefaultView);
        Assert.Equal(T0.UtcDateTime, settings.UpdatedAt);

        await using var other = NewContext();
        var row = Assert.Single(await other.Set<UserSettings>().ToListAsync());
        Assert.Equal(UserSettings.SingletonId, row.Id);
    }

    [Fact]
    public async Task Get_or_create_is_idempotent()
    {
        var first = await _service.GetAsync();
        _clock.UtcNow = T0.AddMinutes(5);

        // Repeated reads, in the same scope and in new scopes, keep the one row and do not touch it.
        var second = await _service.GetAsync();
        await using var otherContext = NewContext();
        var third = await new SettingsService(otherContext).GetAsync();

        Assert.Equal(first, second);
        Assert.Equal(first, third);
        await using var check = NewContext();
        Assert.Equal(1, await check.Set<UserSettings>().CountAsync());
    }

    [Fact]
    public async Task Concurrent_first_reads_create_a_single_row()
    {
        var contexts = Enumerable.Range(0, 8).Select(_ => NewContext()).ToList();

        var results = await Task.WhenAll(contexts.Select(c => Task.Run(() => new SettingsService(new RacingContext(c)).GetAsync())));

        Assert.All(results, r => Assert.Equal(DefaultView.Dashboard, r.DefaultView));
        await using var check = NewContext();
        Assert.Equal(1, await check.Set<UserSettings>().CountAsync());
        foreach (var c in contexts) await c.DisposeAsync();
    }

    [Fact]
    public async Task Losing_the_first_insert_race_returns_the_saved_row_instead_of_failing()
    {
        // Another request saves the row (with a name) after this request found no row and before it saves its own.
        var racing = new RacingContext(_db, async () =>
        {
            await using var winner = NewContext();
            winner.Set<UserSettings>().Add(new UserSettings { Id = UserSettings.SingletonId, DisplayName = "Winner" });
            await winner.SaveChangesAsync();
        });

        var settings = await new SettingsService(racing).GetAsync();

        Assert.Equal("Winner", settings.DisplayName);
        await using var check = NewContext();
        Assert.Equal(1, await check.Set<UserSettings>().CountAsync());
    }

    [Fact]
    public async Task Update_persists_all_fields()
    {
        await _service.GetAsync();
        _clock.UtcNow = T0.AddMinutes(10);

        var updated = await _service.UpdateAsync(Request("  Nour  ", notifications: false, defaultView: "TodoPlans"));

        Assert.Equal("Nour", updated.DisplayName);
        Assert.False(updated.PlanStartNotificationsEnabled);
        Assert.Equal(DefaultView.TodoPlans, updated.DefaultView);
        Assert.Equal(T0.AddMinutes(10).UtcDateTime, updated.UpdatedAt);

        await using var other = NewContext();
        var reread = await new SettingsService(other).GetAsync();
        Assert.Equal(updated, reread);
    }

    [Fact]
    public async Task Update_with_identical_values_keeps_UpdatedAt()
    {
        var first = await _service.UpdateAsync(Request("Nour", notifications: true, defaultView: "Tasks"));
        _clock.UtcNow = T0.AddMinutes(10);
        _db.ChangeTracker.Clear(); // new request scope

        var second = await _service.UpdateAsync(Request(" Nour ", notifications: true, defaultView: "tasks"));

        Assert.Equal(first.UpdatedAt, second.UpdatedAt);
    }

    [Fact]
    public async Task Update_before_any_read_creates_the_row_with_the_given_values()
    {
        var updated = await _service.UpdateAsync(Request(null, notifications: false, defaultView: "Habits"));

        Assert.Equal(DefaultView.Habits, updated.DefaultView);
        await using var other = NewContext();
        var row = Assert.Single(await other.Set<UserSettings>().ToListAsync());
        Assert.Equal(DefaultView.Habits, row.DefaultView);
        Assert.False(row.PlanStartNotificationsEnabled);
    }

    [Fact]
    public async Task Empty_display_name_clears_it()
    {
        await _service.UpdateAsync(Request("Nour", notifications: true, defaultView: "Dashboard"));

        var cleared = await _service.UpdateAsync(Request("   ", notifications: true, defaultView: "Dashboard"));

        Assert.Null(cleared.DisplayName);
        await using var other = NewContext();
        Assert.Null((await other.Set<UserSettings>().SingleAsync()).DisplayName);
    }

    [Fact]
    public async Task Invalid_update_throws_and_changes_nothing()
    {
        await _service.UpdateAsync(Request("Nour", notifications: false, defaultView: "Tasks"));

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            _service.UpdateAsync(Request(new string('x', 101), notifications: true, defaultView: "Unknown")));

        Assert.Contains("displayName", ex.Errors.Keys);
        Assert.Contains("defaultView", ex.Errors.Keys);
        await using var other = NewContext();
        var row = await other.Set<UserSettings>().SingleAsync();
        Assert.Equal("Nour", row.DisplayName);
        Assert.Equal(DefaultView.Tasks, row.DefaultView);
        Assert.False(row.PlanStartNotificationsEnabled);
    }

    /// <summary>
    /// Runs <paramref name="beforeFirstSave"/> once, just before the first save (simulates a competing request), and reports a
    /// duplicate key like a relational provider does.
    /// </summary>
    private sealed class RacingContext(TestDbContext inner, Func<Task>? beforeFirstSave = null) : IApplicationDbContext
    {
        private bool _raced;

        public DbSet<TEntity> Set<TEntity>() where TEntity : class => inner.Set<TEntity>();

        public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            if (!_raced && beforeFirstSave is not null)
            {
                _raced = true;
                await beforeFirstSave();
            }

            try
            {
                return await inner.SaveChangesAsync(cancellationToken);
            }
            catch (ArgumentException ex)
            {
                // The in-memory provider reports a duplicate key as ArgumentException; relational providers (MySQL) throw
                // DbUpdateException, which is what the service handles.
                throw new DbUpdateException("Duplicate key.", ex);
            }
        }
    }
}
