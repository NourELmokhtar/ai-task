using Microsoft.EntityFrameworkCore;
using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Application.Domain.Learning;

namespace QuickFlow.Application.Features.Learning;

public sealed class LearningService(IApplicationDbContext db, TimeProvider timeProvider) : ILearningService
{
    private const string CardResource = "Learning card";

    private DbSet<LearningCard> Cards => db.Set<LearningCard>();

    /// <summary>The soft-delete query filter on milestones hides milestones of deleted cards (BR-14).</summary>
    private DbSet<LearningMilestone> Milestones => db.Set<LearningMilestone>();

    /// <summary>The soft-delete query filter on notes hides notes of deleted cards (BR-14).</summary>
    private DbSet<LearningNote> Notes => db.Set<LearningNote>();

    private DateTime UtcNow => timeProvider.GetUtcNow().UtcDateTime;

    public async Task<IReadOnlyList<LearningCardSummary>> ListAsync(string? status, CancellationToken cancellationToken = default)
    {
        var statusFilter = LearningInputValidator.ParseStatusFilter(status);

        IQueryable<LearningCard> cards = Cards.AsNoTracking();
        IQueryable<LearningMilestone> milestones = Milestones.AsNoTracking();
        if (statusFilter is { } s)
        {
            cards = cards.Where(c => c.Status == s);
            milestones = milestones.Where(m => m.LearningCard.Status == s);
        }

        var list = await cards.OrderBy(c => c.CreatedAt).ThenBy(c => c.Id).ToListAsync(cancellationToken);
        var doneByCard = (await milestones.Select(m => new { m.LearningCardId, m.IsDone }).ToListAsync(cancellationToken))
            .ToLookup(m => m.LearningCardId, m => m.IsDone);

        return list
            .Select(c => LearningCardSummary.From(c, doneByCard[c.Id].Count(), doneByCard[c.Id].Count(done => done)))
            .ToList();
    }

    public async Task<LearningCardDetail> GetAsync(int id, CancellationToken cancellationToken = default)
    {
        var card = await Cards.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new NotFoundException(CardResource, id);
        return await ToDetailAsync(card, cancellationToken);
    }

    public async Task<LearningCardDetail> CreateAsync(CreateLearningCardRequest request, CancellationToken cancellationToken = default)
    {
        var input = LearningInputValidator.Validate(request);
        var card = new LearningCard
        {
            Title = input.Title,
            Description = input.Description,
            Status = input.Status,
        };

        Cards.Add(card);
        await db.SaveChangesAsync(cancellationToken);
        return LearningCardDetail.From(card, [], []);
    }

    public async Task<LearningCardDetail> UpdateAsync(int id, UpdateLearningCardRequest request, CancellationToken cancellationToken = default)
    {
        var card = await FindCardAsync(id, cancellationToken);
        var input = LearningInputValidator.Validate(request);

        card.Title = input.Title;
        card.Description = input.Description;
        card.Status = input.Status; // A-12: user-set, never derived from milestones.

        await db.SaveChangesAsync(cancellationToken);
        return await ToDetailAsync(card, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var card = await FindCardAsync(id, cancellationToken);
        Cards.Remove(card); // AppDbContext converts this into a soft delete (BR-14).
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<LearningMilestoneResponse> AddMilestoneAsync(int cardId, CreateLearningMilestoneRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCardExistsAsync(cardId, cancellationToken);
        var input = LearningInputValidator.Validate(request);

        var milestone = new LearningMilestone
        {
            LearningCardId = cardId,
            Title = input.Title,
            TargetDate = input.TargetDate,
            IsDone = false,
            CompletedAt = null,
        };

        Milestones.Add(milestone);
        await db.SaveChangesAsync(cancellationToken);
        return LearningMilestoneResponse.From(milestone);
    }

    public async Task<LearningMilestoneResponse> UpdateMilestoneAsync(
        int cardId, int milestoneId, UpdateLearningMilestoneRequest request, CancellationToken cancellationToken = default)
    {
        var milestone = await FindMilestoneAsync(cardId, milestoneId, cancellationToken);
        var input = LearningInputValidator.Validate(request);

        milestone.Title = input.Title;
        milestone.TargetDate = input.TargetDate;

        // A-13: becoming done stamps CompletedAt; staying done keeps the original time; not done clears it.
        if (input.IsDone && !milestone.IsDone) milestone.CompletedAt = UtcNow;
        else if (!input.IsDone) milestone.CompletedAt = null;
        milestone.IsDone = input.IsDone;

        await db.SaveChangesAsync(cancellationToken);
        return LearningMilestoneResponse.From(milestone);
    }

    public async Task RemoveMilestoneAsync(int cardId, int milestoneId, CancellationToken cancellationToken = default)
    {
        var milestone = await FindMilestoneAsync(cardId, milestoneId, cancellationToken);
        Milestones.Remove(milestone); // Hard delete (milestones are not soft-deletable).
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<LearningNoteResponse> AddNoteAsync(int cardId, CreateLearningNoteRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCardExistsAsync(cardId, cancellationToken);
        var text = LearningInputValidator.Validate(request);

        var note = new LearningNote { LearningCardId = cardId, Text = text, CreatedAt = UtcNow };
        Notes.Add(note);
        await db.SaveChangesAsync(cancellationToken);
        return LearningNoteResponse.From(note);
    }

    public async Task RemoveNoteAsync(int cardId, int noteId, CancellationToken cancellationToken = default)
    {
        await EnsureCardExistsAsync(cardId, cancellationToken);

        // BR-09: the note must belong to this card.
        var note = await Notes.FirstOrDefaultAsync(n => n.Id == noteId && n.LearningCardId == cardId, cancellationToken)
            ?? throw new NotFoundException($"Note with id '{noteId}' was not found on learning card '{cardId}'.");

        Notes.Remove(note); // Hard delete (notes are not soft-deletable).
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task<bool> ExistsAsync(int id, CancellationToken cancellationToken = default) =>
        Cards.AsNoTracking().AnyAsync(c => c.Id == id, cancellationToken);

    public async Task<IReadOnlyDictionary<int, string>> GetTitlesAsync(
        IEnumerable<int> ids, bool includeDeleted = false, CancellationToken cancellationToken = default)
    {
        var wanted = ids.ToHashSet();
        if (wanted.Count == 0)
        {
            return new Dictionary<int, string>();
        }

        // LearningCard's only query filter is the soft-delete filter, so ignoring all filters includes deleted cards.
        IQueryable<LearningCard> cards = Cards.AsNoTracking();
        if (includeDeleted) cards = cards.IgnoreQueryFilters();

        // Filtered in memory (small, single-user data set); avoids relying on provider support for list parameters.
        var all = await cards.Select(c => new { c.Id, c.Title }).ToListAsync(cancellationToken);
        return all.Where(c => wanted.Contains(c.Id)).ToDictionary(c => c.Id, c => c.Title);
    }

    private async Task<LearningCardDetail> ToDetailAsync(LearningCard card, CancellationToken cancellationToken)
    {
        var milestones = await Milestones.AsNoTracking()
            .Where(m => m.LearningCardId == card.Id)
            .OrderBy(m => m.Id)
            .ToListAsync(cancellationToken);
        var notes = await Notes.AsNoTracking()
            .Where(n => n.LearningCardId == card.Id)
            .OrderBy(n => n.CreatedAt).ThenBy(n => n.Id)
            .ToListAsync(cancellationToken);
        return LearningCardDetail.From(card, milestones, notes);
    }

    /// <summary>Tracked lookup; the soft-delete query filter makes deleted cards "not found".</summary>
    private async Task<LearningCard> FindCardAsync(int id, CancellationToken cancellationToken) =>
        await Cards.FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
        ?? throw new NotFoundException(CardResource, id);

    private async Task EnsureCardExistsAsync(int id, CancellationToken cancellationToken)
    {
        if (!await ExistsAsync(id, cancellationToken))
        {
            throw new NotFoundException(CardResource, id);
        }
    }

    /// <summary>BR-09: the card must exist (not deleted) and the milestone must belong to it.</summary>
    private async Task<LearningMilestone> FindMilestoneAsync(int cardId, int milestoneId, CancellationToken cancellationToken)
    {
        await EnsureCardExistsAsync(cardId, cancellationToken);
        return await Milestones.FirstOrDefaultAsync(m => m.Id == milestoneId && m.LearningCardId == cardId, cancellationToken)
            ?? throw new NotFoundException($"Milestone with id '{milestoneId}' was not found on learning card '{cardId}'.");
    }
}
