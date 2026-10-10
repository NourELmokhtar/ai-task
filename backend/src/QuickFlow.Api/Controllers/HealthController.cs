using Microsoft.AspNetCore.Mvc;
using QuickFlow.Api.Contracts;

namespace QuickFlow.Api.Controllers;

[ApiController]
[Route("api/health")]
[Produces("application/json")]
public sealed class HealthController(TimeProvider timeProvider) : ControllerBase
{
    /// <summary>Liveness check used by the frontend connectivity banner.</summary>
    [HttpGet]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    public ActionResult<HealthResponse> Get() =>
        Ok(new HealthResponse("Healthy", timeProvider.GetUtcNow().UtcDateTime));
}
