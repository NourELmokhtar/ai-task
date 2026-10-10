using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using QuickFlow.Application.Common.Time;
using QuickFlow.Application.Features.Dashboard;
using QuickFlow.Application.Features.Habits;
using QuickFlow.Application.Features.Learning;
using QuickFlow.Application.Features.Plans;
using QuickFlow.Application.Features.Settings;
using QuickFlow.Application.Features.Tasks;

namespace QuickFlow.Application;

public static class DependencyInjection
{
    /// <summary>Registers application services. Feature modules add their services here.</summary>
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        // Clock abstraction (B4): never read DateTime.Now / UtcNow directly in domain/application code.
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<ITodayProvider, TodayProvider>();

        // M02 Tasks
        services.AddScoped<ITaskService, TaskService>();

        // M03 Habits
        services.AddScoped<IHabitService, HabitService>();

        // M04 Learning Resources
        services.AddScoped<ILearningService, LearningService>();

        // M06 Plan Composition
        services.AddScoped<IPlanSourceResolver, PlanSourceResolver>();
        services.AddScoped<IPlanService, PlanService>();

        // M05 Settings
        services.AddScoped<ISettingsService, SettingsService>();

        // M08 Dashboard (composes the services above)
        services.AddScoped<IDashboardService, DashboardService>();

        return services;
    }
}
