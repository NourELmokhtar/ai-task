using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Domain.Habits;
using QuickFlow.Infrastructure.Persistence.Conventions;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Habits;

/// <summary>MySQL DDL for the habit tables (generated without a database connection).</summary>
public class HabitPersistenceTests
{
    private static TestDbContext CreateMySqlModelContext() =>
        new(new DbContextOptionsBuilder<TestDbContext>().UseMySQL("Server=localhost;Database=model_only").Options, TimeProvider.System);

    [Fact]
    public void MySql_schema_contains_habit_tables_and_unique_completion_index()
    {
        using var db = CreateMySqlModelContext();
        var script = db.Database.GenerateCreateScript();

        Assert.Contains("CREATE TABLE `Habits`", script);
        Assert.Contains("`Name` varchar(150) NOT NULL", script);
        Assert.Contains("`Frequency` varchar(50) NOT NULL", script);
        Assert.Contains("`IsActive` tinyint(1) NOT NULL", script);
        Assert.Contains("CREATE TABLE `HabitCompletions`", script);
        Assert.Contains("`CompletionDate` date NOT NULL", script);
        Assert.Contains("CREATE UNIQUE INDEX `IX_HabitCompletions_HabitId_CompletionDate` ON `HabitCompletions` (`HabitId`, `CompletionDate`)", script);
    }

    [Fact]
    public void CompletionDate_uses_the_DateOnly_converter()
    {
        // The Oracle provider cannot read `date` as DateOnly without the converter added in M02.
        using var db = CreateMySqlModelContext();
        var property = db.Model.FindEntityType(typeof(HabitCompletion))!.FindProperty(nameof(HabitCompletion.CompletionDate))!;

        Assert.IsType<DateOnlyDateTimeConverter>(property.GetValueConverter());
        Assert.Equal("date", property.GetColumnType());
    }
}
