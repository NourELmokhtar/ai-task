using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Infrastructure.Persistence.Conventions;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Learning;

/// <summary>MySQL DDL for the learning tables (generated without a database connection).</summary>
public class LearningPersistenceTests
{
    private static TestDbContext CreateMySqlModelContext() =>
        new(new DbContextOptionsBuilder<TestDbContext>().UseMySQL("Server=localhost;Database=model_only").Options, TimeProvider.System);

    [Fact]
    public void MySql_schema_contains_learning_tables()
    {
        using var db = CreateMySqlModelContext();
        var script = db.Database.GenerateCreateScript();

        Assert.Contains("CREATE TABLE `LearningCards`", script);
        Assert.Contains("`Title` varchar(200) NOT NULL", script);
        Assert.Contains("`Description` varchar(2000)", script);
        Assert.Contains("`Status` varchar(50) NOT NULL", script);
        Assert.Contains("CREATE TABLE `LearningMilestones`", script);
        Assert.Contains("`TargetDate` date NULL", script);
        Assert.Contains("`CompletedAt` datetime(6) NULL", script);
        Assert.Contains("CREATE TABLE `LearningNotes`", script);
        Assert.Contains("`Text` varchar(4000) NOT NULL", script);
    }

    [Fact]
    public void TargetDate_uses_the_DateOnly_converter()
    {
        using var db = CreateMySqlModelContext();
        var property = db.Model.FindEntityType(typeof(LearningMilestone))!.FindProperty(nameof(LearningMilestone.TargetDate))!;

        Assert.IsType<DateOnlyDateTimeConverter>(property.GetValueConverter());
        Assert.Equal("date", property.GetColumnType());
    }
}
