using Microsoft.EntityFrameworkCore;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Settings;

/// <summary>MySQL DDL for the settings table (generated without a database connection).</summary>
public class SettingsPersistenceTests
{
    [Fact]
    public void MySql_schema_contains_UserSettings_table_with_a_non_generated_key()
    {
        using var db = new TestDbContext(
            new DbContextOptionsBuilder<TestDbContext>().UseMySQL("Server=localhost;Database=model_only").Options, TimeProvider.System);

        var script = db.Database.GenerateCreateScript();
        var table = script[script.IndexOf("CREATE TABLE `UserSettings`", StringComparison.Ordinal)..];
        table = table[..table.IndexOf(';')];

        Assert.Contains("`Id` int NOT NULL,", table);
        Assert.DoesNotContain("AUTO_INCREMENT", table);
        Assert.Contains("`DisplayName` varchar(100) NULL", table);
        Assert.Contains("`PlanStartNotificationsEnabled` tinyint(1) NOT NULL", table);
        Assert.Contains("`DefaultView` varchar(50) NOT NULL", table);
        Assert.Contains("`UpdatedAt` datetime(6) NOT NULL", table);
        Assert.DoesNotContain("IsDeleted", table);
    }
}
