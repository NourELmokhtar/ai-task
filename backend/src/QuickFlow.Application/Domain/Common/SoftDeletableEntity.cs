namespace QuickFlow.Application.Domain.Common;

/// <summary>Auditable entity with soft delete. Default base type for feature entities.</summary>
public abstract class SoftDeletableEntity : AuditableEntity, ISoftDeletable
{
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}
