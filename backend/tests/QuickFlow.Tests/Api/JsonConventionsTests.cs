using System.Text.Json;
using QuickFlow.Api.Json;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Api;

public class JsonConventionsTests
{
    private sealed record Sample(TestStatus Status, DateTime UpdatedAt, DateOnly DueDate);

    private static JsonSerializerOptions Options()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        JsonConventions.Apply(options);
        return options;
    }

    [Fact]
    public void Serializes_camelCase_string_enum_utc_timestamp_and_iso_date()
    {
        var json = JsonSerializer.Serialize(
            new Sample(TestStatus.InProgress, new DateTime(2026, 10, 10, 8, 30, 0, DateTimeKind.Unspecified), new DateOnly(2026, 10, 11)),
            Options());

        Assert.Equal("""{"status":"InProgress","updatedAt":"2026-10-10T08:30:00Z","dueDate":"2026-10-11"}""", json);
    }

    [Fact]
    public void Rejects_integer_and_unknown_enum_values()
    {
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<Sample>("""{"status":1,"updatedAt":"2026-10-10T08:30:00Z","dueDate":"2026-10-11"}""", Options()));
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<Sample>("""{"status":"Bogus","updatedAt":"2026-10-10T08:30:00Z","dueDate":"2026-10-11"}""", Options()));
    }

    [Fact]
    public void Reads_offset_timestamps_as_utc()
    {
        var sample = JsonSerializer.Deserialize<Sample>("""{"status":"Done","updatedAt":"2026-10-10T12:30:00+04:00","dueDate":"2026-10-11"}""", Options())!;

        Assert.Equal(DateTimeKind.Utc, sample.UpdatedAt.Kind);
        Assert.Equal(new DateTime(2026, 10, 10, 8, 30, 0, DateTimeKind.Utc), sample.UpdatedAt);
    }
}
