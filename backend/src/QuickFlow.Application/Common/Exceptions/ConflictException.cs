namespace QuickFlow.Application.Common.Exceptions;

/// <summary>Thrown when a request conflicts with the current state (duplicates, invalid state transitions). Mapped to 409.</summary>
public sealed class ConflictException(string message) : AppException(message);
