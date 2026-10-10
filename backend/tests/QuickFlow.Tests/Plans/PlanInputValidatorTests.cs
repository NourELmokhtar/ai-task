using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Plans;
using QuickFlow.Application.Features.Plans;

namespace QuickFlow.Tests.Plans;

/// <summary>TR-1: plan validation (BR-10 structure, BR-11, A-14..A-17).</summary>
public class PlanInputValidatorTests
{
    private static readonly DateTime Start = new(2026, 10, 10, 9, 0, 0, DateTimeKind.Utc);

    private static CreatePlanRequest Valid() => new()
    {
        Title = "Morning plan",
        EstimatedDurationMinutes = 90,
        StartDateTime = Start,
        EndDateTime = Start.AddHours(2),
        PriorityOrder = 1,
        Items = [new CreatePlanItemRequest { SourceType = "Task", SourceId = 1 }],
    };

    private static Dictionary<string, string[]> Errors(CreatePlanRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        PlanInputValidator.Validate(request, errors);
        return errors;
    }

    private static UpdatePlanRequest ValidUpdate() => new()
    {
        Title = "Plan",
        EstimatedDurationMinutes = 30,
        StartDateTime = Start,
        EndDateTime = Start.AddHours(1),
        PriorityOrder = 2,
    };

    [Fact]
    public void Valid_request_has_no_errors_and_is_normalized()
    {
        var request = Valid();
        request.Title = "  Morning plan ";
        request.Items!.Add(new CreatePlanItemRequest { SourceType = "habit", SourceId = 1 }); // same id, other type: not a duplicate
        request.Items.Add(new CreatePlanItemRequest { SourceType = "LearningResource", SourceId = 4 });

        var errors = new Dictionary<string, string[]>();
        var input = PlanInputValidator.Validate(request, errors);

        Assert.Empty(errors);
        Assert.Equal("Morning plan", input.Metadata.Title);
        Assert.Equal(
            [new PlanItemInput(0, PlanItemSourceType.Task, 1), new PlanItemInput(1, PlanItemSourceType.Habit, 1), new PlanItemInput(2, PlanItemSourceType.LearningResource, 4)],
            input.Items);
    }

    [Fact]
    public void Empty_items_are_invalid()
    {
        var request = Valid();
        request.Items = [];
        Assert.Equal([PlanInputValidator.ItemsRequired], Errors(request)["items"]);

        request.Items = null;
        Assert.Equal([PlanInputValidator.ItemsRequired], Errors(request)["items"]);
    }

    [Fact]
    public void Duplicate_item_is_invalid_and_names_the_index()
    {
        var request = Valid();
        request.Items!.Add(new CreatePlanItemRequest { SourceType = "Habit", SourceId = 2 });
        request.Items.Add(new CreatePlanItemRequest { SourceType = "task", SourceId = 1 });

        var errors = Errors(request);

        Assert.Equal(["Duplicate item: Task 1 is already in the plan (items[0])."], errors["items[2]"]);
        Assert.Single(errors);
    }

    [Fact]
    public void Item_structure_errors_are_keyed_by_index()
    {
        var request = Valid();
        request.Items = [
            new CreatePlanItemRequest { SourceType = "Task", SourceId = 1 },
            new CreatePlanItemRequest { SourceType = "Book", SourceId = 2 },
            new CreatePlanItemRequest { SourceId = 3 },
            new CreatePlanItemRequest { SourceType = "Habit" },
            null,
            new CreatePlanItemRequest { SourceType = "1", SourceId = 5 },
        ];

        var errors = Errors(request);

        Assert.Equal([PlanInputValidator.SourceTypeInvalid], errors["items[1].sourceType"]);
        Assert.Equal([PlanInputValidator.SourceTypeRequired], errors["items[2].sourceType"]);
        Assert.Equal([PlanInputValidator.SourceIdRequired], errors["items[3].sourceId"]);
        Assert.Equal([PlanInputValidator.ItemRequired], errors["items[4]"]);
        Assert.Equal([PlanInputValidator.SourceTypeInvalid], errors["items[5].sourceType"]);
        Assert.Equal(5, errors.Count);
    }

    [Theory]
    [InlineData(0)]     // end == start
    [InlineData(-30)]   // end before start
    public void End_not_after_start_is_invalid(int endOffsetMinutes)
    {
        var request = Valid();
        request.EndDateTime = Start.AddMinutes(endOffsetMinutes);
        Assert.Equal([PlanInputValidator.EndNotAfterStart], Errors(request)["endDateTime"]);

        var update = ValidUpdate();
        update.EndDateTime = Start.AddMinutes(endOffsetMinutes);
        var ex = Assert.Throws<ValidationException>(() => PlanInputValidator.Validate(update));
        Assert.Equal([PlanInputValidator.EndNotAfterStart], ex.Errors["endDateTime"]);
    }

    [Fact]
    public void Start_and_end_compare_in_utc()
    {
        // 12:00+03:00 = 09:00Z, which is not after the 09:00Z start.
        var request = Valid();
        request.EndDateTime = new DateTimeOffset(2026, 10, 10, 12, 0, 0, TimeSpan.FromHours(3)).LocalDateTime;
        Assert.True(Errors(request).ContainsKey("endDateTime"));

        // Unspecified kind is treated as UTC.
        request.EndDateTime = DateTime.SpecifyKind(Start.AddMinutes(1), DateTimeKind.Unspecified);
        var errors = new Dictionary<string, string[]>();
        var input = PlanInputValidator.Validate(request, errors);
        Assert.Empty(errors);
        Assert.Equal(DateTimeKind.Utc, input.Metadata.EndDateTime.Kind);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void Duration_not_positive_is_invalid(int minutes)
    {
        var request = Valid();
        request.EstimatedDurationMinutes = minutes;
        Assert.Equal([PlanInputValidator.DurationNotPositive], Errors(request)["estimatedDurationMinutes"]);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Priority_below_one_is_invalid(int priority)
    {
        var request = Valid();
        request.PriorityOrder = priority;
        Assert.Equal([PlanInputValidator.PriorityTooLow], Errors(request)["priorityOrder"]);
    }

    [Fact]
    public void Missing_fields_are_all_reported()
    {
        var errors = Errors(new CreatePlanRequest());

        Assert.Equal([PlanInputValidator.TitleRequired], errors["title"]);
        Assert.Equal([PlanInputValidator.DurationRequired], errors["estimatedDurationMinutes"]);
        Assert.Equal([PlanInputValidator.StartRequired], errors["startDateTime"]);
        Assert.Equal([PlanInputValidator.EndRequired], errors["endDateTime"]);
        Assert.Equal([PlanInputValidator.PriorityRequired], errors["priorityOrder"]);
        Assert.Equal([PlanInputValidator.ItemsRequired], errors["items"]);
    }

    [Fact]
    public void Title_is_required_and_at_most_200()
    {
        var request = Valid();
        request.Title = "   ";
        Assert.Equal([PlanInputValidator.TitleRequired], Errors(request)["title"]);

        request.Title = new string('a', 201);
        Assert.Equal([PlanInputValidator.TitleTooLong], Errors(request)["title"]);

        request.Title = new string('a', 200);
        Assert.Empty(Errors(request));
    }

    [Fact]
    public void Update_accepts_valid_metadata_and_duplicate_priorities()
    {
        var metadata = PlanInputValidator.Validate(ValidUpdate());
        Assert.Equal(new PlanMetadataInput("Plan", 30, Start, Start.AddHours(1), 2), metadata);
    }

    [Fact]
    public void Item_isDone_is_required()
    {
        var ex = Assert.Throws<ValidationException>(() => PlanInputValidator.Validate(new UpdatePlanItemRequest()));
        Assert.Equal([PlanInputValidator.IsDoneRequired], ex.Errors["isDone"]);
        Assert.True(PlanInputValidator.Validate(new UpdatePlanItemRequest { IsDone = true }));
    }
}
