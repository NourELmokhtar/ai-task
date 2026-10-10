namespace QuickFlow.Application.Domain.Common;

/// <summary>Base type for every persisted entity. Integer identity key.</summary>
public abstract class Entity
{
    public int Id { get; set; }
}
