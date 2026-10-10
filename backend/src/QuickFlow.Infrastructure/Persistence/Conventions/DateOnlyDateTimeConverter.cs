using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace QuickFlow.Infrastructure.Persistence.Conventions;

/// <summary>
/// Maps <see cref="DateOnly"/> to <see cref="DateTime"/> (midnight) for the <c>date</c> column type.
/// Needed because the Oracle MySQL provider reads <c>date</c> columns with <c>GetFieldValue&lt;DateOnly&gt;</c>,
/// which MySql.Data does not support (InvalidCastException at runtime). Found in M02.
/// </summary>
public sealed class DateOnlyDateTimeConverter() : ValueConverter<DateOnly, DateTime>(
    d => d.ToDateTime(TimeOnly.MinValue),
    dt => DateOnly.FromDateTime(dt));
