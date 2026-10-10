namespace QuickFlow.Application.Common.Exceptions;

/// <summary>
/// Business validation failure. Mapped to 400 ProblemDetails with an <c>errors</c> map
/// (field name → messages). Use camelCase field names matching the JSON contract.
/// </summary>
public sealed class ValidationException : AppException
{
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    public ValidationException(IDictionary<string, string[]> errors)
        : base("One or more validation errors occurred.")
    {
        Errors = new Dictionary<string, string[]>(errors);
    }

    public ValidationException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = [message] }) { }
}
