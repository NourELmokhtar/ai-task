namespace QuickFlow.Application.Features.Settings;

/// <summary>The single user's settings (M05). Consumed by M07 (notification preference) and M08 (greeting name).</summary>
public interface ISettingsService
{
    /// <summary>Returns the settings, creating the row with defaults on first read (A-03). Safe against concurrent first reads.</summary>
    Task<SettingsResponse> GetAsync(CancellationToken cancellationToken = default);

    /// <summary>Validates and replaces all settings fields. Throws <c>ValidationException</c> on invalid input.</summary>
    Task<SettingsResponse> UpdateAsync(UpdateSettingsRequest request, CancellationToken cancellationToken = default);
}
