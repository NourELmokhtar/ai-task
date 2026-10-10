namespace QuickFlow.Infrastructure.Persistence;

/// <summary>Bound from the <c>Database</c> configuration section.</summary>
public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>Name under <c>ConnectionStrings</c> to use: <c>QuickFlow</c> (dev) or <c>QuickFlowE2E</c> (E2E, M09).</summary>
    public string ConnectionStringName { get; set; } = "QuickFlow";

    /// <summary>Apply pending EF Core migrations at startup (creates the database if missing).</summary>
    public bool ApplyMigrationsOnStartup { get; set; }
}
