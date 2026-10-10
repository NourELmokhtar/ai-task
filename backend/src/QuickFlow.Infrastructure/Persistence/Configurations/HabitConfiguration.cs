using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Habits;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>Table <c>Habits</c>. Frequency is stored as its name (varchar(50)), timestamps as <c>datetime(6)</c> (conventions).</summary>
public sealed class HabitConfiguration : IEntityTypeConfiguration<Habit>
{
    public void Configure(EntityTypeBuilder<Habit> builder)
    {
        builder.ToTable("Habits");
        builder.HasKey(h => h.Id);

        builder.Property(h => h.Name).IsRequired().HasMaxLength(Habit.NameMaxLength);
        builder.Property(h => h.Description).HasMaxLength(Habit.DescriptionMaxLength);
        builder.Property(h => h.Frequency).IsRequired();
        // Default (active) is applied by the domain entity, not the database.
        builder.Property(h => h.IsActive).IsRequired();
    }
}
