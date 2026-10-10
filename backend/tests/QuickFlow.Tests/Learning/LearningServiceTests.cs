using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Application.Features.Learning;
using QuickFlow.Infrastructure.Persistence.Conventions;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Learning;

/// <summary>TR-1: learning service against the real AppDbContext conventions (in-memory provider).</summary>
public class LearningServiceTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 10, 8, 0, 0, TimeSpan.Zero);

    private readonly FixedTimeProvider _clock = new(T0);
    private readonly TestDbContext _db;
    private readonly LearningService _service;

    public LearningServiceTests()
    {
        _db = TestDbContext.CreateInMemory(_clock);
        _service = new LearningService(_db, _clock);
    }

    private async Task<LearningCardDetail> CreateCard(string title = "Card")
    {
        var card = await _service.CreateAsync(new CreateLearningCardRequest { Title = title });
        _clock.UtcNow = _clock.UtcNow.AddMinutes(1); // distinct timestamps
        return card;
    }

    private Task<LearningMilestoneResponse> AddMilestone(int cardId, string title = "Milestone") =>
        _service.AddMilestoneAsync(cardId, new CreateLearningMilestoneRequest { Title = title });

    private Task<LearningMilestoneResponse> SetDone(int cardId, LearningMilestoneResponse m, bool isDone) =>
        _service.UpdateMilestoneAsync(cardId, m.Id, new UpdateLearningMilestoneRequest { Title = m.Title, TargetDate = m.TargetDate, IsDone = isDone });

    /// <summary>Simulates a new request scope (nothing tracked).</summary>
    private void NewScope() => _db.ChangeTracker.Clear();

    [Fact]
    public async Task Create_card_defaults_to_NotStarted_with_empty_children()
    {
        var card = await _service.CreateAsync(new CreateLearningCardRequest { Title = "  Clean Code ", Description = "Book by R. Martin" });

        Assert.True(card.Id > 0);
        Assert.Equal("Clean Code", card.Title);
        Assert.Equal("Book by R. Martin", card.Description);
        Assert.Equal(LearningCardStatus.NotStarted, card.Status);
        Assert.Equal(T0.UtcDateTime, card.CreatedAt);
        Assert.Equal(0, card.MilestonesTotal);
        Assert.Equal(0, card.MilestonesDone);
        Assert.Empty(card.Milestones);
        Assert.Empty(card.Notes);
    }

    [Fact]
    public async Task Create_card_without_title_throws_and_saves_nothing()
    {
        var ex = await Assert.ThrowsAsync<ValidationException>(() => _service.CreateAsync(new CreateLearningCardRequest { Title = " " }));
        Assert.True(ex.Errors.ContainsKey("title"));
        Assert.Empty(await _service.ListAsync(null));
    }

    [Fact]
    public async Task Update_card_sets_user_status_independent_of_milestones()
    {
        var card = await CreateCard();
        var m = await AddMilestone(card.Id);
        await SetDone(card.Id, m, true);

        // A-12: all milestones done does not change status.
        Assert.Equal(LearningCardStatus.NotStarted, (await _service.GetAsync(card.Id)).Status);

        NewScope();
        var updated = await _service.UpdateAsync(card.Id, new UpdateLearningCardRequest { Title = "Renamed", Status = "InProgress" });

        Assert.Equal("Renamed", updated.Title);
        Assert.Null(updated.Description);
        Assert.Equal(LearningCardStatus.InProgress, updated.Status);
        Assert.Equal(1, updated.MilestonesDone);
        Assert.True(updated.UpdatedAt > updated.CreatedAt);
    }

    [Fact]
    public async Task Update_card_with_invalid_status_throws_validation()
    {
        var card = await CreateCard();
        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            _service.UpdateAsync(card.Id, new UpdateLearningCardRequest { Title = "t", Status = "Done" }));
        Assert.True(ex.Errors.ContainsKey("status"));
    }

    [Fact]
    public async Task Missing_card_is_not_found_everywhere()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _service.GetAsync(999));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.UpdateAsync(999, new UpdateLearningCardRequest { Title = "t", Status = "Completed" }));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.DeleteAsync(999));
        await Assert.ThrowsAsync<NotFoundException>(() => AddMilestone(999));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.AddNoteAsync(999, new CreateLearningNoteRequest { Text = "n" }));
    }

    [Fact]
    public async Task Milestone_without_title_is_rejected()
    {
        var card = await CreateCard();
        var ex = await Assert.ThrowsAsync<ValidationException>(() => AddMilestone(card.Id, "  "));
        Assert.True(ex.Errors.ContainsKey("title"));
        Assert.Equal(0, (await _service.GetAsync(card.Id)).MilestonesTotal);
    }

    [Fact]
    public async Task Add_milestone_is_not_done_and_keeps_target_date()
    {
        var card = await CreateCard();
        var m = await _service.AddMilestoneAsync(card.Id, new CreateLearningMilestoneRequest { Title = " Part 1 ", TargetDate = new DateOnly(2026, 11, 30) });

        Assert.Equal(card.Id, m.LearningCardId);
        Assert.Equal("Part 1", m.Title);
        Assert.False(m.IsDone);
        Assert.Null(m.CompletedAt);
        Assert.Equal(new DateOnly(2026, 11, 30), m.TargetDate);
    }

    [Fact]
    public async Task Completing_milestone_sets_CompletedAt_and_uncompleting_clears_it()
    {
        var card = await CreateCard();
        var m = await AddMilestone(card.Id);

        var done = await SetDone(card.Id, m, true);
        Assert.True(done.IsDone);
        Assert.Equal(_clock.UtcNow.UtcDateTime, done.CompletedAt);

        // Saving again while done keeps the original completion time.
        var originalCompletedAt = done.CompletedAt;
        _clock.UtcNow = _clock.UtcNow.AddHours(2);
        NewScope();
        var stillDone = await SetDone(card.Id, done, true);
        Assert.Equal(originalCompletedAt, stillDone.CompletedAt);

        NewScope();
        var undone = await SetDone(card.Id, stillDone, false);
        Assert.False(undone.IsDone);
        Assert.Null(undone.CompletedAt);

        NewScope();
        var detail = await _service.GetAsync(card.Id);
        Assert.Null(Assert.Single(detail.Milestones).CompletedAt);
    }

    [Fact]
    public async Task Update_milestone_replaces_title_and_target_date()
    {
        var card = await CreateCard();
        var m = await _service.AddMilestoneAsync(card.Id, new CreateLearningMilestoneRequest { Title = "Old", TargetDate = new DateOnly(2026, 12, 1) });

        var updated = await _service.UpdateMilestoneAsync(card.Id, m.Id, new UpdateLearningMilestoneRequest { Title = " New ", IsDone = false });

        Assert.Equal("New", updated.Title);
        Assert.Null(updated.TargetDate);
    }

    [Fact]
    public async Task Milestone_accessed_through_another_card_is_not_found()
    {
        var a = await CreateCard("A");
        var b = await CreateCard("B");
        var m = await AddMilestone(a.Id);

        await Assert.ThrowsAsync<NotFoundException>(() => SetDone(b.Id, m, true));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveMilestoneAsync(b.Id, m.Id));

        NewScope();
        var milestone = Assert.Single((await _service.GetAsync(a.Id)).Milestones);
        Assert.False(milestone.IsDone);
        Assert.Empty((await _service.GetAsync(b.Id)).Milestones);
    }

    [Fact]
    public async Task Note_accessed_through_another_card_is_not_found()
    {
        var a = await CreateCard("A");
        var b = await CreateCard("B");
        var note = await _service.AddNoteAsync(a.Id, new CreateLearningNoteRequest { Text = "n" });

        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveNoteAsync(b.Id, note.Id));
        Assert.Single((await _service.GetAsync(a.Id)).Notes);
    }

    [Fact]
    public async Task Remove_milestone_deletes_it_and_second_remove_is_not_found()
    {
        var card = await CreateCard();
        var keep = await AddMilestone(card.Id, "Keep");
        var drop = await AddMilestone(card.Id, "Drop");

        await _service.RemoveMilestoneAsync(card.Id, drop.Id);

        NewScope();
        Assert.Equal(keep.Id, Assert.Single((await _service.GetAsync(card.Id)).Milestones).Id);
        Assert.Null(await _db.Set<LearningMilestone>().IgnoreQueryFilters().FirstOrDefaultAsync(m => m.Id == drop.Id)); // hard delete
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveMilestoneAsync(card.Id, drop.Id));
    }

    [Fact]
    public async Task Add_note_has_timestamp_and_notes_are_oldest_first()
    {
        var card = await CreateCard();
        var first = await _service.AddNoteAsync(card.Id, new CreateLearningNoteRequest { Text = "  first  " });
        _clock.UtcNow = _clock.UtcNow.AddMinutes(5);
        var second = await _service.AddNoteAsync(card.Id, new CreateLearningNoteRequest { Text = "second" });

        Assert.Equal("first", first.Text);
        Assert.Equal(T0.UtcDateTime.AddMinutes(1), first.CreatedAt);
        Assert.Equal(first.CreatedAt.AddMinutes(5), second.CreatedAt);

        NewScope();
        var notes = (await _service.GetAsync(card.Id)).Notes;
        Assert.Equal([first.Id, second.Id], notes.Select(n => n.Id));
    }

    [Fact]
    public async Task Note_text_required_and_max_4000()
    {
        var card = await CreateCard();
        await Assert.ThrowsAsync<ValidationException>(() => _service.AddNoteAsync(card.Id, new CreateLearningNoteRequest { Text = " " }));
        await Assert.ThrowsAsync<ValidationException>(() => _service.AddNoteAsync(card.Id, new CreateLearningNoteRequest { Text = new string('x', 4001) }));
        var ok = await _service.AddNoteAsync(card.Id, new CreateLearningNoteRequest { Text = new string('x', 4000) });
        Assert.Equal(4000, ok.Text.Length);
    }

    [Fact]
    public async Task Remove_note_deletes_it_and_second_remove_is_not_found()
    {
        var card = await CreateCard();
        var note = await _service.AddNoteAsync(card.Id, new CreateLearningNoteRequest { Text = "n" });

        await _service.RemoveNoteAsync(card.Id, note.Id);

        NewScope();
        Assert.Empty((await _service.GetAsync(card.Id)).Notes);
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveNoteAsync(card.Id, note.Id));
    }

    [Fact]
    public async Task Milestone_counts_are_correct_in_list_and_detail()
    {
        var a = await CreateCard("A");
        var b = await CreateCard("B");
        var empty = await CreateCard("Empty");
        var a1 = await AddMilestone(a.Id);
        await AddMilestone(a.Id);
        var a3 = await AddMilestone(a.Id);
        var b1 = await AddMilestone(b.Id);
        await SetDone(a.Id, a1, true);
        await SetDone(a.Id, a3, true);
        await SetDone(b.Id, b1, true);
        await SetDone(b.Id, b1, false);

        NewScope();
        var list = await _service.ListAsync(null);

        Assert.Equal([a.Id, b.Id, empty.Id], list.Select(c => c.Id));
        Assert.Equal((3, 2), (list[0].MilestonesTotal, list[0].MilestonesDone));
        Assert.Equal((1, 0), (list[1].MilestonesTotal, list[1].MilestonesDone));
        Assert.Equal((0, 0), (list[2].MilestonesTotal, list[2].MilestonesDone));

        var detail = await _service.GetAsync(a.Id);
        Assert.Equal(3, detail.MilestonesTotal);
        Assert.Equal(2, detail.MilestonesDone);
    }

    [Fact]
    public async Task List_filters_by_status()
    {
        var a = await CreateCard("A");
        var b = await CreateCard("B");
        await AddMilestone(b.Id);
        await _service.UpdateAsync(b.Id, new UpdateLearningCardRequest { Title = "B", Status = "InProgress" });

        NewScope();
        var inProgress = Assert.Single(await _service.ListAsync("InProgress"));
        Assert.Equal(b.Id, inProgress.Id);
        Assert.Equal(1, inProgress.MilestonesTotal);
        Assert.Equal(a.Id, Assert.Single(await _service.ListAsync("notstarted")).Id);
        Assert.Empty(await _service.ListAsync("Completed"));
        await Assert.ThrowsAsync<ValidationException>(() => _service.ListAsync("Done"));
    }

    [Fact]
    public async Task Deleting_card_hides_it_with_its_milestones_and_notes()
    {
        var card = await CreateCard();
        var other = await CreateCard("Other");
        var m = await AddMilestone(card.Id);
        var note = await _service.AddNoteAsync(card.Id, new CreateLearningNoteRequest { Text = "n" });
        await AddMilestone(other.Id);

        // New request scope, as in the API: only the card is loaded and tracked by DeleteAsync
        // (tracked children would otherwise be cascade-deleted by the change tracker).
        NewScope();
        await _service.DeleteAsync(card.Id);
        NewScope();

        await Assert.ThrowsAsync<NotFoundException>(() => _service.GetAsync(card.Id));
        Assert.Equal(other.Id, Assert.Single(await _service.ListAsync(null)).Id);
        Assert.Single(await _db.Set<LearningMilestone>().ToListAsync()); // only the other card's milestone
        Assert.Empty(await _db.Set<LearningNote>().ToListAsync());

        // Routes through the deleted card are 404.
        await Assert.ThrowsAsync<NotFoundException>(() => SetDone(card.Id, m, true));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveMilestoneAsync(card.Id, m.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RemoveNoteAsync(card.Id, note.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => AddMilestone(card.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _service.DeleteAsync(card.Id));

        // Soft delete: rows are kept.
        var stored = await _db.Set<LearningCard>().IgnoreQueryFilters([SoftDeleteModelBuilderExtensions.SoftDeleteFilter]).SingleAsync(c => c.Id == card.Id);
        Assert.True(stored.IsDeleted);
        Assert.Equal(2, await _db.Set<LearningMilestone>().IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task Exists_and_titles_for_other_modules()
    {
        var a = await CreateCard("Alpha");
        var b = await CreateCard("Beta");
        await _service.DeleteAsync(b.Id);
        NewScope();

        Assert.True(await _service.ExistsAsync(a.Id));
        Assert.False(await _service.ExistsAsync(b.Id));
        Assert.False(await _service.ExistsAsync(999));

        var titles = await _service.GetTitlesAsync([a.Id, b.Id, 999]);
        Assert.Equal(new Dictionary<int, string> { [a.Id] = "Alpha" }, titles);

        var withDeleted = await _service.GetTitlesAsync([a.Id, b.Id, 999], includeDeleted: true);
        Assert.Equal(new Dictionary<int, string> { [a.Id] = "Alpha", [b.Id] = "Beta" }, withDeleted);

        Assert.Empty(await _service.GetTitlesAsync([]));
    }
}
