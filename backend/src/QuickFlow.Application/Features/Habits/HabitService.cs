using System.Globalization;
using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Habits;

namespace QuickFlow.Application.Features.Habits;

public sealed class HabitService(IApplicationDbContext db, TimeProvider timeProvider) : IHabitService
{
    private DbSet<Habit> Habits => db.Set<Habit>();

    /// <summary>The soft-delete query filter on completions hides completions of deleted habits (BR-14).</summary>
    private DbSet<HabitCompletion> Completions => db.Set<HabitCompletion>();

    private DateTime UtcNow => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<IReadOnlyList<HabitResponse>> ListAsync(bool? active, DateOnly today, CancellationToken cancellationToken = default)
    {
        IQueryable<Habit> habits = Habits.AsNoTracking();
        IQueryable<HabitCompletion> completions = Completions.AsNoTracking().Where(c => c.CompletionDate <= today);
        if (active is { } isActive)
        {
            habits = habits.Where(h => h.IsActive == isActive);
            completions = completions.Where(c => c.Habit.IsActive == isActive);
        }

        var list = await habits.OrderBy(h => h.CreatedAt).ThenBy(h => h.Id).ToListAsync(cancellationToken);
        var datesByHabit = (await completions.Select(c => new { c.HabitId, c.CompletionDate }).ToListAsync(cancellationToken))
            .ToLookup(c => c.HabitId, c => c.CompletionDate);

        return list.Select(h => HabitResponse.From(h, datesByHabit[h.Id], today)).ToList();
    }

    public async Task<HabitResponse> GetAsync(int id, DateOnly today, CancellationToken cancellationToken = default) =>
        await ToResponseAsync(await FindAsync(id, cancellationToken), today, cancellationToken);

    public async Task<HabitResponse> CreateAsync(CreateHabitRequest request, DateOnly today, CancellationToken cancellationToken = default)
    {
        var input = HabitInputValidator.Validate(request);
        var habit = new Habit
        {
            Name = input.Name,
            Description = input.Description,
            Frequency = input.Frequency,
            IsActive = true,
        };

        Habits.Add(habit);
        await db.SaveChangesAsync(cancellationToken);
        return HabitResponse.From(habit, HabitProgress.None);
    }

    public async Task<HabitResponse> UpdateAsync(int id, UpdateHabitRequest request, DateOnly today, CancellationToken cancellationToken = default)
    {
        var habit = await FindAsync(id, cancellationToken);
        var input = HabitInputValidator.Validate(request);

        habit.Name = input.Name;
        habit.Description = input.Description;
        habit.Frequency = input.Frequency;

        await db.SaveChangesAsync(cancellationToken);
        return await ToResponseAsync(habit, today, cancellationToken);
    }

    public Task<HabitResponse> ActivateAsync(int id, DateOnly today, CancellationToken cancellationToken = default) =>
        SetActiveAsync(id, true, today, cancellationToken);

    public Task<HabitResponse> DeactivateAsync(int id, DateOnly today, CancellationToken cancellationToken = default) =>
        SetActiveAsync(id, false, today, cancellationToken);

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var habit = await FindAsync(id, cancellationToken);
        Habits.Remove(habit); // AppDbContext converts this into a soft delete (BR-14).
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<CompletionResponse> AddCompletionAsync(int id, DateOnly? date, DateOnly today, CancellationToken cancellationToken = default)
    {
        var habit = await FindAsync(id, cancellationToken);
        var completionDate = date ?? today;
        HabitInputValidator.ValidateCompletion(habit, completionDate, today);

        // BR-07: checked here for a clear 409; the unique index (HabitId, CompletionDate) is the final guard.
        if (await HasCompletionAsync(id, completionDate, cancellationToken))
        {
            throw DuplicateCompletion(id, completionDate);
        }

        var completion = new HabitCompletion { HabitId = id, CompletionDate = completionDate, CreatedAt = UtcNow };
        Completions.Add(completion);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A concurrent request inserted the same date between the check and the insert (unique index violation).
            Completions.Entry(completion).State = EntityState.Detached;
            if (await HasCompletionAsync(id, completionDate, cancellationToken))
            {
                throw DuplicateCompletion(id, completionDate);
            }

            throw;
        }

        return CompletionResponse.From(completion);
    }

    public async Task RemoveCompletionAsync(int id, DateOnly date, CancellationToken cancellationToken = default)
    {
        await FindAsync(id, cancellationToken);
        var completion = await Completions.FirstOrDefaultAsync(c => c.HabitId == id && c.CompletionDate == date, cancellationToken)
            ?? throw new NotFoundException($"Habit with id '{id}' has no completion on {Iso(date)}.");

        Completions.Remove(completion); // Hard delete: the date can be completed again.
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<CompletionResponse>> ListCompletionsAsync(int id, DateOnly? from, DateOnly? to, CancellationToken cancellationToken = default)
    {
        await FindAsync(id, cancellationToken);
        HabitInputValidator.ValidateRange(from, to);

        var query = Completions.AsNoTracking().Where(c => c.HabitId == id);
        if (from is { } f) query = query.Where(c => c.CompletionDate >= f);
        if (to is { } t) query = query.Where(c => c.CompletionDate <= t);

        var completions = await query.OrderBy(c => c.CompletionDate).ToListAsync(cancellationToken);
        return completions.Select(CompletionResponse.From).ToList();
    }

    public Task<bool> ExistsAsync(int id, CancellationToken cancellationToken = default) =>
        Habits.AsNoTracking().AnyAsync(h => h.Id == id, cancellationToken);

    public async Task<IReadOnlyDictionary<int, string>> GetNamesAsync(
        IEnumerable<int> ids, bool includeDeleted = false, CancellationToken cancellationToken = default)
    {
        var wanted = ids.ToHashSet();
        if (wanted.Count == 0)
        {
            return new Dictionary<int, string>();
        }

        // Habit's only query filter is the soft-delete filter, so ignoring all filters includes deleted habits.
        IQueryable<Habit> habits = Habits.AsNoTracking();
        if (includeDeleted) habits = habits.IgnoreQueryFilters();

        // Filtered in memory (small, single-user data set); avoids relying on provider support for list parameters.
        var all = await habits.Select(h => new { h.Id, h.Name }).ToListAsync(cancellationToken);
        return all.Where(h => wanted.Contains(h.Id)).ToDictionary(h => h.Id, h => h.Name);
    }

    private async Task<HabitResponse> SetActiveAsync(int id, bool isActive, DateOnly today, CancellationToken cancellationToken)
    {
        var habit = await FindAsync(id, cancellationToken);
        habit.IsActive = isActive;
        await db.SaveChangesAsync(cancellationToken);
        return await ToResponseAsync(habit, today, cancellationToken);
    }

    private async Task<HabitResponse> ToResponseAsync(Habit habit, DateOnly today, CancellationToken cancellationToken)
    {
        var dates = await Completions.AsNoTracking()
            .Where(c => c.HabitId == habit.Id && c.CompletionDate <= today)
            .Select(c => c.CompletionDate)
            .ToListAsync(cancellationToken);
        return HabitResponse.From(habit, dates, today);
    }

    private Task<bool> HasCompletionAsync(int id, DateOnly date, CancellationToken cancellationToken) =>
        Completions.AsNoTracking().AnyAsync(c => c.HabitId == id && c.CompletionDate == date, cancellationToken);

    private static ConflictException DuplicateCompletion(int id, DateOnly date) =>
        new($"Habit with id '{id}' is already completed on {Iso(date)}.");

    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>Tracked lookup; the soft-delete query filter makes deleted habits "not found".</summary>
    private async Task<Habit> FindAsync(int id, CancellationToken cancellationToken) =>
        await Habits.FirstOrDefaultAsync(h => h.Id == id, cancellationToken)
        ?? throw new NotFoundException("Habit", id);
}
