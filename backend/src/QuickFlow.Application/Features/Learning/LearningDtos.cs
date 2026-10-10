using System.ComponentModel;
using QuickFlow.Application.Domain.Learning;

namespace QuickFlow.Application.Features.Learning;

/// <summary>Learning card in the list, with milestone counts.</summary>
public sealed record LearningCardSummary(
    int Id,
    string Title,
    string? Description,
    LearningCardStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int MilestonesTotal,
    int MilestonesDone)
{
    public static LearningCardSummary From(LearningCard card, int milestonesTotal, int milestonesDone) => new(
        card.Id,
        card.Title,
        card.Description,
        card.Status,
        card.CreatedAt,
        card.UpdatedAt,
        milestonesTotal,
        milestonesDone);
}

/// <summary>Learning card with its milestones (creation order) and notes (oldest first).</summary>
public sealed record LearningCardDetail(
    int Id,
    string Title,
    string? Description,
    LearningCardStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int MilestonesTotal,
    int MilestonesDone,
    IReadOnlyList<LearningMilestoneResponse> Milestones,
    IReadOnlyList<LearningNoteResponse> Notes)
{
    public static LearningCardDetail From(LearningCard card, IReadOnlyList<LearningMilestone> milestones, IReadOnlyList<LearningNote> notes) => new(
        card.Id,
        card.Title,
        card.Description,
        card.Status,
        card.CreatedAt,
        card.UpdatedAt,
        milestones.Count,
        milestones.Count(m => m.IsDone),
        milestones.Select(LearningMilestoneResponse.From).ToList(),
        notes.Select(LearningNoteResponse.From).ToList());
}

/// <summary>One milestone. <c>completedAt</c> is set when <c>isDone</c> becomes true and cleared when it becomes false (A-13).</summary>
public sealed record LearningMilestoneResponse(int Id, int LearningCardId, string Title, bool IsDone, DateOnly? TargetDate, DateTime? CompletedAt)
{
    public static LearningMilestoneResponse From(LearningMilestone milestone) => new(
        milestone.Id,
        milestone.LearningCardId,
        milestone.Title,
        milestone.IsDone,
        milestone.TargetDate,
        milestone.CompletedAt);
}

/// <summary>One note.</summary>
public sealed record LearningNoteResponse(int Id, int LearningCardId, string Text, DateTime CreatedAt)
{
    public static LearningNoteResponse From(LearningNote note) => new(note.Id, note.LearningCardId, note.Text, note.CreatedAt);
}

/// <summary>Body of <c>POST /api/learning-cards</c>. New cards start with status NotStarted.</summary>
public sealed class CreateLearningCardRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Optional description or source (link, book, course). Up to 2000 characters. Empty or whitespace-only is stored as null.")]
    public string? Description { get; set; }
}

/// <summary>
/// Body of <c>PUT /api/learning-cards/{id}</c>. Full replacement of the editable fields (an omitted description is cleared).
/// Status is a string validated by the service so that an invalid value produces <c>errors.status</c>.
/// </summary>
public sealed class UpdateLearningCardRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Optional. Up to 2000 characters. Null, empty or whitespace-only clears it.")]
    public string? Description { get; set; }

    [Description("Required. One of: NotStarted, InProgress, Completed. Set by the user; not derived from milestones.")]
    public string? Status { get; set; }
}

/// <summary>Body of <c>POST /api/learning-cards/{id}/milestones</c>. New milestones are not done.</summary>
public sealed class CreateLearningMilestoneRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Optional target date, YYYY-MM-DD.")]
    public DateOnly? TargetDate { get; set; }
}

/// <summary>Body of <c>PUT /api/learning-cards/{id}/milestones/{milestoneId}</c>. Full replacement (an omitted targetDate is cleared).</summary>
public sealed class UpdateLearningMilestoneRequest
{
    [Description("Required. Trimmed; 1-200 characters.")]
    public string? Title { get; set; }

    [Description("Optional target date, YYYY-MM-DD. Null or omitted clears it.")]
    public DateOnly? TargetDate { get; set; }

    [Description("Required. true sets completedAt to now (kept if already done); false clears completedAt.")]
    public bool? IsDone { get; set; }
}

/// <summary>Body of <c>POST /api/learning-cards/{id}/notes</c>.</summary>
public sealed class CreateLearningNoteRequest
{
    [Description("Required. Trimmed; 1-4000 characters.")]
    public string? Text { get; set; }
}
