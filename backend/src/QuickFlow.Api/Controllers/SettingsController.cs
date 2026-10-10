using Microsoft.AspNetCore.Mvc;
using QuickFlow.Application.Features.Settings;

namespace QuickFlow.Api.Controllers;

/// <summary>The single user's settings (M05): display name, plan-start notification preference and default view.</summary>
[ApiController]
[Route("api/settings")]
[Tags("Settings")]
[Produces("application/json")]
public sealed class SettingsController(ISettingsService settings) : ControllerBase
{
    /// <summary>Gets the settings. The first read creates them with defaults (no name, notifications on, Dashboard).</summary>
    [HttpGet]
    [ProducesResponseType<SettingsResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<SettingsResponse>> Get(CancellationToken cancellationToken) =>
        Ok(await settings.GetAsync(cancellationToken));

    /// <summary>Replaces all settings (displayName optional; planStartNotificationsEnabled and defaultView required).</summary>
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType<SettingsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public async Task<ActionResult<SettingsResponse>> Update([FromBody] UpdateSettingsRequest? request, CancellationToken cancellationToken) =>
        Ok(await settings.UpdateAsync(request ?? new UpdateSettingsRequest(), cancellationToken));
}
