using QuickFlow.Api.ModelBinding;
using QuickFlow.Application.Common.Time;
using QuickFlow.Tests.TestSupport;

namespace QuickFlow.Tests.Application;

public class TodayProviderTests
{
    [Fact]
    public void Uses_requested_today_when_provided()
    {
        var provider = new TodayProvider(new FixedTimeProvider(new DateTimeOffset(2026, 10, 10, 12, 0, 0, TimeSpan.Zero)));

        Assert.Equal(new DateOnly(2030, 1, 2), provider.GetToday(new DateOnly(2030, 1, 2)));
    }

    [Fact]
    public void Defaults_to_server_local_date_from_clock()
    {
        // 22:30 UTC on Oct 10 is already Oct 11 in UTC+4 (local zone of the clock).
        var zone = TimeZoneInfo.CreateCustomTimeZone("Test+4", TimeSpan.FromHours(4), "Test+4", "Test+4");
        var provider = new TodayProvider(new FixedTimeProvider(new DateTimeOffset(2026, 10, 10, 22, 30, 0, TimeSpan.Zero), zone));

        Assert.Equal(new DateOnly(2026, 10, 11), provider.GetToday());
    }

    [Theory]
    [InlineData("2026-10-10", true)]
    [InlineData("2026-1-5", false)]
    [InlineData("10/10/2026", false)]
    [InlineData("2026-02-30", false)]
    [InlineData("", false)]
    public void Today_query_value_must_be_strict_yyyy_mm_dd(string value, bool valid)
    {
        Assert.Equal(valid, IsoDateOnlyModelBinder.TryParse(value, out _));
    }
}
