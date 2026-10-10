using Microsoft.EntityFrameworkCore;

namespace QuickFlow.Application.Common.Interfaces;

/// <summary>
/// Persistence abstraction used by application services. Feature modules add their
/// <c>DbSet&lt;TEntity&gt;</c> properties here and on <c>AppDbContext</c> (Infrastructure).
/// </summary>
public interface IApplicationDbContext
{
    DbSet<TEntity> Set<TEntity>() where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
