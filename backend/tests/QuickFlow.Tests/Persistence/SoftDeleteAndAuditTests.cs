using Microsoft.EntityFrameworkCore;
using QuickFlow.Infrastructure.Persistence.Conventions;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Persistence;

public class SoftDeleteAndAuditTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 10, 8, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task Removed_entity_is_soft_deleted_and_hidden_by_global_query_filter()
    {
        var clock = new FixedTimeProvider(T0);
        var dbName = Guid.NewGuid().ToString();

        await using (var db = TestDbContext.CreateInMemory(clock, dbName))
        {
            db.Items.AddRange(new TestItem { Name = "keep" }, new TestItem { Name = "remove" });
            await db.SaveChangesAsync();

            clock.UtcNow = T0.AddHours(1);
            db.Items.Remove(await db.Items.SingleAsync(i => i.Name == "remove"));
            await db.SaveChangesAsync();
        }

        await using (var db = TestDbContext.CreateInMemory(clock, dbName))
        {
            var visible = await db.Items.Select(i => i.Name).ToListAsync();
            Assert.Equal(["keep"], visible);

            var all = await db.Items.IgnoreQueryFilters([SoftDeleteModelBuilderExtensions.SoftDeleteFilter]).ToListAsync();
            Assert.Equal(2, all.Count); // row is kept, not physically deleted

            var deleted = all.Single(i => i.Name == "remove");
            Assert.True(deleted.IsDeleted);
            Assert.Equal(T0.AddHours(1).UtcDateTime, deleted.DeletedAt);
        }
    }

    [Fact]
    public async Task CreatedAt_and_UpdatedAt_come_from_injected_clock()
    {
        var clock = new FixedTimeProvider(T0);
        await using var db = TestDbContext.CreateInMemory(clock);

        var item = new TestItem { Name = "a" };
        db.Items.Add(item);
        await db.SaveChangesAsync();

        Assert.Equal(T0.UtcDateTime, item.CreatedAt);
        Assert.Equal(T0.UtcDateTime, item.UpdatedAt);
        Assert.Equal(DateTimeKind.Utc, item.CreatedAt.Kind);

        clock.UtcNow = T0.AddMinutes(5);
        item.Name = "b";
        await db.SaveChangesAsync();

        Assert.Equal(T0.UtcDateTime, item.CreatedAt);
        Assert.Equal(T0.AddMinutes(5).UtcDateTime, item.UpdatedAt);
    }

    [Fact]
    public void Soft_delete_filter_is_registered_as_named_filter()
    {
        using var db = TestDbContext.CreateInMemory(new FixedTimeProvider(T0));
        var entityType = db.Model.FindEntityType(typeof(TestItem))!;

        Assert.Contains(entityType.GetDeclaredQueryFilters(), f => f.Key == SoftDeleteModelBuilderExtensions.SoftDeleteFilter);
    }
}
