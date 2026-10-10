using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Infrastructure.Persistence.Conventions;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>
/// Table <c>LearningMilestones</c>. Each milestone belongs to exactly one card (BR-09, required FK).
/// Milestones of a soft-deleted card are hidden by the named <c>SoftDelete</c> query filter (BR-14).
/// </summary>
public sealed class LearningMilestoneConfiguration : IEntityTypeConfiguration<LearningMilestone>
{
    public void Configure(EntityTypeBuilder<LearningMilestone> builder)
    {
        builder.ToTable("LearningMilestones");
        builder.HasKey(m => m.Id);

        builder.Property(m => m.Title).IsRequired().HasMaxLength(LearningMilestone.TitleMaxLength);
        builder.Property(m => m.IsDone).IsRequired();

        builder.HasOne(m => m.LearningCard)
            .WithMany()
            .HasForeignKey(m => m.LearningCardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasQueryFilter(SoftDeleteModelBuilderExtensions.SoftDeleteFilter, m => !m.LearningCard.IsDeleted);
    }
}
