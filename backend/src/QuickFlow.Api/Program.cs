using Microsoft.AspNetCore.Mvc.ModelBinding.Metadata;
using QuickFlow.Api.ErrorHandling;
using QuickFlow.Api.Json;
using QuickFlow.Api.ModelBinding;
using QuickFlow.Application;
using QuickFlow.Infrastructure;

const string FrontendCorsPolicy = "Frontend";

var builder = WebApplication.CreateBuilder(args);

// Layers
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

// Controllers + JSON conventions (camelCase, string enums, UTC timestamps, YYYY-MM-DD dates)
builder.Services
    .AddControllers(options =>
    {
        // Strict YYYY-MM-DD binding for DateOnly query/route values (e.g. ?today=2026-10-10).
        options.ModelBinderProviders.Insert(0, new IsoDateOnlyModelBinderProvider());
        // Validation error keys use the JSON (camelCase) property names.
        options.ModelMetadataDetailsProviders.Add(new SystemTextJsonValidationMetadataProvider());
    })
    .AddJsonOptions(options => JsonConventions.Apply(options.JsonSerializerOptions));
builder.Services.ConfigureHttpJsonOptions(options => JsonConventions.Apply(options.SerializerOptions));

// Errors -> RFC 7807 ProblemDetails
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// OpenAPI document (/openapi/v1.json) + Swagger UI (/swagger), Development only
builder.Services.AddOpenApi(options => options.AddDocumentTransformer((document, _, _) =>
{
    document.Info.Title = "QuickFlow API";
    document.Info.Version = "v1";
    return Task.CompletedTask;
}));

// CORS for the Angular dev server
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:4200"];
builder.Services.AddCors(options => options.AddPolicy(FrontendCorsPolicy, policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithExposedHeaders("Location")));

var app = builder.Build();

if (app.Configuration.GetValue<bool>("Database:ApplyMigrationsOnStartup"))
{
    await app.Services.ApplyDatabaseMigrationsAsync();
}

app.UseExceptionHandler();
app.UseStatusCodePages(); // empty-body 4xx/5xx (e.g. unknown route 404) -> ProblemDetails
app.UseCors(FrontendCorsPolicy);

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "QuickFlow API v1");
        options.RoutePrefix = "swagger";
        options.DocumentTitle = "QuickFlow API";
    });
}

app.MapControllers();

app.Run();

/// <summary>Exposed for integration tests (WebApplicationFactory).</summary>
public partial class Program;
