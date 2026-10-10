using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Application.Features.Learning;
using QuickFlow.Application.Features.Tasks;

namespace QuickFlow.Application.Features.Plans;

/// <summary>Identifies the entity a plan item references.</summary>
public readonly record struct PlanSourceKey(PlanItemSourceType SourceType, int SourceId);

/// <summary>
/// Resolved source: its title (also for soft-deleted sources, A-24) and whether it is still available
/// (exists and is not deleted; tasks may be archived, habits inactive).
/// </summary>
public sealed record PlanSourceInfo(string Title, bool Available);

/// <summary>
/// Resolves plan item sources through the owning modules' services (B4): <see cref="ITaskService"/>,
/// <see cref="IHabitService"/> and <see cref="ILearningService"/>. Reusable by M07/M08.
/// </summary>
public interface IPlanSourceResolver
{
    /// <summary>
    /// Title and availability for each source. Sources that were soft-deleted are returned with <c>Available=false</c>.
    /// Sources that never existed are absent from the result. At most two batched lookups per source type.
    /// </summary>
    Task<IReadOnlyDictionary<PlanSourceKey, PlanSourceInfo>> ResolveAsync(
        IEnumerable<PlanSourceKey> sources, CancellationToken cancellationToken = default);
}

public sealed class PlanSourceResolver(ITaskService tasks, IHabitService habits, ILearningService learning) : IPlanSourceResolver
{
    public async Task<IReadOnlyDictionary<PlanSourceKey, PlanSourceInfo>> ResolveAsync(
        IEnumerable<PlanSourceKey> sources, CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<PlanSourceKey, PlanSourceInfo>();
        foreach (var group in sources.Distinct().GroupBy(s => s.SourceType))
        {
            var ids = group.Select(s => s.SourceId).ToList();

            // Sequential on purpose: all services share the scoped DbContext, which does not allow concurrent operations.
            var (all, available) = group.Key switch
            {
                PlanItemSourceType.Task => (
                    await tasks.GetTitlesAsync(ids, includeDeleted: true, cancellationToken),
                    await tasks.GetTitlesAsync(ids, includeDeleted: false, cancellationToken)),
                PlanItemSourceType.Habit => (
                    await habits.GetNamesAsync(ids, includeDeleted: true, cancellationToken),
                    await habits.GetNamesAsync(ids, includeDeleted: false, cancellationToken)),
                PlanItemSourceType.LearningResource => (
                    await learning.GetTitlesAsync(ids, includeDeleted: true, cancellationToken),
                    await learning.GetTitlesAsync(ids, includeDeleted: false, cancellationToken)),
                _ => throw new ArgumentOutOfRangeException(nameof(sources), group.Key, "Unknown plan item source type."),
            };

            foreach (var (id, title) in all)
            {
                result[new PlanSourceKey(group.Key, id)] = new PlanSourceInfo(title, available.ContainsKey(id));
            }
        }

        return result;
    }
}
