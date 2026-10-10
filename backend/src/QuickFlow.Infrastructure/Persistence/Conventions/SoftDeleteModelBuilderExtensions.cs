using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Domain.Common;

namespace QuickFlow.Infrastructure.Persistence.Conventions;

public static class SoftDeleteModelBuilderExtensions
{
    /// <summary>Name of the global soft-delete query filter. Bypass with <c>IgnoreQueryFilters([SoftDeleteFilter])</c>.</summary>
    public const string SoftDeleteFilter = "SoftDelete";

    /// <summary>Adds <c>e =&gt; !e.IsDeleted</c> as a named query filter to every root entity implementing <see cref="ISoftDeletable"/>.</summary>
    public static ModelBuilder ApplySoftDeleteQueryFilters(this ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes().ToList())
        {
            var clrType = entityType.ClrType;
            if (!typeof(ISoftDeletable).IsAssignableFrom(clrType) || entityType.BaseType is not null)
            {
                continue;
            }

            var parameter = Expression.Parameter(clrType, "e");
            var body = Expression.Not(Expression.Property(parameter, nameof(ISoftDeletable.IsDeleted)));
            modelBuilder.Entity(clrType).HasQueryFilter(SoftDeleteFilter, Expression.Lambda(body, parameter));
        }

        return modelBuilder;
    }
}
