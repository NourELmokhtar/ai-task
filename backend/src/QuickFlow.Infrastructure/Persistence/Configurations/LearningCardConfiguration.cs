using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Learning;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>Table <c>LearningCards</c>. Status is stored as its name (varchar(50)), timestamps as <c>datetime(6)</c> (conventions).</summary>
public sealed class LearningCardConfiguration : IEntityTypeConfiguration<LearningCard>
{
    public void Configure(EntityTypeBuilder<LearningCard> builder)
    {
        builder.ToTable("LearningCards");
        builder.HasKey(c => c.Id);

        builder.Property(c => c.Title).IsRequired().HasMaxLength(LearningCard.TitleMaxLength);
        builder.Property(c => c.Description).HasMaxLength(LearningCard.DescriptionMaxLength);
        // Default (NotStarted) is applied by the domain entity, not the database.
        builder.Property(c => c.Status).IsRequired();
    }
}
