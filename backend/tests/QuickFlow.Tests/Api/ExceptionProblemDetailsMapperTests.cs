using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using QuickFlow.Api.ErrorHandling;
using QuickFlow.Application.Common.Exceptions;

namespace QuickFlow.Tests.Api;

public class ExceptionProblemDetailsMapperTests
{
    [Fact]
    public void ValidationException_maps_to_400_with_field_errors()
    {
        var problem = ExceptionProblemDetailsMapper.Map(new ValidationException("title", "Title is required."));

        var validation = Assert.IsType<ValidationProblemDetails>(problem);
        Assert.Equal(StatusCodes.Status400BadRequest, validation.Status);
        Assert.Equal(["Title is required."], validation.Errors["title"]);
    }

    [Fact]
    public void NotFoundException_maps_to_404()
    {
        var problem = ExceptionProblemDetailsMapper.Map(new NotFoundException("Task", 42));

        Assert.Equal(StatusCodes.Status404NotFound, problem.Status);
        Assert.Equal("Task with id '42' was not found.", problem.Detail);
    }

    [Fact]
    public void ConflictException_maps_to_409()
    {
        var problem = ExceptionProblemDetailsMapper.Map(new ConflictException("Already exists."));

        Assert.Equal(StatusCodes.Status409Conflict, problem.Status);
        Assert.Equal("Already exists.", problem.Detail);
    }

    [Fact]
    public void Unexpected_exception_maps_to_500_without_leaking_details()
    {
        var problem = ExceptionProblemDetailsMapper.Map(new InvalidOperationException("secret internals"));

        Assert.Equal(StatusCodes.Status500InternalServerError, problem.Status);
        Assert.Null(problem.Detail);
    }
}
