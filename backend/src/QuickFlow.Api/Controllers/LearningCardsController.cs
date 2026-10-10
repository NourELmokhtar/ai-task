using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;
using QuickFlow.Application.Features.Learning;

namespace QuickFlow.Api.Controllers;

/// <summary>
/// Learning resources (M04): cards with milestones and notes. Milestone and note routes return 404 when the card is
/// missing or deleted, or when the milestone/note belongs to a different card (BR-09).
/// </summary>
[ApiController]
[Route("api/learning-cards")]
[Tags("LearningCards")]
[Produces("application/json")]
public sealed class LearningCardsController(ILearningService learning) : ControllerBase
{
    /// <summary>Lists learning cards (oldest first) with milestone counts.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<LearningCardSummary>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<IReadOnlyList<LearningCardSummary>>> List(
        [FromQuery, Description("Omitted = all cards; otherwise NotStarted | InProgress | Completed.")] string? status,
        CancellationToken cancellationToken) =>
        Ok(await learning.ListAsync(status, cancellationToken));

    /// <summary>Gets one card with its milestones and notes. Deleted cards return 404.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType<LearningCardDetail>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<LearningCardDetail>> GetById(int id, CancellationToken cancellationToken) =>
        Ok(await learning.GetAsync(id, cancellationToken));

    /// <summary>Creates a card with status NotStarted.</summary>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType<LearningCardDetail>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<LearningCardDetail>> Create([FromBody] CreateLearningCardRequest? request, CancellationToken cancellationToken)
    {
        var card = await learning.CreateAsync(request ?? new CreateLearningCardRequest(), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = card.Id }, card);
    }

    /// <summary>Replaces title, description and status (status is user-set, not derived from milestones).</summary>
    [HttpPut("{id:int}")]
    [Consumes("application/json")]
    [ProducesResponseType<LearningCardDetail>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<LearningCardDetail>> Update(int id, [FromBody] UpdateLearningCardRequest? request, CancellationToken cancellationToken) =>
        Ok(await learning.UpdateAsync(id, request ?? new UpdateLearningCardRequest(), cancellationToken));

    /// <summary>Deletes a card (soft delete, BR-14). Its milestones and notes are no longer returned.</summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        await learning.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    /// <summary>Adds a milestone (not done) to the card. Location points to the card.</summary>
    [HttpPost("{id:int}/milestones")]
    [Consumes("application/json")]
    [ProducesResponseType<LearningMilestoneResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<LearningMilestoneResponse>> AddMilestone(
        int id, [FromBody] CreateLearningMilestoneRequest? request, CancellationToken cancellationToken)
    {
        var milestone = await learning.AddMilestoneAsync(id, request ?? new CreateLearningMilestoneRequest(), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id }, milestone);
    }

    /// <summary>Replaces a milestone's title, targetDate and isDone. isDone=true sets completedAt; false clears it.</summary>
    [HttpPut("{id:int}/milestones/{milestoneId:int}")]
    [Consumes("application/json")]
    [ProducesResponseType<LearningMilestoneResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<LearningMilestoneResponse>> UpdateMilestone(
        int id, int milestoneId, [FromBody] UpdateLearningMilestoneRequest? request, CancellationToken cancellationToken) =>
        Ok(await learning.UpdateMilestoneAsync(id, milestoneId, request ?? new UpdateLearningMilestoneRequest(), cancellationToken));

    /// <summary>Removes a milestone from the card.</summary>
    [HttpDelete("{id:int}/milestones/{milestoneId:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<IActionResult> RemoveMilestone(int id, int milestoneId, CancellationToken cancellationToken)
    {
        await learning.RemoveMilestoneAsync(id, milestoneId, cancellationToken);
        return NoContent();
    }

    /// <summary>Adds a timestamped note to the card. Location points to the card.</summary>
    [HttpPost("{id:int}/notes")]
    [Consumes("application/json")]
    [ProducesResponseType<LearningNoteResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<ActionResult<LearningNoteResponse>> AddNote(
        int id, [FromBody] CreateLearningNoteRequest? request, CancellationToken cancellationToken)
    {
        var note = await learning.AddNoteAsync(id, request ?? new CreateLearningNoteRequest(), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id }, note);
    }

    /// <summary>Removes a note from the card.</summary>
    [HttpDelete("{id:int}/notes/{noteId:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public async Task<IActionResult> RemoveNote(int id, int noteId, CancellationToken cancellationToken)
    {
        await learning.RemoveNoteAsync(id, noteId, cancellationToken);
        return NoContent();
    }
}
