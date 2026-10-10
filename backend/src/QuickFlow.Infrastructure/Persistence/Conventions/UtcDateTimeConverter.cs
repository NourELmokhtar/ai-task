using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace QuickFlow.Infrastructure.Persistence.Conventions;

/// <summary>Stores DateTime as UTC and marks values read from the database as <see cref="DateTimeKind.Utc"/>.</summary>
public sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    v => v.Kind == DateTimeKind.Local ? v.ToUniversalTime() : DateTime.SpecifyKind(v, DateTimeKind.Utc),
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
