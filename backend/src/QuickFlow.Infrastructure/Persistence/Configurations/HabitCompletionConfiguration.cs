using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Habits;
using QuickFlow.Infrastructure.Persistence.Conventions;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>
/// Table <c>HabitCompletions</c>. Unique index (HabitId, CompletionDate) enforces BR-07 in the database.
/// Completions of a soft-deleted habit are hidden by the named <c>SoftDelete</c> query filter (BR-14).
/// </summary>
public sealed class HabitCompletionConfiguration : IEntityTypeConfiguration<HabitCompletion>
{
    public void Configure(EntityTypeBuilder<HabitCompletion> builder)
    {
        builder.ToTable("HabitCompletions");
        builder.HasKey(c => c.Id);

        builder.Property(c => c.CompletionDate).IsRequired();
        builder.Property(c => c.CreatedAt).IsRequired();

        builder.HasOne(c => c.Habit)
            .WithMany()
            .HasForeignKey(c => c.HabitId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(c => new { c.HabitId, c.CompletionDate }).IsUnique();

        builder.HasQueryFilter(SoftDeleteModelBuilderExtensions.SoftDeleteFilter, c => !c.Habit.IsDeleted);
    }
}
