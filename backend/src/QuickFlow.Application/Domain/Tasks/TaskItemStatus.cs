namespace QuickFlow.Application.Domain.Tasks;

/// <summary>Task workflow status. Serialized and stored as the member name. Named to avoid clashing with <see cref="System.Threading.Tasks.TaskStatus"/>.</summary>
public enum TaskItemStatus
{
    Todo,
    InProgress,
    Done,
}
