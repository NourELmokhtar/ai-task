using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using QuickFlow.Application.Common.Interfaces;
using QuickFlow.Infrastructure.Persistence;

namespace QuickFlow.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Registers persistence (EF Core + MySQL). Feature modules add repositories/infrastructure services here if needed.</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionStringName = configuration[$"{DatabaseOptions.SectionName}:{nameof(DatabaseOptions.ConnectionStringName)}"];
        if (string.IsNullOrWhiteSpace(connectionStringName))
        {
            connectionStringName = new DatabaseOptions().ConnectionStringName;
        }

        services.AddDbContext<AppDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString(connectionStringName);
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    $"Connection string 'ConnectionStrings:{connectionStringName}' is not configured. " +
                    "Set it with 'dotnet user-secrets' (id quickflow-api-dev) or the environment variable " +
                    $"'ConnectionStrings__{connectionStringName}'.");
            }

            options.UseMySQL(connectionString);
        });

        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        return services;
    }

    /// <summary>Applies pending migrations (creates the database if it does not exist).</summary>
    public static async Task ApplyDatabaseMigrationsAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DependencyInjection).FullName!);

        logger.LogInformation("Applying pending database migrations...");
        await db.Database.MigrateAsync(cancellationToken);
        logger.LogInformation("Database is up to date.");
    }
}
