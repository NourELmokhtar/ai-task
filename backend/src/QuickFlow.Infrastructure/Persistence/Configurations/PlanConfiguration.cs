using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Plans;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>
/// Table <c>Plans</c>. Status is stored as its name (varchar(50)), start/end and audit timestamps as UTC <c>datetime(6)</c>
/// (conventions). Index matches the list order (A-16: PriorityOrder, then StartDateTime).
/// </summary>
public sealed class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> builder)
    {
        builder.ToTable("Plans");
        builder.HasKey(p => p.Id);

        builder.Property(p => p.Title).IsRequired().HasMaxLength(Plan.TitleMaxLength);
        builder.Property(p => p.EstimatedDurationMinutes).IsRequired();
        builder.Property(p => p.StartDateTime).IsRequired();
        builder.Property(p => p.EndDateTime).IsRequired();
        builder.Property(p => p.PriorityOrder).IsRequired();
        // Default (NotStarted) is applied by the domain entity, not the database.
        builder.Property(p => p.Status).IsRequired();

        builder.HasIndex(p => new { p.PriorityOrder, p.StartDateTime });
    }
}
