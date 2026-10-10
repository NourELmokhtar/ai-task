namespace QuickFlow.Application.Common.Exceptions;

/// <summary>Thrown when a requested resource does not exist (or is soft-deleted). Mapped to 404.</summary>
public sealed class NotFoundException : AppException
{
    public NotFoundException(string message) : base(message) { }

    public NotFoundException(string resourceName, object key)
        : base($"{resourceName} with id '{key}' was not found.") { }
}
