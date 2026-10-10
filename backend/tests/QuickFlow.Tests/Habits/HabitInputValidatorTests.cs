using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Habits;
using QuickFlow.Application.Features.Habits;

namespace QuickFlow.Tests.Habits;

/// <summary>TR-1: habit validation (BR-06, frequency, A-11).</summary>
public class HabitInputValidatorTests
{
    private static readonly DateOnly Today = new(2026, 10, 10);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Missing_or_blank_name_is_invalid(string? name)
    {
        var ex = Assert.Throws<ValidationException>(() =>
            HabitInputValidator.Validate(new CreateHabitRequest { Name = name, Frequency = "Daily" }));
        Assert.Equal([HabitInputValidator.NameRequired], ex.Errors["name"]);
    }

    [Fact]
    public void Name_of_151_characters_is_invalid()
    {
        var ex = Assert.Throws<ValidationException>(() =>
            HabitInputValidator.Validate(new CreateHabitRequest { Name = new string('a', 151), Frequency = "Daily" }));
        Assert.Equal([HabitInputValidator.NameTooLong], ex.Errors["name"]);
    }

    [Fact]
    public void Name_of_150_characters_is_valid_and_name_is_trimmed()
    {
        Assert.Equal(150, HabitInputValidator.Validate(new CreateHabitRequest { Name = new string('a', 150), Frequency = "Daily" }).Name.Length);
        Assert.Equal("Read", HabitInputValidator.Validate(new UpdateHabitRequest { Name = "  Read  ", Frequency = "Weekly" }).Name);
    }

    [Fact]
    public void Description_of_2001_characters_is_invalid_and_blank_description_becomes_null()
    {
        var ex = Assert.Throws<ValidationException>(() => HabitInputValidator.Validate(
            new CreateHabitRequest { Name = "n", Frequency = "Daily", Description = new string('d', 2001) }));
        Assert.Equal([HabitInputValidator.DescriptionTooLong], ex.Errors["description"]);

        Assert.Null(HabitInputValidator.Validate(new CreateHabitRequest { Name = "n", Frequency = "Daily", Description = "  " }).Description);
    }

    [Theory]
    [InlineData("Monthly")]
    [InlineData("0")]
    [InlineData("1")]
    [InlineData("Daily,Weekly")]
    public void Invalid_frequency_is_invalid(string frequency)
    {
        var ex = Assert.Throws<ValidationException>(() =>
            HabitInputValidator.Validate(new CreateHabitRequest { Name = "n", Frequency = frequency }));
        Assert.Equal([HabitInputValidator.FrequencyInvalid], ex.Errors["frequency"]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(" ")]
    public void Missing_frequency_is_invalid(string? frequency)
    {
        var ex = Assert.Throws<ValidationException>(() =>
            HabitInputValidator.Validate(new UpdateHabitRequest { Name = "n", Frequency = frequency }));
        Assert.Equal([HabitInputValidator.FrequencyRequired], ex.Errors["frequency"]);
    }

    [Theory]
    [InlineData("Daily", HabitFrequency.Daily)]
    [InlineData("weekly", HabitFrequency.Weekly)]
    [InlineData(" WEEKLY ", HabitFrequency.Weekly)]
    public void Frequency_names_are_case_insensitive(string frequency, HabitFrequency expected)
    {
        Assert.Equal(expected, HabitInputValidator.Validate(new CreateHabitRequest { Name = "n", Frequency = frequency }).Frequency);
    }

    [Fact]
    public void All_field_errors_are_reported_together()
    {
        var ex = Assert.Throws<ValidationException>(() => HabitInputValidator.Validate(new CreateHabitRequest()));
        Assert.Equal(["frequency", "name"], ex.Errors.Keys.Order());
    }

    [Fact]
    public void Completion_in_the_future_is_invalid()
    {
        var ex = Assert.Throws<ValidationException>(() =>
            HabitInputValidator.ValidateCompletion(new Habit { IsActive = true }, Today.AddDays(1), Today));
        Assert.Equal([HabitInputValidator.DateInFuture], ex.Errors["date"]);
    }

    [Fact]
    public void Completion_of_inactive_habit_is_invalid()
    {
        var ex = Assert.Throws<ValidationException>(() =>
            HabitInputValidator.ValidateCompletion(new Habit { IsActive = false }, Today, Today));
        Assert.Equal([HabitInputValidator.HabitInactive], ex.Errors["habit"]);
    }

    [Fact]
    public void Completion_today_or_in_the_past_of_active_habit_is_valid()
    {
        HabitInputValidator.ValidateCompletion(new Habit { IsActive = true }, Today, Today);
        HabitInputValidator.ValidateCompletion(new Habit { IsActive = true }, Today.AddDays(-30), Today);
    }

    [Fact]
    public void Range_with_to_before_from_is_invalid()
    {
        var ex = Assert.Throws<ValidationException>(() => HabitInputValidator.ValidateRange(Today, Today.AddDays(-1)));
        Assert.Equal([HabitInputValidator.RangeInvalid], ex.Errors["to"]);
        HabitInputValidator.ValidateRange(Today, Today);
        HabitInputValidator.ValidateRange(null, Today);
    }
}
