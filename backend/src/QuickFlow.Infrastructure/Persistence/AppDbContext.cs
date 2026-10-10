using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Common;
using QuickFlow.Application.Domain.Habits;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Domain.Settings;
using QuickFlow.Application.Domain.Tasks;
using QuickFlow.Infrastructure.Persistence.Conventions;

namespace QuickFlow.Infrastructure.Persistence;

/// <summary>
/// Single EF Core context for the app. Feature modules add <c>DbSet</c> properties here and an
/// <see cref="IEntityTypeConfiguration{TEntity}"/> class under <c>Persistence/Configurations</c>
/// (picked up automatically), then add a migration.
/// </summary>
public class AppDbContext : DbContext, IApplicationDbContext
{
    public const string DefaultCharSet = "utf8mb4";
    public const string DefaultCollation = "utf8mb4_0900_ai_ci"; // case- and accent-insensitive

    private readonly TimeProvider _timeProvider;

    public AppDbContext(DbContextOptions<AppDbContext> options, TimeProvider timeProvider)
        : base(options)
    {
        _timeProvider = timeProvider;
    }

    /// <summary>For derived contexts (e.g. tests).</summary>
    protected AppDbContext(DbContextOptions options, TimeProvider timeProvider)
        : base(options)
    {
        _timeProvider = timeProvider;
    }

    /// <summary>M02 Tasks (table <c>Tasks</c>).</summary>
    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    /// <summary>M03 Habits (table <c>Habits</c>).</summary>
    public DbSet<Habit> Habits => Set<Habit>();

    /// <summary>M03 habit completions (table <c>HabitCompletions</c>, unique (HabitId, CompletionDate)).</summary>
    public DbSet<HabitCompletion> HabitCompletions => Set<HabitCompletion>();

    /// <summary>M04 learning cards (table <c>LearningCards</c>).</summary>
    public DbSet<LearningCard> LearningCards => Set<LearningCard>();

    /// <summary>M04 learning milestones (table <c>LearningMilestones</c>).</summary>
    public DbSet<LearningMilestone> LearningMilestones => Set<LearningMilestone>();

    /// <summary>M04 learning notes (table <c>LearningNotes</c>).</summary>
    public DbSet<LearningNote> LearningNotes => Set<LearningNote>();

    /// <summary>M06 plans (table <c>Plans</c>).</summary>
    public DbSet<Plan> Plans => Set<Plan>();

    /// <summary>M06 plan items (table <c>PlanItems</c>, unique (PlanId, SourceType, SourceId)).</summary>
    public DbSet<PlanItem> PlanItems => Set<PlanItem>();

    /// <summary>M05 user settings (table <c>UserSettings</c>, single row with id 1).</summary>
    public DbSet<UserSettings> UserSettings => Set<UserSettings>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // UTC timestamps -> datetime(6); values read back are DateTimeKind.Utc.
        configurationBuilder.Properties<DateTime>()
            .HaveConversion<UtcDateTimeConverter>()
            .HaveColumnType("datetime(6)");
        configurationBuilder.Properties<DateTime?>()
            .HaveConversion<UtcDateTimeConverter>()
            .HaveColumnType("datetime(6)");

        // Date-only fields -> date. Read/written as DateTime: the Oracle provider cannot read DateOnly directly.
        configurationBuilder.Properties<DateOnly>()
            .HaveConversion<DateOnlyDateTimeConverter>()
            .HaveColumnType("date");
        configurationBuilder.Properties<DateOnly?>()
            .HaveConversion<DateOnlyDateTimeConverter>()
            .HaveColumnType("date");

        // Enums stored as their string names (matches the JSON contract, readable in SQL).
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(50);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Charset/collation: the initial migration sets the DATABASE default to utf8mb4 / utf8mb4_0900_ai_ci
        // and every table/column inherits it (case-insensitive text search). The Oracle provider's own
        // charset APIs are deliberately not used: its migration code generator emits code that does not compile.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        modelBuilder.ApplySoftDeleteQueryFilters();
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyAuditAndSoftDelete();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ApplyAuditAndSoftDelete();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>Sets audit timestamps and turns deletes of <see cref="ISoftDeletable"/> entities into soft deletes.</summary>
    private void ApplyAuditAndSoftDelete()
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Deleted && entry.Entity is ISoftDeletable softDeletable)
            {
                entry.State = EntityState.Modified;
                softDeletable.IsDeleted = true;
                softDeletable.DeletedAt = now;
            }

            if (entry.Entity is IAuditable auditable)
            {
                switch (entry.State)
                {
                    case EntityState.Added:
                        auditable.CreatedAt = now;
                        auditable.UpdatedAt = now;
                        break;
                    case EntityState.Modified:
                        auditable.UpdatedAt = now;
                        entry.Property(nameof(IAuditable.CreatedAt)).IsModified = false;
                        break;
                }
            }
        }
    }
}
