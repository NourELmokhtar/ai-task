namespace QuickFlow.Application.Domain.Common;

/// <summary>
/// Soft delete marker (BR-14). Removing such an entity through the DbContext sets
/// <see cref="IsDeleted"/> = true and <see cref="DeletedAt"/> = now (UTC) instead of deleting the row.
/// A global query filter named <c>SoftDelete</c> hides deleted rows from every normal query.
/// </summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
    DateTime? DeletedAt { get; set; }
}
