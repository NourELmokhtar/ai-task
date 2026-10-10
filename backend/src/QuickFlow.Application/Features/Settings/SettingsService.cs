using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Settings;

namespace QuickFlow.Application.Features.Settings;

public sealed class SettingsService(IApplicationDbContext db) : ISettingsService
{
    private DbSet<UserSettings> Settings => db.Set<UserSettings>();

    public async Task<SettingsResponse> GetAsync(CancellationToken cancellationToken = default) =>
        SettingsResponse.From(await GetOrCreateAsync(cancellationToken));

    public async Task<SettingsResponse> UpdateAsync(UpdateSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var input = SettingsInputValidator.Validate(request);
        var settings = await GetOrCreateAsync(cancellationToken);

        settings.DisplayName = input.DisplayName;
        settings.PlanStartNotificationsEnabled = input.PlanStartNotificationsEnabled;
        settings.DefaultView = input.DefaultView;

        await db.SaveChangesAsync(cancellationToken); // UpdatedAt is set by the DbContext when a value changed.
        return SettingsResponse.From(settings);
    }

    /// <summary>
    /// Loads the singleton row (tracked), inserting it with defaults when missing. The fixed primary key makes a concurrent
    /// second insert fail with a duplicate key instead of creating a second row; that request then reads the saved row.
    /// </summary>
    private async Task<UserSettings> GetOrCreateAsync(CancellationToken cancellationToken)
    {
        var existing = await FindAsync(cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var created = UserSettings.CreateDefault();
        Settings.Add(created);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return created;
        }
        catch (DbUpdateException)
        {
            // Lost the race for the first insert: discard this row and use the one that was saved.
            Settings.Entry(created).State = EntityState.Detached;
            return await FindAsync(cancellationToken)
                ?? throw new InvalidOperationException("The settings row could not be created.");
        }
    }

    private Task<UserSettings?> FindAsync(CancellationToken cancellationToken) =>
        Settings.FirstOrDefaultAsync(s => s.Id == UserSettings.SingletonId, cancellationToken);
}
