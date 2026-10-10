using Microsoft.EntityFrameworkCore;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Plans;

/// <summary>MySQL DDL for the plan tables (generated without a database connection).</summary>
public class PlanPersistenceTests
{
    private static TestDbContext CreateMySqlModelContext() =>
        new(new DbContextOptionsBuilder<TestDbContext>().UseMySQL("Server=localhost;Database=model_only").Options, TimeProvider.System);

    [Fact]
    public void MySql_schema_contains_plan_tables()
    {
        using var db = CreateMySqlModelContext();
        var script = db.Database.GenerateCreateScript();

        Assert.Contains("CREATE TABLE `Plans`", script);
        Assert.Contains("`EstimatedDurationMinutes` int NOT NULL", script);
        Assert.Contains("`StartDateTime` datetime(6) NOT NULL", script);
        Assert.Contains("`EndDateTime` datetime(6) NOT NULL", script);
        Assert.Contains("`PriorityOrder` int NOT NULL", script);
        Assert.Contains("CREATE TABLE `PlanItems`", script);
        Assert.Contains("`SourceType` varchar(50) NOT NULL", script);
        Assert.Contains("`SourceId` int NOT NULL", script);
        Assert.Contains("CREATE UNIQUE INDEX `IX_PlanItems_PlanId_SourceType_SourceId`", script);
    }
}
