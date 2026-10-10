namespace QuickFlow.Application.Domain.Learning;

/// <summary>User-set progress of a learning card (A-12). It is never derived from milestones.</summary>
public enum LearningCardStatus
{
    NotStarted,
    InProgress,
    Completed,
}
