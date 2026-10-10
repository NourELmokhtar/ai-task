using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Tasks;

namespace QuickFlow.Application.Features.Tasks;

public sealed class TaskService(IApplicationDbContext db, TimeProvider timeProvider) : ITaskService
{
    private DbSet<TaskItem> Tasks => db.Set<TaskItem>();

    private DateTime UtcNow => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<IReadOnlyList<TaskItem>> ListAsync(TaskListQuery query, DateOnly today, CancellationToken cancellationToken = default)
    {
        var filter = TaskInputValidator.ValidateQuery(query);
        IQueryable<TaskItem> tasks = Tasks.AsNoTracking();

        // BR-04: archived tasks are excluded by default; archived=true returns archived tasks only.
        tasks = filter.Archived ? tasks.Where(t => t.IsArchived) : tasks.Where(t => !t.IsArchived);

        if (filter.Search is { } search)
        {
            // Case-insensitive title contains (explicit lower-casing keeps it provider-independent).
            var term = search.ToLower();
            tasks = tasks.Where(t => t.Title.ToLower().Contains(term));
        }

        if (filter.Status is { } status) tasks = tasks.Where(t => t.Status == status);
        if (filter.Priority is { } priority) tasks = tasks.Where(t => t.Priority == priority);
        if (filter.DueFrom is { } from) tasks = tasks.Where(t => t.DueDate != null && t.DueDate >= from);
        if (filter.DueTo is { } to) tasks = tasks.Where(t => t.DueDate != null && t.DueDate <= to);

        if (filter.OverdueOnly)
        {
            // Same rule as TaskItem.IsOverdue (A-05).
            tasks = tasks.Where(t => t.DueDate != null && t.DueDate < today && t.Status != TaskItemStatus.Done && !t.IsArchived);
        }

        tasks = (filter.SortBy, filter.Descending) switch
        {
            // Null due dates always last, in both directions.
            (TaskSortBy.DueDate, false) => tasks.OrderBy(t => t.DueDate == null).ThenBy(t => t.DueDate).ThenBy(t => t.Id),
            (TaskSortBy.DueDate, true) => tasks.OrderBy(t => t.DueDate == null).ThenByDescending(t => t.DueDate).ThenByDescending(t => t.Id),
            (_, false) => tasks.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id),
            (_, true) => tasks.OrderByDescending(t => t.CreatedAt).ThenByDescending(t => t.Id),
        };

        return await tasks.ToListAsync(cancellationToken);
    }

    public Task<TaskItem> GetAsync(int id, CancellationToken cancellationToken = default) => FindAsync(id, cancellationToken);

    public async Task<TaskItem> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken = default)
    {
        var input = TaskInputValidator.ValidateCreate(request);
        var task = new TaskItem
        {
            Title = input.Title,
            Description = input.Description,
            Priority = input.Priority,
            DueDate = input.DueDate,
        };
        task.SetStatus(input.Status, UtcNow);

        Tasks.Add(task);
        await db.SaveChangesAsync(cancellationToken);
        return task;
    }

    public async Task<TaskItem> UpdateAsync(int id, UpdateTaskRequest request, CancellationToken cancellationToken = default)
    {
        var task = await FindAsync(id, cancellationToken);
        var input = TaskInputValidator.ValidateUpdate(request);

        task.Title = input.Title;
        task.Description = input.Description;
        task.Priority = input.Priority;
        task.DueDate = input.DueDate;
        task.SetStatus(input.Status, UtcNow);

        await db.SaveChangesAsync(cancellationToken);
        return task;
    }

    public async Task<TaskItem> CompleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var task = await FindAsync(id, cancellationToken);
        task.MarkCompleted(UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return task;
    }

    public async Task<TaskItem> ArchiveAsync(int id, CancellationToken cancellationToken = default)
    {
        var task = await FindAsync(id, cancellationToken);
        task.IsArchived = true;
        await db.SaveChangesAsync(cancellationToken);
        return task;
    }

    public async Task<TaskItem> RestoreAsync(int id, CancellationToken cancellationToken = default)
    {
        var task = await FindAsync(id, cancellationToken);
        task.IsArchived = false;
        await db.SaveChangesAsync(cancellationToken);
        return task;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var task = await FindAsync(id, cancellationToken);
        Tasks.Remove(task); // AppDbContext converts this into a soft delete (BR-14).
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyDictionary<int, string>> GetTitlesAsync(
        IEnumerable<int> ids, bool includeDeleted = false, CancellationToken cancellationToken = default)
    {
        var wanted = ids.ToHashSet();
        if (wanted.Count == 0)
        {
            return new Dictionary<int, string>();
        }

        // TaskItem's only query filter is the soft-delete filter, so ignoring all filters includes deleted tasks.
        IQueryable<TaskItem> tasks = Tasks.AsNoTracking();
        if (includeDeleted) tasks = tasks.IgnoreQueryFilters();

        // Filtered in memory (small, single-user data set); avoids relying on provider support for list parameters.
        var all = await tasks.Select(t => new { t.Id, t.Title }).ToListAsync(cancellationToken);
        return all.Where(t => wanted.Contains(t.Id)).ToDictionary(t => t.Id, t => t.Title);
    }

    /// <summary>Tracked lookup; the soft-delete query filter makes deleted tasks "not found".</summary>
    private async Task<TaskItem> FindAsync(int id, CancellationToken cancellationToken) =>
        await Tasks.FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
        ?? throw new NotFoundException("Task", id);
}
