namespace QuickFlow.Application.Common.Time;

/// <summary>
/// Resolves "today" for date-relative logic. Endpoints accept an optional <c>today=YYYY-MM-DD</c>
/// query parameter (deterministic testing); when absent the server's local date is used.
/// </summary>
public interface ITodayProvider
{
    DateOnly GetToday(DateOnly? requestedToday = null);
}
