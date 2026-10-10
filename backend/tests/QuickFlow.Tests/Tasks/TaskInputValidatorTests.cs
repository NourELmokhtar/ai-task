using QuickFlow.Application.Common.Exceptions;
using QuickFlow.Application.Domain.Tasks;
using QuickFlow.Application.Features.Tasks;

namespace QuickFlow.Tests.Tasks;

/// <summary>TR-1: task validation (BR-01..03) and list filter validation.</summary>
public class TaskInputValidatorTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Missing_or_blank_title_is_invalid(string? title)
    {
        var ex = Assert.Throws<ValidationException>(() => TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = title }));
        Assert.Equal([TaskInputValidator.TitleRequired], ex.Errors["title"]);
    }

    [Fact]
    public void Title_of_201_characters_is_invalid()
    {
        var ex = Assert.Throws<ValidationException>(() =>
            TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = new string('a', 201) }));
        Assert.Equal([TaskInputValidator.TitleTooLong], ex.Errors["title"]);
    }

    [Fact]
    public void Title_of_200_characters_is_valid_and_title_is_trimmed()
    {
        Assert.Equal(200, TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = new string('a', 200) }).Title.Length);
        Assert.Equal("Buy milk", TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = "  Buy milk  " }).Title);
    }

    [Fact]
    public void Description_of_2001_characters_is_invalid()
    {
        var ex = Assert.Throws<ValidationException>(() => TaskInputValidator.ValidateCreate(
            new CreateTaskRequest { Title = "t", Description = new string('d', 2001) }));
        Assert.Equal([TaskInputValidator.DescriptionTooLong], ex.Errors["description"]);
    }

    [Fact]
    public void Description_of_2000_characters_is_valid_and_blank_description_becomes_null()
    {
        Assert.Equal(2000, TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = "t", Description = new string('d', 2000) }).Description!.Length);
        Assert.Null(TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = "t", Description = "   " }).Description);
    }

    [Theory]
    [InlineData("Blocked")]
    [InlineData("1")]
    [InlineData("Done!")]
    public void Invalid_status_is_invalid(string status)
    {
        var ex = Assert.Throws<ValidationException>(() => TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = "t", Status = status }));
        Assert.Equal([TaskInputValidator.StatusInvalid], ex.Errors["status"]);
    }

    [Theory]
    [InlineData("Urgent")]
    [InlineData("2")]
    public void Invalid_priority_is_invalid(string priority)
    {
        var ex = Assert.Throws<ValidationException>(() => TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = "t", Priority = priority }));
        Assert.Equal([TaskInputValidator.PriorityInvalid], ex.Errors["priority"]);
    }

    [Fact]
    public void All_field_errors_are_reported_together()
    {
        var ex = Assert.Throws<ValidationException>(() => TaskInputValidator.ValidateCreate(
            new CreateTaskRequest { Title = "", Description = new string('d', 2001), Status = "x", Priority = "y" }));
        Assert.Equal(["description", "priority", "status", "title"], ex.Errors.Keys.Order());
    }

    [Fact]
    public void Create_defaults_to_Todo_and_Medium_and_parses_names_case_insensitively()
    {
        var defaults = TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = "t" });
        Assert.Equal(TaskItemStatus.Todo, defaults.Status);
        Assert.Equal(TaskPriority.Medium, defaults.Priority);

        var parsed = TaskInputValidator.ValidateCreate(new CreateTaskRequest { Title = "t", Status = "inprogress", Priority = "HIGH" });
        Assert.Equal(TaskItemStatus.InProgress, parsed.Status);
        Assert.Equal(TaskPriority.High, parsed.Priority);
    }

    [Fact]
    public void Update_requires_status_and_priority()
    {
        var ex = Assert.Throws<ValidationException>(() => TaskInputValidator.ValidateUpdate(new UpdateTaskRequest { Title = "t" }));
        Assert.Equal([TaskInputValidator.StatusRequired], ex.Errors["status"]);
        Assert.Equal([TaskInputValidator.PriorityRequired], ex.Errors["priority"]);
    }

    [Fact]
    public void Query_defaults_are_active_tasks_sorted_by_createdAt_desc()
    {
        var filter = TaskInputValidator.ValidateQuery(new TaskListQuery());
        Assert.False(filter.Archived);
        Assert.False(filter.OverdueOnly);
        Assert.Equal(TaskSortBy.CreatedAt, filter.SortBy);
        Assert.True(filter.Descending);
        Assert.Null(filter.Search);
    }

    [Fact]
    public void Invalid_query_values_are_rejected()
    {
        var ex = Assert.Throws<ValidationException>(() => TaskInputValidator.ValidateQuery(new TaskListQuery
        {
            Status = "Blocked",
            Priority = "Urgent",
            SortBy = "title",
            SortDir = "up",
            DueFrom = new DateOnly(2026, 10, 10),
            DueTo = new DateOnly(2026, 10, 9),
        }));
        Assert.Equal(["dueTo", "priority", "sortBy", "sortDir", "status"], ex.Errors.Keys.Order());
    }
}
