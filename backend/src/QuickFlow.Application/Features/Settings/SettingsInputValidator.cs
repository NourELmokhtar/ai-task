using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Settings;

namespace QuickFlow.Application.Features.Settings;

/// <summary>Validated, normalized settings fields.</summary>
public sealed record SettingsInput(string? DisplayName, bool PlanStartNotificationsEnabled, DefaultView DefaultView);

/// <summary>
/// Settings validation. Collects all field errors into one <see cref="ValidationException"/> with camelCase keys
/// (displayName, planStartNotificationsEnabled, defaultView).
/// </summary>
public static class SettingsInputValidator
{
    public static readonly string DisplayNameTooLong = $"Display name must be at most {UserSettings.DisplayNameMaxLength} characters.";
    public const string PlanStartNotificationsEnabledRequired = "PlanStartNotificationsEnabled is required.";
    public const string DefaultViewRequired = "Default view is required.";
    public static readonly string DefaultViewInvalid = $"Default view must be one of: {string.Join(", ", Enum.GetNames<DefaultView>())}.";

    public static SettingsInput Validate(UpdateSettingsRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        // Optional, trimmed, max 100 after trimming. Empty or whitespace-only means no name (null).
        var displayName = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim();
        if (displayName is { Length: > UserSettings.DisplayNameMaxLength }) errors["displayName"] = [DisplayNameTooLong];

        if (request.PlanStartNotificationsEnabled is null) errors["planStartNotificationsEnabled"] = [PlanStartNotificationsEnabledRequired];

        var defaultView = DefaultView.Dashboard;
        if (string.IsNullOrWhiteSpace(request.DefaultView)) errors["defaultView"] = [DefaultViewRequired];
        else if (!TryParseDefaultView(request.DefaultView, out defaultView)) errors["defaultView"] = [DefaultViewInvalid];

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }

        return new SettingsInput(displayName, request.PlanStartNotificationsEnabled!.Value, defaultView);
    }

    /// <summary>Case-insensitive name match. Numbers and undefined names are rejected.</summary>
    private static bool TryParseDefaultView(string value, out DefaultView result)
    {
        var trimmed = value.Trim();
        if (trimmed.Length > 0 && trimmed.All(char.IsLetter)
            && Enum.TryParse(trimmed, ignoreCase: true, out result) && Enum.IsDefined(result))
        {
            return true;
        }

        result = default;
        return false;
    }
}
