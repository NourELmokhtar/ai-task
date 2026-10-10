namespace QuickFlow.Api.Contracts;

/// <param name="Status">Always <c>Healthy</c> when the API responds.</param>
/// <param name="ServerTime">Current server time, ISO-8601 UTC.</param>
public sealed record HealthResponse(string Status, DateTime ServerTime);
