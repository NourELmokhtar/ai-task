using Microsoft.EntityFrameworkCore;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Persistence;

/// <summary>Checks the MySQL DDL produced by the conventions. Generating the script needs no database connection.</summary>
public class MySqlModelConventionTests
{
    [Fact]
    public void MySql_schema_uses_datetime6_date_and_string_enums()
    {
        var options = new DbContextOptionsBuilder<TestDbContext>()
            .UseMySQL("Server=localhost;Database=model_only")
            .Options;
        using var db = new TestDbContext(options, TimeProvider.System);

        var script = db.Database.GenerateCreateScript();

        Assert.Contains("`CreatedAt` datetime(6) NOT NULL", script);
        Assert.Contains("`DeletedAt` datetime(6) NULL", script);
        Assert.Contains("`DueDate` date NULL", script);
        Assert.Contains("`Status` varchar(50)", script);
    }

    [Fact]
    public void DateOnly_columns_are_read_and_written_as_DateTime()
    {
        // Regression (M02): the Oracle provider cannot read `date` columns as DateOnly without a converter.
        var options = new DbContextOptionsBuilder<TestDbContext>()
            .UseMySQL("Server=localhost;Database=model_only")
            .Options;
        using var db = new TestDbContext(options, TimeProvider.System);

        var dueDate = db.Model.FindEntityType(typeof(QuickFlow.Application.Domain.Tasks.TaskItem))!
            .FindProperty(nameof(QuickFlow.Application.Domain.Tasks.TaskItem.DueDate))!;
        var converter = Assert.IsType<QuickFlow.Infrastructure.Persistence.Conventions.DateOnlyDateTimeConverter>(dueDate.GetValueConverter());
        Assert.Equal("date", dueDate.GetColumnType());

        var day = new DateOnly(2026, 10, 9);
        var stored = converter.ConvertToProvider(day);
        Assert.Equal(new DateTime(2026, 10, 9), stored);
        Assert.Equal(day, converter.ConvertFromProvider(stored));
    }

    [Fact]
    public void MySql_schema_contains_Tasks_table_with_expected_columns()
    {
        var options = new DbContextOptionsBuilder<TestDbContext>()
            .UseMySQL("Server=localhost;Database=model_only")
            .Options;
        using var db = new TestDbContext(options, TimeProvider.System);

        var script = db.Database.GenerateCreateScript();

        Assert.Contains("CREATE TABLE `Tasks`", script);
        Assert.Contains("`Title` varchar(200) NOT NULL", script);
        Assert.Contains("`Description` varchar(2000) NULL", script);
        Assert.Contains("`Priority` varchar(50) NOT NULL", script);
        Assert.Contains("`CompletedAt` datetime(6) NULL", script);
        Assert.Contains("`IsArchived` tinyint(1) NOT NULL", script);
    }
}
