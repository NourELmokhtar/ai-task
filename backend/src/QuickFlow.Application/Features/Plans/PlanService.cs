using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Features.Tasks;

namespace QuickFlow.Application.Features.Plans;

/// <summary>
/// Plan use cases (M06) with the time-driven lifecycle (M07). Every path that returns a plan evaluates
/// <see cref="PlanTracking"/> at the injected clock's "now" and persists <see cref="Plan.Status"/> when the computed
/// status differs from the stored one (A-20, NFR-R2).
/// </summary>
public sealed class PlanService(
    IApplicationDbContext db, IPlanSourceResolver sourceResolver, ITaskService taskService, TimeProvider timeProvider) : IPlanService
{
    private const string PlanResource = "Plan";

    private DbSet<Plan> Plans => db.Set<Plan>();

    /// <summary>The soft-delete query filter on items hides items of deleted plans (BR-14).</summary>
    private DbSet<PlanItem> Items => db.Set<PlanItem>();

    private DateTime UtcNow => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<IReadOnlyList<PlanResponse>> ListAsync(PlanGroup? group = null, CancellationToken cancellationToken = default)
    {
        var now = UtcNow;
        var all = await LoadAndTrackAllAsync(now, cancellationToken);

        var selected = (group switch
        {
            null => all,
            PlanGroup.Active => all.Where(e => e.Tracking.Status == PlanStatus.InProgress),
            PlanGroup.Upcoming => all.Where(e => e.Tracking.Status == PlanStatus.NotStarted),
            // A-23 history: completed plans, most recent end first (id descending as a stable tie-break).
            PlanGroup.Completed => all.Where(e => e.Tracking.Status == PlanStatus.Completed)
                .OrderByDescending(e => e.Plan.EndDateTime).ThenByDescending(e => e.Plan.Id),
            _ => throw new ArgumentOutOfRangeException(nameof(group)),
        }).ToList();

        var sources = await sourceResolver.ResolveAsync(selected.SelectMany(e => e.Items).Select(Key), cancellationToken);
        return selected.Select(e => PlanResponse.From(e.Plan, e.Items, sources, now)).ToList();
    }

    public async Task<PlanTrackingSummary> GetTrackingSummaryAsync(CancellationToken cancellationToken = default)
    {
        var now = UtcNow;
        var all = await LoadAndTrackAllAsync(now, cancellationToken);

        var active = all
            .Where(e => e.Tracking.Status == PlanStatus.InProgress)
            .Select(e => new ActivePlanSummary(
                e.Plan.Id,
                e.Plan.Title,
                e.Plan.StartDateTime,
                e.Plan.EndDateTime,
                e.Plan.PriorityOrder,
                e.Tracking.Status,
                e.Tracking.Progress.ProgressPercent,
                e.Tracking.Progress.DoneItems,
                e.Tracking.Progress.TotalItems,
                e.Tracking.RestTimeSeconds))
            .ToList();

        return new PlanTrackingSummary(
            now,
            InProgressCount: active.Count,
            UpcomingCount: all.Count(e => e.Tracking.Status == PlanStatus.NotStarted),
            CompletedCount: all.Count(e => e.Tracking.Status == PlanStatus.Completed),
            active);
    }

    public async Task<PlanResponse> GetAsync(int id, CancellationToken cancellationToken = default)
    {
        var plan = await FindPlanAsync(id, cancellationToken);
        var items = await LoadItemsAsync(plan.Id, cancellationToken);
        var now = UtcNow;

        if (ApplyStatus(plan, items, now))
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return await ToResponseAsync(plan, items, now, cancellationToken);
    }

    public async Task<PlanResponse> CreateAsync(CreatePlanRequest request, CancellationToken cancellationToken = default)
    {
        var errors = new Dictionary<string, string[]>();
        var input = PlanInputValidator.Validate(request, errors);

        // BR-10: every source must exist and not be deleted. Checked for the structurally valid items.
        var sources = await sourceResolver.ResolveAsync(input.Items.Select(i => i.Key), cancellationToken);
        foreach (var item in input.Items)
        {
            if (sources.GetValueOrDefault(item.Key) is not { Available: true })
            {
                errors[$"{PlanInputValidator.ItemKey(item.Index)}.sourceId"] = [PlanInputValidator.SourceNotFound(item.SourceType, item.SourceId)];
            }
        }

        PlanInputValidator.ThrowIfAny(errors);

        var metadata = input.Metadata;
        var plan = new Plan
        {
            Title = metadata.Title,
            EstimatedDurationMinutes = metadata.EstimatedDurationMinutes,
            StartDateTime = metadata.StartDateTime,
            EndDateTime = metadata.EndDateTime,
            PriorityOrder = metadata.PriorityOrder,
            Items = input.Items
                .Select(i => new PlanItem { SourceType = i.SourceType, SourceId = i.SourceId, IsDone = false })
                .ToList(),
        };

        // M07: the stored status starts as the computed one (e.g. InProgress when the window is already open).
        var now = UtcNow;
        ApplyStatus(plan, plan.Items, now);

        Plans.Add(plan);
        await db.SaveChangesAsync(cancellationToken);
        return PlanResponse.From(plan, plan.Items, sources, now);
    }

    public async Task<PlanResponse> UpdateAsync(int id, UpdatePlanRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await FindPlanAsync(id, cancellationToken);
        var metadata = PlanInputValidator.Validate(request);

        plan.Title = metadata.Title;
        plan.EstimatedDurationMinutes = metadata.EstimatedDurationMinutes;
        plan.StartDateTime = metadata.StartDateTime;
        plan.EndDateTime = metadata.EndDateTime;
        plan.PriorityOrder = metadata.PriorityOrder;

        // A new window can change the status; it is saved together with the metadata.
        var items = await LoadItemsAsync(plan.Id, cancellationToken);
        var now = UtcNow;
        ApplyStatus(plan, items, now);

        await db.SaveChangesAsync(cancellationToken);
        return await ToResponseAsync(plan, items, now, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Loads only the plan (not its items), so EF's client-side cascade cannot hard-delete tracked items.
        var plan = await FindPlanAsync(id, cancellationToken);
        Plans.Remove(plan); // AppDbContext converts this into a soft delete (BR-14).
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<PlanResponse> SetItemDoneAsync(
        int planId, int itemId, UpdatePlanItemRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await FindPlanAsync(planId, cancellationToken);
        // Tracked: the changed flag is saved and the status is evaluated from the plan's current items (incl. this change).
        var items = await Items.Where(i => i.PlanId == planId).OrderBy(i => i.Id).ToListAsync(cancellationToken);
        var item = items.FirstOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException($"Plan item with id '{itemId}' was not found on plan '{planId}'.");
        var isDone = PlanInputValidator.Validate(request);

        item.IsDone = isDone;

        // A-20: all done → Completed; un-marking inside the window → back to InProgress. Saved with the item change.
        var now = UtcNow;
        ApplyStatus(plan, items, now);

        if (isDone && item.SourceType == PlanItemSourceType.Task && await IsAvailableAsync(item, cancellationToken))
        {
            // BR-13 / A-19: reuse the M02 completion operation (no duplicated status logic, NFR-M2). CompleteAsync saves through
            // the shared scoped DbContext, so the staged item/plan changes and the task completion are written in one
            // SaveChanges (one transaction). If it throws, nothing is saved.
            await taskService.CompleteAsync(item.SourceId, cancellationToken);
        }
        else
        {
            // Un-done never reverts the task; Habit/LearningResource items change only the item flag (A-19).
            // A Task item whose task was deleted later (A-24) also changes only the item flag.
            await db.SaveChangesAsync(cancellationToken);
        }

        return await ToResponseAsync(plan, items, now, cancellationToken);
    }

    /// <summary>One plan with its items and the tracking evaluated at a single "now".</summary>
    private sealed record EvaluatedPlan(Plan Plan, IReadOnlyList<PlanItem> Items, PlanTracking Tracking);

    /// <summary>
    /// All non-deleted plans in the A-16 order (PriorityOrder, StartDateTime, id) with their items, evaluated at
    /// <paramref name="now"/>. Changed statuses are persisted in one SaveChanges.
    /// </summary>
    private async Task<IReadOnlyList<EvaluatedPlan>> LoadAndTrackAllAsync(DateTime now, CancellationToken cancellationToken)
    {
        var plans = await Plans
            .OrderBy(p => p.PriorityOrder).ThenBy(p => p.StartDateTime).ThenBy(p => p.Id)
            .ToListAsync(cancellationToken);
        var itemsByPlan = (await Items.AsNoTracking().OrderBy(i => i.Id).ToListAsync(cancellationToken)).ToLookup(i => i.PlanId);

        var evaluated = plans
            .Select(p =>
            {
                var items = itemsByPlan[p.Id].ToList();
                return new EvaluatedPlan(p, items, PlanTracking.Evaluate(p, items, now));
            })
            .ToList();

        var changed = false;
        foreach (var e in evaluated)
        {
            changed |= SetStatus(e.Plan, e.Tracking.Status);
        }

        if (changed)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return evaluated;
    }

    /// <summary>Sets the computed status on the (tracked) plan. Returns true when it changed and must be saved.</summary>
    private static bool ApplyStatus(Plan plan, IEnumerable<PlanItem> items, DateTime now) =>
        SetStatus(plan, PlanTracking.Evaluate(plan, items, now).Status);

    private static bool SetStatus(Plan plan, PlanStatus status)
    {
        if (plan.Status == status) return false;
        plan.Status = status;
        return true;
    }

    private async Task<bool> IsAvailableAsync(PlanItem item, CancellationToken cancellationToken)
    {
        var sources = await sourceResolver.ResolveAsync([Key(item)], cancellationToken);
        return sources.GetValueOrDefault(Key(item)) is { Available: true };
    }

    private async Task<List<PlanItem>> LoadItemsAsync(int planId, CancellationToken cancellationToken) =>
        await Items.AsNoTracking().Where(i => i.PlanId == planId).OrderBy(i => i.Id).ToListAsync(cancellationToken);

    private async Task<PlanResponse> ToResponseAsync(
        Plan plan, IReadOnlyList<PlanItem> items, DateTime now, CancellationToken cancellationToken)
    {
        var sources = await sourceResolver.ResolveAsync(items.Select(Key), cancellationToken);
        return PlanResponse.From(plan, items, sources, now);
    }

    private static PlanSourceKey Key(PlanItem item) => new(item.SourceType, item.SourceId);

    /// <summary>Tracked lookup without items; the soft-delete query filter makes deleted plans "not found".</summary>
    private async Task<Plan> FindPlanAsync(int id, CancellationToken cancellationToken) =>
        await Plans.FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
        ?? throw new NotFoundException(PlanResource, id);
}
