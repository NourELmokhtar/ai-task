namespace QuickFlow.Application.Common.Time;

public sealed class TodayProvider(TimeProvider timeProvider) : ITodayProvider
{
    public DateOnly GetToday(DateOnly? requestedToday = null) =>
        requestedToday ?? DateOnly.FromDateTime(timeProvider.GetLocalNow().DateTime);
}
