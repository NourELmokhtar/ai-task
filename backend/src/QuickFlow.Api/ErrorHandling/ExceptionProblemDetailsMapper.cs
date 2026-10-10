using Microsoft.AspNetCore.Mvc;
using QuickFlow.Application.Common.Exceptions;

namespace QuickFlow.Api.ErrorHandling;

/// <summary>Maps exceptions to RFC 7807 ProblemDetails. Pure function, unit tested.</summary>
public static class ExceptionProblemDetailsMapper
{
    public static ProblemDetails Map(Exception exception) => exception switch
    {
        ValidationException e => new ValidationProblemDetails(
            e.Errors.ToDictionary(kv => kv.Key, kv => kv.Value))
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more validation errors occurred.",
        },
        NotFoundException e => new ProblemDetails
        {
            Status = StatusCodes.Status404NotFound,
            Title = "Not Found",
            Detail = e.Message,
        },
        ConflictException e => new ProblemDetails
        {
            Status = StatusCodes.Status409Conflict,
            Title = "Conflict",
            Detail = e.Message,
        },
        BadHttpRequestException e => new ProblemDetails
        {
            Status = e.StatusCode,
            Title = "Bad Request",
            Detail = e.Message,
        },
        _ => new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
        },
    };
}
