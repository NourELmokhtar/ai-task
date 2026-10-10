using System.Globalization;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace QuickFlow.Api.ModelBinding;

/// <summary>
/// Binds <see cref="DateOnly"/> / <see cref="Nullable{DateOnly}"/> from query/route values using the strict
/// <c>YYYY-MM-DD</c> format. Invalid values produce a 400 validation ProblemDetails (via [ApiController]).
/// Used by the "today" convention: <c>[FromQuery] DateOnly? today</c> + <c>ITodayProvider.GetToday(today)</c>.
/// </summary>
public sealed class IsoDateOnlyModelBinder : IModelBinder
{
    public const string Format = "yyyy-MM-dd";

    public static bool TryParse(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value, Format, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    public Task BindModelAsync(ModelBindingContext bindingContext)
    {
        var result = bindingContext.ValueProvider.GetValue(bindingContext.ModelName);
        if (result == ValueProviderResult.None)
        {
            return Task.CompletedTask;
        }

        bindingContext.ModelState.SetModelValue(bindingContext.ModelName, result);
        var value = result.FirstValue;

        if (string.IsNullOrWhiteSpace(value) && bindingContext.ModelMetadata.IsReferenceOrNullableType)
        {
            bindingContext.Result = ModelBindingResult.Success(null);
        }
        else if (TryParse(value, out var date))
        {
            bindingContext.Result = ModelBindingResult.Success(date);
        }
        else
        {
            bindingContext.ModelState.TryAddModelError(
                bindingContext.ModelName,
                $"The value '{value}' is not a valid date. Use the format YYYY-MM-DD.");
        }

        return Task.CompletedTask;
    }
}

public sealed class IsoDateOnlyModelBinderProvider : IModelBinderProvider
{
    public IModelBinder? GetBinder(ModelBinderProviderContext context) =>
        context.Metadata.UnderlyingOrModelType == typeof(DateOnly) ? new IsoDateOnlyModelBinder() : null;
}
