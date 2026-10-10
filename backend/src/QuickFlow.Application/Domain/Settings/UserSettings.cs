using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Application.Domain.Settings;

/// <summary>
/// The single user's settings (A-02, A-03): one row with the fixed id <see cref="SingletonId"/>, created with defaults on
/// first read. Not soft-deletable (it is never deleted). <c>CreatedAt</c>/<c>UpdatedAt</c> are set by the DbContext.
/// </summary>
public class UserSettings : AuditableEntity
{
    public const int SingletonId = 1;
    public const int DisplayNameMaxLength = 100;

    /// <summary>Optional profile name (trimmed; null when not set).</summary>
    public string? DisplayName { get; set; }

    public bool PlanStartNotificationsEnabled { get; set; } = true;

    public DefaultView DefaultView { get; set; } = DefaultView.Dashboard;

    /// <summary>New settings row with the default values.</summary>
    public static UserSettings CreateDefault() => new() { Id = SingletonId };
}
