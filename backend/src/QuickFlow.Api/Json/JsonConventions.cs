using System.Text.Json;
using System.Text.Json.Serialization;

namespace QuickFlow.Api.Json;

/// <summary>
/// Shared JSON conventions (B5): camelCase properties, enums as strings (integers rejected → 400),
/// DateTime as ISO-8601 UTC ("...Z"), DateOnly as "YYYY-MM-DD" (System.Text.Json default).
/// </summary>
public static class JsonConventions
{
    public static void Apply(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.Converters.Add(new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false));
        options.Converters.Add(new UtcDateTimeJsonConverter());
    }
}
