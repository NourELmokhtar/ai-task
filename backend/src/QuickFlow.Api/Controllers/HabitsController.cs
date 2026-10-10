using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;
using QuickFlow.Application.Common.Time;
using QuickFlow.Application.Features.Habits;

namespace QuickFlow.Api.Controllers;

/// <summary>
/// Habit tracking (M03). Every endpoint returning a habit accepts an optional <c>today=YYYY-MM-DD</c> used to compute
/// completedToday / completedForCurrentPeriod / currentStreak (defaults to the server's local date).
/// </summary>
[ApiController]
[Route("api/habits")]
[Tags("Habits")]
[Produces("application/json")]
public sealed class HabitsController(IHabitService habits, ITodayProvider todayProvider) : ControllerBase
{
    /// <summary>Lists habits (oldest first) with their progress for today.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<HabitResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<IReadOnlyList<HabitResponse>>> List(
        [FromQuery, Description("Omitted = all habits; true = active only; false = inactive only.")] bool? active,
        [FromQuery, Description("Effective today (YYYY-MM-DD) for progress fields; default server local date.")] DateOnly? today,
        CancellationToken cancellationToken)
    {
        return Ok(await habits.ListAsync(active, todayProvider.GetToday(today), cancellationToken));
    }

    /// <summary>Gets one habit with its progress. Deleted habits return 404.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType<HabitResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<HabitResponse>> GetById(int id, [FromQuery] DateOnly? today, CancellationToken cancellationToken) =>
        Ok(await habits.GetAsync(id, todayProvider.GetToday(today), cancellationToken));

    /// <summary>Creates an active habit.</summary>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType<HabitResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<HabitResponse>> Create(
        [FromBody] CreateHabitRequest? request, [FromQuery] DateOnly? today, CancellationToken cancellationToken)
    {
        var habit = await habits.CreateAsync(request ?? new CreateHabitRequest(), todayProvider.GetToday(today), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = habit.Id }, habit);
    }

    /// <summary>Replaces name, description and frequency. isActive is unchanged.</summary>
    [HttpPut("{id:int}")]
    [Consumes("application/json")]
    [ProducesResponseType<HabitResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<HabitResponse>> Update(
        int id, [FromBody] UpdateHabitRequest? request, [FromQuery] DateOnly? today, CancellationToken cancellationToken) =>
        Ok(await habits.UpdateAsync(id, request ?? new UpdateHabitRequest(), todayProvider.GetToday(today), cancellationToken));

    /// <summary>Deactivates a habit (it can no longer be completed; history is kept). Idempotent.</summary>
    [HttpPost("{id:int}/deactivate")]
    [ProducesResponseType<HabitResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<HabitResponse>> Deactivate(int id, [FromQuery] DateOnly? today, CancellationToken cancellationToken) =>
        Ok(await habits.DeactivateAsync(id, todayProvider.GetToday(today), cancellationToken));

    /// <summary>Reactivates a habit. Idempotent.</summary>
    [HttpPost("{id:int}/activate")]
    [ProducesResponseType<HabitResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<HabitResponse>> Activate(int id, [FromQuery] DateOnly? today, CancellationToken cancellationToken) =>
        Ok(await habits.ActivateAsync(id, todayProvider.GetToday(today), cancellationToken));

    /// <summary>Deletes a habit (soft delete, BR-14). Its completions are no longer returned.</summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        await habits.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Records a completion. The body is optional; date defaults to today. 400 if the habit is inactive or the date is
    /// after today, 409 if the habit is already completed on that date.
    /// </summary>
    [HttpPost("{id:int}/completions")]
    [ProducesResponseType<CompletionResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    public async Task<ActionResult<CompletionResponse>> AddCompletion(
        int id,
        [FromBody] CompletionRequest? request,
        [FromQuery, Description("Effective today (YYYY-MM-DD): default date and future-date limit; default server local date.")] DateOnly? today,
        CancellationToken cancellationToken)
    {
        var completion = await habits.AddCompletionAsync(id, request?.Date, todayProvider.GetToday(today), cancellationToken);
        var date = completion.Date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        return Created($"/api/habits/{id}/completions?from={date}&to={date}", completion);
    }

    /// <summary>Removes the completion on the given date (YYYY-MM-DD). 404 if the habit or that completion does not exist.</summary>
    [HttpDelete("{id:int}/completions/{date}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<IActionResult> RemoveCompletion(int id, DateOnly date, CancellationToken cancellationToken)
    {
        await habits.RemoveCompletionAsync(id, date, cancellationToken);
        return NoContent();
    }

    /// <summary>Lists completions by date ascending, optionally within [from, to] (inclusive).</summary>
    [HttpGet("{id:int}/completions")]
    [ProducesResponseType<IReadOnlyList<CompletionResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<IReadOnlyList<CompletionResponse>>> ListCompletions(
        int id,
        [FromQuery, Description("Earliest date (YYYY-MM-DD), inclusive.")] DateOnly? from,
        [FromQuery, Description("Latest date (YYYY-MM-DD), inclusive. Must not be before from.")] DateOnly? to,
        CancellationToken cancellationToken) =>
        Ok(await habits.ListCompletionsAsync(id, from, to, cancellationToken));
}
