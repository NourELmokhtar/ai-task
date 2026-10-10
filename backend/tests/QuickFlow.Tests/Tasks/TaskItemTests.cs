using QuickFlow.Application.Domain.Tasks;

namespace QuickFlow.Tests.Tasks;

/// <summary>TR-1: CompletedAt maintenance (BR-05) and overdue rule (A-05) on the entity.</summary>
public class TaskItemTests
{
    private static readonly DateTime T0 = new(2026, 10, 10, 8, 0, 0, DateTimeKind.Utc);
    private static readonly DateOnly Today = new(2026, 10, 10);

    [Fact]
    public void Complete_sets_Done_and_CompletedAt()
    {
        var task = new TaskItem { Title = "t" };
        task.MarkCompleted(T0);

        Assert.Equal(TaskItemStatus.Done, task.Status);
        Assert.Equal(T0, task.CompletedAt);
    }

    [Fact]
    public void Completing_again_keeps_original_CompletedAt()
    {
        var task = new TaskItem { Title = "t" };
        task.MarkCompleted(T0);
        task.MarkCompleted(T0.AddHours(1));
        task.SetStatus(TaskItemStatus.Done, T0.AddHours(2));

        Assert.Equal(T0, task.CompletedAt);
    }

    [Theory]
    [InlineData(TaskItemStatus.Todo)]
    [InlineData(TaskItemStatus.InProgress)]
    public void Leaving_Done_clears_CompletedAt(TaskItemStatus newStatus)
    {
        var task = new TaskItem { Title = "t" };
        task.MarkCompleted(T0);
        task.SetStatus(newStatus, T0.AddHours(1));

        Assert.Equal(newStatus, task.Status);
        Assert.Null(task.CompletedAt);
    }

    [Fact]
    public void New_task_defaults_to_Todo_Medium_not_archived_not_completed()
    {
        var task = new TaskItem { Title = "t" };
        Assert.Equal(TaskItemStatus.Todo, task.Status);
        Assert.Equal(TaskPriority.Medium, task.Priority);
        Assert.False(task.IsArchived);
        Assert.Null(task.CompletedAt);
    }

    [Fact]
    public void Past_due_and_not_done_is_overdue()
    {
        var task = new TaskItem { Title = "t", DueDate = Today.AddDays(-1) };
        Assert.True(task.IsOverdue(Today));

        task.SetStatus(TaskItemStatus.InProgress, T0);
        Assert.True(task.IsOverdue(Today));
    }

    [Fact]
    public void Done_task_is_not_overdue()
    {
        var task = new TaskItem { Title = "t", DueDate = Today.AddDays(-1) };
        task.MarkCompleted(T0);
        Assert.False(task.IsOverdue(Today));
    }

    [Fact]
    public void Archived_task_is_not_overdue()
    {
        var task = new TaskItem { Title = "t", DueDate = Today.AddDays(-1), IsArchived = true };
        Assert.False(task.IsOverdue(Today));
    }

    [Fact]
    public void Task_due_today_is_not_overdue()
    {
        var task = new TaskItem { Title = "t", DueDate = Today };
        Assert.False(task.IsOverdue(Today));
    }

    [Fact]
    public void Task_without_due_date_is_not_overdue()
    {
        var task = new TaskItem { Title = "t" };
        Assert.False(task.IsOverdue(Today));
    }
}
