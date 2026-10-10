using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Infrastructure.Persistence.Conventions;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>
/// Table <c>LearningNotes</c>. Each note belongs to exactly one card (required FK).
/// Notes of a soft-deleted card are hidden by the named <c>SoftDelete</c> query filter (BR-14).
/// </summary>
public sealed class LearningNoteConfiguration : IEntityTypeConfiguration<LearningNote>
{
    public void Configure(EntityTypeBuilder<LearningNote> builder)
    {
        builder.ToTable("LearningNotes");
        builder.HasKey(n => n.Id);

        builder.Property(n => n.Text).IsRequired().HasMaxLength(LearningNote.TextMaxLength);
        builder.Property(n => n.CreatedAt).IsRequired();

        builder.HasOne(n => n.LearningCard)
            .WithMany()
            .HasForeignKey(n => n.LearningCardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasQueryFilter(SoftDeleteModelBuilderExtensions.SoftDeleteFilter, n => !n.LearningCard.IsDeleted);
    }
}
