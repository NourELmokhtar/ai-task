using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Domain.Common;
using QuickFlow.Infrastructure.Persistence;

namespace QuickFlow.Tests.TestSupport;

public enum TestStatus
{
    Todo,
    InProgress,
    Done,
}

/// <summary>Test-only entity exercising the foundation conventions (no feature entity exists in M01).</summary>
public sealed class TestItem : SoftDeletableEntity
{
    public string Name { get; set; } = string.Empty;
    public DateOnly? DueDate { get; set; }
    public TestStatus Status { get; set; }
}

/// <summary>Real <see cref="AppDbContext"/> conventions plus one test entity.</summary>
public sealed class TestDbContext(DbContextOptions<TestDbContext> options, TimeProvider timeProvider)
    : AppDbContext(options, timeProvider)
{
    public DbSet<TestItem> Items => Set<TestItem>();

    public static TestDbContext CreateInMemory(TimeProvider timeProvider, string? databaseName = null) =>
        new(new DbContextOptionsBuilder<TestDbContext>()
                .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
                .Options,
            timeProvider);
}

/// <summary>Controllable clock for tests.</summary>
public sealed class FixedTimeProvider(DateTimeOffset utcNow, TimeZoneInfo? localTimeZone = null) : TimeProvider
{
    public DateTimeOffset UtcNow { get; set; } = utcNow;

    public override DateTimeOffset GetUtcNow() => UtcNow;

    public override TimeZoneInfo LocalTimeZone { get; } = localTimeZone ?? TimeZoneInfo.Utc;
}
