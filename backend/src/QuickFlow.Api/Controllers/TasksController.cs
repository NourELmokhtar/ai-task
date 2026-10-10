using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;
using QuickFlow.Application.Common.Time;
using QuickFlow.Application.Features.Tasks;

namespace QuickFlow.Api.Controllers;

/// <summary>
/// Task management (M02). Every endpoint returning a task accepts an optional <c>today=YYYY-MM-DD</c>
/// used to compute <c>isOverdue</c> (defaults to the server's local date).
/// </summary>
[ApiController]
[Route("api/tasks")]
[Tags("Tasks")]
[Produces("application/json")]
public sealed class TasksController(ITaskService tasks, ITodayProvider todayProvider) : ControllerBase
{
    /// <summary>Lists tasks. Archived tasks are excluded unless archived=true (then only archived tasks are returned).</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<TaskResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<IReadOnlyList<TaskResponse>>> List(
        [FromQuery, Description("Case-insensitive substring of the title.")] string? search,
        [FromQuery, Description("Todo | InProgress | Done")] string? status,
        [FromQuery, Description("Low | Medium | High")] string? priority,
        [FromQuery, Description("Due date on or after (YYYY-MM-DD). Tasks without a due date are excluded.")] DateOnly? dueFrom,
        [FromQuery, Description("Due date on or before (YYYY-MM-DD). Tasks without a due date are excluded.")] DateOnly? dueTo,
        [FromQuery, Description("true = only overdue tasks (dueDate < today, not Done, not archived).")] bool? overdue,
        [FromQuery, Description("false (default) = active tasks only; true = archived tasks only.")] bool? archived,
        [FromQuery, Description("createdAt (default) | dueDate")] string? sortBy,
        [FromQuery, Description("desc (default) | asc. Null due dates are always last.")] string? sortDir,
        [FromQuery, Description("Effective today (YYYY-MM-DD) for overdue; default server local date.")] DateOnly? today,
        CancellationToken cancellationToken)
    {
        var effectiveToday = todayProvider.GetToday(today);
        var query = new TaskListQuery
        {
            Search = search,
            Status = status,
            Priority = priority,
            DueFrom = dueFrom,
            DueTo = dueTo,
            Overdue = overdue,
            Archived = archived,
            SortBy = sortBy,
            SortDir = sortDir,
        };

        var items = await tasks.ListAsync(query, effectiveToday, cancellationToken);
        return Ok(items.Select(t => TaskResponse.From(t, effectiveToday)).ToList());
    }

    /// <summary>Gets one task. Deleted tasks return 404.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<TaskResponse>> GetById(int id, [FromQuery] DateOnly? today, CancellationToken cancellationToken)
    {
        var task = await tasks.GetAsync(id, cancellationToken);
        return Ok(TaskResponse.From(task, todayProvider.GetToday(today)));
    }

    /// <summary>Creates a task. Defaults: status Todo, priority Medium.</summary>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<TaskResponse>> Create(
        [FromBody] CreateTaskRequest? request, [FromQuery] DateOnly? today, CancellationToken cancellationToken)
    {
        var task = await tasks.CreateAsync(request ?? new CreateTaskRequest(), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = task.Id }, TaskResponse.From(task, todayProvider.GetToday(today)));
    }

    /// <summary>Replaces a task's editable fields. Status changes maintain completedAt (BR-05).</summary>
    [HttpPut("{id:int}")]
    [Consumes("application/json")]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<TaskResponse>> Update(
        int id, [FromBody] UpdateTaskRequest? request, [FromQuery] DateOnly? today, CancellationToken cancellationToken)
    {
        var task = await tasks.UpdateAsync(id, request ?? new UpdateTaskRequest(), cancellationToken);
        return Ok(TaskResponse.From(task, todayProvider.GetToday(today)));
    }

    /// <summary>Completes a task (status Done, completedAt now). Idempotent.</summary>
    [HttpPost("{id:int}/complete")]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<TaskResponse>> Complete(int id, [FromQuery] DateOnly? today, CancellationToken cancellationToken)
    {
        var task = await tasks.CompleteAsync(id, cancellationToken);
        return Ok(TaskResponse.From(task, todayProvider.GetToday(today)));
    }

    /// <summary>Archives a task (hidden from the default list). Idempotent.</summary>
    [HttpPost("{id:int}/archive")]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<TaskResponse>> Archive(int id, [FromQuery] DateOnly? today, CancellationToken cancellationToken)
    {
        var task = await tasks.ArchiveAsync(id, cancellationToken);
        return Ok(TaskResponse.From(task, todayProvider.GetToday(today)));
    }

    /// <summary>Restores an archived task. Idempotent.</summary>
    [HttpPost("{id:int}/restore")]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<TaskResponse>> Restore(int id, [FromQuery] DateOnly? today, CancellationToken cancellationToken)
    {
        var task = await tasks.RestoreAsync(id, cancellationToken);
        return Ok(TaskResponse.From(task, todayProvider.GetToday(today)));
    }

    /// <summary>Deletes a task (soft delete, BR-14).</summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        await tasks.DeleteAsync(id, cancellationToken);
        return NoContent();
    }
}
