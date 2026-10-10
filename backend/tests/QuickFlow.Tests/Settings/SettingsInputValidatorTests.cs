using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Settings;
using QuickFlow.Application.Features.Settings;

namespace QuickFlow.Tests.Settings;

public class SettingsInputValidatorTests
{
    private static UpdateSettingsRequest Valid(string? displayName = "Nour", bool? notifications = true, string? defaultView = "Tasks") =>
        new() { DisplayName = displayName, PlanStartNotificationsEnabled = notifications, DefaultView = defaultView };

    [Fact]
    public void Valid_request_is_normalized()
    {
        var input = SettingsInputValidator.Validate(Valid(displayName: "  Nour  ", notifications: false, defaultView: "LearningResources"));

        Assert.Equal("Nour", input.DisplayName);
        Assert.False(input.PlanStartNotificationsEnabled);
        Assert.Equal(DefaultView.LearningResources, input.DefaultView);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Empty_display_name_becomes_null(string? displayName)
    {
        Assert.Null(SettingsInputValidator.Validate(Valid(displayName: displayName)).DisplayName);
    }

    [Fact]
    public void Display_name_of_100_characters_is_valid()
    {
        Assert.Equal(100, SettingsInputValidator.Validate(Valid(displayName: new string('a', 100))).DisplayName!.Length);
    }

    [Fact]
    public void Display_name_of_100_characters_with_surrounding_spaces_is_valid_after_trimming()
    {
        Assert.Equal(100, SettingsInputValidator.Validate(Valid(displayName: $"  {new string('a', 100)}  ")).DisplayName!.Length);
    }

    [Fact]
    public void Display_name_of_101_characters_is_invalid()
    {
        var ex = Assert.Throws<ValidationException>(() => SettingsInputValidator.Validate(Valid(displayName: new string('a', 101))));

        Assert.Equal([SettingsInputValidator.DisplayNameTooLong], ex.Errors["displayName"]);
        Assert.Single(ex.Errors);
    }

    [Theory]
    [InlineData("Dashboard", DefaultView.Dashboard)]
    [InlineData("Tasks", DefaultView.Tasks)]
    [InlineData("Habits", DefaultView.Habits)]
    [InlineData("LearningResources", DefaultView.LearningResources)]
    [InlineData("TodoPlans", DefaultView.TodoPlans)]
    [InlineData("Settings", DefaultView.Settings)]
    [InlineData("tasks", DefaultView.Tasks)]
    public void All_six_default_views_are_accepted(string value, DefaultView expected)
    {
        Assert.Equal(expected, SettingsInputValidator.Validate(Valid(defaultView: value)).DefaultView);
    }

    [Theory]
    [InlineData("Unknown")]
    [InlineData("1")]
    [InlineData("0")]
    [InlineData("Learning")]
    [InlineData("Tasks,Habits")]
    public void Invalid_default_view_is_invalid(string value)
    {
        var ex = Assert.Throws<ValidationException>(() => SettingsInputValidator.Validate(Valid(defaultView: value)));

        Assert.Equal([SettingsInputValidator.DefaultViewInvalid], ex.Errors["defaultView"]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void Default_view_is_required(string? value)
    {
        var ex = Assert.Throws<ValidationException>(() => SettingsInputValidator.Validate(Valid(defaultView: value)));

        Assert.Equal([SettingsInputValidator.DefaultViewRequired], ex.Errors["defaultView"]);
    }

    [Fact]
    public void Notifications_flag_is_required()
    {
        var ex = Assert.Throws<ValidationException>(() => SettingsInputValidator.Validate(Valid(notifications: null)));

        Assert.Equal([SettingsInputValidator.PlanStartNotificationsEnabledRequired], ex.Errors["planStartNotificationsEnabled"]);
    }

    [Fact]
    public void Empty_request_reports_all_required_fields()
    {
        var ex = Assert.Throws<ValidationException>(() => SettingsInputValidator.Validate(new UpdateSettingsRequest()));

        Assert.Equal(["defaultView", "planStartNotificationsEnabled"], ex.Errors.Keys.Order());
    }
}
