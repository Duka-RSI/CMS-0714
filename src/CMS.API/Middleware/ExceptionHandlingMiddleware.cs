namespace CMS.API.Middleware;

/// <summary>
/// Last line of defence: turns any unhandled exception from the pipeline (controllers,
/// repositories, auth handlers) into one consistent, generic 500 JSON response.
/// </summary>
/// <remarks>
/// The full exception — message and stack trace — is logged server-side only. The response
/// body carries nothing but <see cref="GenericMessage"/>: never the exception text, SQL,
/// or connection details, which for Dapper exceptions routinely contain all three.
/// Deliberate results (401/403/404/409 and validation 400s) are returned, not thrown,
/// so they pass through here untouched.
/// </remarks>
public class ExceptionHandlingMiddleware
{
    /// <summary>The only error detail a caller ever sees for an unexpected failure.</summary>
    public const string GenericMessage = "系統發生未預期的錯誤,請稍後再試。";

    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // The caller hung up mid-request (repositories propagate RequestAborted through
            // their CancellationTokens). Nobody is listening and nothing is wrong server-side,
            // so this must not pollute the error log.
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Unhandled exception handling {Method} {Path}",
                context.Request.Method, context.Request.Path);

            if (context.Response.HasStarted)
            {
                // Headers are already on the wire; the status line cannot be rewritten.
                throw;
            }

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            // Same { message } shape the controllers use for their own error bodies.
            await context.Response.WriteAsJsonAsync(new { message = GenericMessage }, context.RequestAborted);
        }
    }
}
