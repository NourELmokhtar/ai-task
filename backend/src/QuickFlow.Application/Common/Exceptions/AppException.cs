namespace QuickFlow.Application.Common.Exceptions;

/// <summary>
/// Base type for expected business errors. The API layer maps subclasses to ProblemDetails:
/// <see cref="ValidationException"/> → 400, <see cref="NotFoundException"/> → 404, <see cref="ConflictException"/> → 409.
/// </summary>
public abstract class AppException(string message) : Exception(message);
