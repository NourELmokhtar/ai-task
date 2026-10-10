using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Tasks;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>Table <c>Tasks</c>. Enums are stored as names (varchar(50)), DueDate as <c>date</c>, timestamps as <c>datetime(6)</c> (conventions).</summary>
public sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.ToTable("Tasks");
        builder.HasKey(t => t.Id);

        builder.Property(t => t.Title).IsRequired().HasMaxLength(TaskItem.TitleMaxLength);
        builder.Property(t => t.Description).HasMaxLength(TaskItem.DescriptionMaxLength);
        // Defaults (Todo / Medium) are applied by the domain entity, not the database.
        builder.Property(t => t.Status).IsRequired();
        builder.Property(t => t.Priority).IsRequired();
        builder.Property(t => t.IsArchived).IsRequired();

        builder.HasIndex(t => t.IsArchived);
        builder.HasIndex(t => t.DueDate);
    }
}
