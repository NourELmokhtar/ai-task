using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;
using QuickFlow.Application.Common.Time;
using QuickFlow.Application.Features.Dashboard;

namespace QuickFlow.Api.Controllers;

/// <summary>
/// Aggregated dashboard (M08): today's and overdue tasks, task completion, today's habits, active plans with progress and
/// rest time, and a learning snapshot, all in one response.
/// </summary>
[ApiController]
[Route("api/dashboard")]
[Tags("Dashboard")]
[Produces("application/json")]
public sealed class DashboardController(IDashboardService dashboard, ITodayProvider todayProvider) : ControllerBase
{
    /// <summary>Gets every dashboard metric for the effective today (default: the server's local date).</summary>
    [HttpGet]
    [ProducesResponseType<DashboardResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<DashboardResponse>> Get(
        [FromQuery, Description("Effective today (YYYY-MM-DD) for due-today, overdue, completed-today and habit progress; default server local date.")] DateOnly? today,
        CancellationToken cancellationToken) =>
        Ok(await dashboard.GetAsync(todayProvider.GetToday(today), cancellationToken));
}
