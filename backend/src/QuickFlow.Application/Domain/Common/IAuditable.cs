namespace QuickFlow.Application.Domain.Common;

/// <summary>
/// Entities implementing this get <see cref="CreatedAt"/> / <see cref="UpdatedAt"/> set automatically
/// (UTC, from the injected <see cref="TimeProvider"/>) when saved through the DbContext.
/// </summary>
public interface IAuditable
{
    DateTime CreatedAt { get; set; }
    DateTime UpdatedAt { get; set; }
}
