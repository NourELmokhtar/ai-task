using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QuickFlow.Application.Domain.Settings;

namespace QuickFlow.Infrastructure.Persistence.Configurations;

/// <summary>
/// Table <c>UserSettings</c>: a single row with the fixed id 1 (assigned by the application, not auto-increment), so a
/// concurrent second insert fails with a duplicate key instead of creating a second row. DefaultView is stored as its name.
/// </summary>
public sealed class UserSettingsConfiguration : IEntityTypeConfiguration<UserSettings>
{
    public void Configure(EntityTypeBuilder<UserSettings> builder)
    {
        builder.ToTable("UserSettings");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).ValueGeneratedNever();

        builder.Property(s => s.DisplayName).HasMaxLength(UserSettings.DisplayNameMaxLength);
        // Defaults (true, Dashboard) are applied by the domain entity, not the database.
        builder.Property(s => s.PlanStartNotificationsEnabled).IsRequired();
        builder.Property(s => s.DefaultView).IsRequired();
    }
}
