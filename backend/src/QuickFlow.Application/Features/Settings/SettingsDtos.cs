using System.ComponentModel;
using QuickFlow.Application.Domain.Settings;

namespace QuickFlow.Application.Features.Settings;

/// <summary>The user's settings.</summary>
public sealed record SettingsResponse(
    string? DisplayName,
    bool PlanStartNotificationsEnabled,
    DefaultView DefaultView,
    DateTime UpdatedAt)
{
    public static SettingsResponse From(UserSettings settings) => new(
        settings.DisplayName,
        settings.PlanStartNotificationsEnabled,
        settings.DefaultView,
        settings.UpdatedAt);
}

/// <summary>
/// Body of <c>PUT /api/settings</c>. Full replacement: an omitted or empty displayName clears it.
/// DefaultView is a string validated by the service so that an invalid value produces <c>errors.defaultView</c>.
/// </summary>
public sealed class UpdateSettingsRequest
{
    [Description("Optional. Trimmed; up to 100 characters. Null, empty or whitespace-only clears it.")]
    public string? DisplayName { get; set; }

    [Description("Required. Whether a notification is shown when a plan starts.")]
    public bool? PlanStartNotificationsEnabled { get; set; }

    [Description("Required. One of: Dashboard, Tasks, Habits, LearningResources, TodoPlans, Settings.")]
    public string? DefaultView { get; set; }
}
