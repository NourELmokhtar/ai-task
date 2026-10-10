namespace QuickFlow.Application.Domain.Common;

/// <summary>Entity with automatic UTC CreatedAt / UpdatedAt.</summary>
public abstract class AuditableEntity : Entity, IAuditable
{
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
