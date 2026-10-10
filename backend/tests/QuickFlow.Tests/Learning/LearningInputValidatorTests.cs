using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Learning;
using QuickFlow.Application.Features.Learning;

namespace QuickFlow.Tests.Learning;

/// <summary>TR-1: BR-08 (card title), A-14 (milestone title, note text), status enum.</summary>
public class LearningInputValidatorTests
{
    private static ValidationException Fails(Action act) => Assert.Throws<ValidationException>(act);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Card_title_is_required_on_create(string? title)
    {
        var ex = Fails(() => LearningInputValidator.Validate(new CreateLearningCardRequest { Title = title }));
        Assert.Equal([LearningInputValidator.TitleRequired], ex.Errors["title"]);
    }

    [Fact]
    public void Card_title_is_required_on_update()
    {
        var ex = Fails(() => LearningInputValidator.Validate(new UpdateLearningCardRequest { Title = " ", Status = "InProgress" }));
        Assert.Equal([LearningInputValidator.TitleRequired], ex.Errors["title"]);
        Assert.False(ex.Errors.ContainsKey("status"));
    }

    [Fact]
    public void Card_title_max_200_after_trimming()
    {
        var ok = LearningInputValidator.Validate(new CreateLearningCardRequest { Title = "  " + new string('a', 200) + "  " });
        Assert.Equal(200, ok.Title.Length);

        var ex = Fails(() => LearningInputValidator.Validate(new CreateLearningCardRequest { Title = new string('a', 201) }));
        Assert.Equal([LearningInputValidator.TitleTooLong], ex.Errors["title"]);
    }

    [Fact]
    public void Create_normalizes_and_defaults_status_to_NotStarted()
    {
        var input = LearningInputValidator.Validate(new CreateLearningCardRequest { Title = "  Rust book ", Description = "  " });

        Assert.Equal("Rust book", input.Title);
        Assert.Null(input.Description);
        Assert.Equal(LearningCardStatus.NotStarted, input.Status);
    }

    [Fact]
    public void Description_max_2000()
    {
        LearningInputValidator.Validate(new CreateLearningCardRequest { Title = "t", Description = new string('d', 2000) });

        var ex = Fails(() => LearningInputValidator.Validate(new CreateLearningCardRequest { Title = "t", Description = new string('d', 2001) }));
        Assert.Equal([LearningInputValidator.DescriptionTooLong], ex.Errors["description"]);
    }

    [Theory]
    [InlineData("NotStarted", LearningCardStatus.NotStarted)]
    [InlineData("inprogress", LearningCardStatus.InProgress)]
    [InlineData(" Completed ", LearningCardStatus.Completed)]
    public void Update_accepts_status_names_case_insensitively(string status, LearningCardStatus expected)
    {
        var input = LearningInputValidator.Validate(new UpdateLearningCardRequest { Title = "t", Status = status });
        Assert.Equal(expected, input.Status);
    }

    [Theory]
    [InlineData("Done")]
    [InlineData("1")]
    [InlineData("In Progress")]
    public void Update_rejects_invalid_status(string status)
    {
        var ex = Fails(() => LearningInputValidator.Validate(new UpdateLearningCardRequest { Title = "t", Status = status }));
        Assert.Equal([LearningInputValidator.StatusInvalid], ex.Errors["status"]);
    }

    [Fact]
    public void Update_requires_status_and_collects_all_errors()
    {
        var ex = Fails(() => LearningInputValidator.Validate(new UpdateLearningCardRequest()));
        Assert.Equal([LearningInputValidator.TitleRequired], ex.Errors["title"]);
        Assert.Equal([LearningInputValidator.StatusRequired], ex.Errors["status"]);
    }

    [Fact]
    public void Status_filter_parses_or_rejects()
    {
        Assert.Null(LearningInputValidator.ParseStatusFilter(null));
        Assert.Null(LearningInputValidator.ParseStatusFilter(" "));
        Assert.Equal(LearningCardStatus.Completed, LearningInputValidator.ParseStatusFilter("completed"));

        var ex = Fails(() => LearningInputValidator.ParseStatusFilter("Archived"));
        Assert.Equal([LearningInputValidator.StatusInvalid], ex.Errors["status"]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void Milestone_title_is_required(string? title)
    {
        var create = Fails(() => LearningInputValidator.Validate(new CreateLearningMilestoneRequest { Title = title }));
        Assert.Equal([LearningInputValidator.TitleRequired], create.Errors["title"]);

        var update = Fails(() => LearningInputValidator.Validate(new UpdateLearningMilestoneRequest { Title = title, IsDone = true }));
        Assert.Equal([LearningInputValidator.TitleRequired], update.Errors["title"]);
    }

    [Fact]
    public void Milestone_title_max_200()
    {
        LearningInputValidator.Validate(new CreateLearningMilestoneRequest { Title = new string('m', 200) });

        var ex = Fails(() => LearningInputValidator.Validate(new CreateLearningMilestoneRequest { Title = new string('m', 201) }));
        Assert.Equal([LearningInputValidator.MilestoneTitleTooLong], ex.Errors["title"]);
    }

    [Fact]
    public void Milestone_create_trims_and_is_not_done()
    {
        var input = LearningInputValidator.Validate(new CreateLearningMilestoneRequest { Title = " Ch. 1 ", TargetDate = new DateOnly(2026, 11, 1) });

        Assert.Equal("Ch. 1", input.Title);
        Assert.Equal(new DateOnly(2026, 11, 1), input.TargetDate);
        Assert.False(input.IsDone);
    }

    [Fact]
    public void Milestone_update_requires_isDone()
    {
        var ex = Fails(() => LearningInputValidator.Validate(new UpdateLearningMilestoneRequest { Title = "m" }));
        Assert.Equal([LearningInputValidator.IsDoneRequired], ex.Errors["isDone"]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" \n ")]
    public void Note_text_is_required(string? text)
    {
        var ex = Fails(() => LearningInputValidator.Validate(new CreateLearningNoteRequest { Text = text }));
        Assert.Equal([LearningInputValidator.TextRequired], ex.Errors["text"]);
    }

    [Fact]
    public void Note_text_max_4000_after_trimming()
    {
        Assert.Equal(4000, LearningInputValidator.Validate(new CreateLearningNoteRequest { Text = " " + new string('n', 4000) + " " }).Length);

        var ex = Fails(() => LearningInputValidator.Validate(new CreateLearningNoteRequest { Text = new string('n', 4001) }));
        Assert.Equal([LearningInputValidator.TextTooLong], ex.Errors["text"]);
    }
}
