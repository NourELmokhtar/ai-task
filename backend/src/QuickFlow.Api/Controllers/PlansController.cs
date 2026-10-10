using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;
using QuickFlow.Application.Features.Plans;

namespace QuickFlow.Api.Controllers;

/// <summary>
/// Todo Plans (M06): plans built from existing tasks, habits and learning cards, with per-item done flags and the
/// computed completion percentage. M07: every response carries the status computed from the window, the items and the
/// server clock, the rest time (InProgress only) and serverNow; the list can be grouped (active, upcoming, completed).
/// </summary>
[ApiController]
[Route("api/plans")]
[Tags("Plans")]
[Produces("application/json")]
public sealed class PlansController(IPlanService plans) : ControllerBase
{
    /// <summary>
    /// Lists plans. Without group (or group=active / upcoming): priorityOrder ascending, then startDateTime ascending.
    /// group=completed (history): endDateTime descending.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PlanResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<IReadOnlyList<PlanResponse>>> List(
        [FromQuery, Description("Omitted = all plans; active = InProgress; upcoming = NotStarted; completed = Completed (history). Case-insensitive.")] string? group,
        CancellationToken cancellationToken) =>
        Ok(await plans.ListAsync(PlanInputValidator.ParseGroupFilter(group), cancellationToken));

    /// <summary>Gets one plan with its items and progress. Deleted plans return 404.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType<PlanResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<PlanResponse>> GetById(int id, CancellationToken cancellationToken) =>
        Ok(await plans.GetAsync(id, cancellationToken));

    /// <summary>
    /// Creates a plan (items not done; status computed, e.g. InProgress if the window is open). Needs at least one item; each source must exist and not be
    /// deleted, without duplicates; end must be after start. Item errors are keyed by index, e.g. <c>items[1].sourceId</c>.
    /// </summary>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType<PlanResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<PlanResponse>> Create([FromBody] CreatePlanRequest? request, CancellationToken cancellationToken)
    {
        var plan = await plans.CreateAsync(request ?? new CreatePlanRequest(), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = plan.Id }, plan);
    }

    /// <summary>Replaces the plan metadata (title, duration, start/end, priority) and recomputes the status. Items cannot be changed.</summary>
    [HttpPut("{id:int}")]
    [Consumes("application/json")]
    [ProducesResponseType<PlanResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<PlanResponse>> Update(int id, [FromBody] UpdatePlanRequest? request, CancellationToken cancellationToken) =>
        Ok(await plans.UpdateAsync(id, request ?? new UpdatePlanRequest(), cancellationToken));

    /// <summary>Deletes a plan (soft delete, BR-14). Its items are no longer returned.</summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        await plans.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Marks one item done or not done and returns the full plan (refreshed progress and status: all done = Completed;
    /// un-marking inside the window = InProgress). isDone=true on a Task item also
    /// completes the task (BR-13); un-done does not revert it. Habit and learning items change only the item flag.
    /// </summary>
    [HttpPatch("{id:int}/items/{itemId:int}")]
    [Consumes("application/json")]
    [ProducesResponseType<PlanResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<PlanResponse>> SetItemDone(
        int id, int itemId, [FromBody] UpdatePlanItemRequest? request, CancellationToken cancellationToken) =>
        Ok(await plans.SetItemDoneAsync(id, itemId, request ?? new UpdatePlanItemRequest(), cancellationToken));
}
