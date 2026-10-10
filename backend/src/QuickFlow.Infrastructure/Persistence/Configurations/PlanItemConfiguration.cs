using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Plans;
using QuickFlow.Infrastructure.Persistence.Conventions;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>
/// Table <c>PlanItems</c>. Each item belongs to exactly one plan (required FK). <c>SourceId</c> has no FK (polymorphic source).
/// A unique index on (PlanId, SourceType, SourceId) backs A-17 (no duplicate source in one plan).
/// Items of a soft-deleted plan are hidden by the named <c>SoftDelete</c> query filter (BR-14).
/// </summary>
public sealed class PlanItemConfiguration : IEntityTypeConfiguration<PlanItem>
{
    public void Configure(EntityTypeBuilder<PlanItem> builder)
    {
        builder.ToTable("PlanItems");
        builder.HasKey(i => i.Id);

        builder.Property(i => i.SourceType).IsRequired();
        builder.Property(i => i.SourceId).IsRequired();
        builder.Property(i => i.IsDone).IsRequired();

        builder.HasOne(i => i.Plan)
            .WithMany(p => p.Items)
            .HasForeignKey(i => i.PlanId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(i => new { i.PlanId, i.SourceType, i.SourceId }).IsUnique();

        builder.HasQueryFilter(SoftDeleteModelBuilderExtensions.SoftDeleteFilter, i => !i.Plan.IsDeleted);
    }
}
