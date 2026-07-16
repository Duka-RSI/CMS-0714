using System.Net;
using System.Text.Json;
using CMS.API.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Unit tests for the branches of <see cref="ExceptionHandlingMiddleware"/> that the
/// end-to-end <see cref="ExceptionHandlingPipelineTests"/> cannot reach: the client-abort
/// filter and the already-started response guard. The middleware is invoked directly with a
/// stub <see cref="RequestDelegate"/>, so no host is booted.
/// </summary>
public class ExceptionHandlingMiddlewareTests
{
    private readonly CapturingLogger _logger = new();

    private ExceptionHandlingMiddleware Middleware(RequestDelegate next) => new(next, _logger);

    /// <summary>A context whose response body can be read back, with a live RequestAborted.</summary>
    private static DefaultHttpContext Context()
        => new() { Response = { Body = new MemoryStream() } };

    private static string BodyOf(HttpContext context)
    {
        context.Response.Body.Position = 0;
        return new StreamReader(context.Response.Body).ReadToEnd();
    }

    // ----- The normal path: an unexpected exception becomes a logged, generic 500 -----

    [Fact]
    public async Task UnhandledException_Returns500WithTheGenericBody_AndLogsTheError()
    {
        var context = Context();
        var middleware = Middleware(_ => throw new InvalidOperationException("Server=.\\SQLEXPRESS;Password=hunter2"));

        await middleware.InvokeAsync(context);

        Assert.Equal((int)HttpStatusCode.InternalServerError, context.Response.StatusCode);
        using var body = JsonDocument.Parse(BodyOf(context));
        Assert.Equal(ExceptionHandlingMiddleware.GenericMessage, body.RootElement.GetProperty("message").GetString());
        Assert.Contains(_logger.Entries, e => e.Level == LogLevel.Error);
    }

    [Fact]
    public async Task NoException_LeavesTheResponseAlone()
    {
        var context = Context();
        var middleware = Middleware(c =>
        {
            c.Response.StatusCode = (int)HttpStatusCode.NoContent;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(context);

        Assert.Equal((int)HttpStatusCode.NoContent, context.Response.StatusCode);
        Assert.Empty(_logger.Entries);
    }

    // ----- The client hung up: not a server fault, must not be logged as one -----

    [Fact]
    public async Task ClientAbort_RethrowsTheCancellation_AndLogsNothing()
    {
        using var aborted = new CancellationTokenSource();
        aborted.Cancel();
        var context = Context();
        context.RequestAborted = aborted.Token;
        var middleware = Middleware(_ => throw new OperationCanceledException(aborted.Token));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => middleware.InvokeAsync(context));

        // Nobody is listening and nothing is wrong server-side: this must not pollute the
        // error log, and must not be dressed up as a 500 for a caller that has gone.
        Assert.Empty(_logger.Entries);
    }

    [Fact]
    public async Task CancellationWithoutAClientAbort_IsATimeoutAndStillBecomesA500()
    {
        // A DB command timeout surfaces as TaskCanceledException while the caller is still
        // waiting: the filter must not mistake it for a hang-up and swallow a real fault.
        var context = Context();
        var middleware = Middleware(_ => throw new TaskCanceledException("command timeout"));

        await middleware.InvokeAsync(context);

        Assert.Equal((int)HttpStatusCode.InternalServerError, context.Response.StatusCode);
        using var body = JsonDocument.Parse(BodyOf(context));
        Assert.Equal(ExceptionHandlingMiddleware.GenericMessage, body.RootElement.GetProperty("message").GetString());
        Assert.Contains(_logger.Entries, e => e.Level == LogLevel.Error);
    }

    // ----- The response is already on the wire -----

    [Fact]
    public async Task ExceptionAfterTheResponseStarted_LogsThenRethrows_WithoutRewritingTheStatus()
    {
        var context = StartedResponseContext();
        context.Response.StatusCode = (int)HttpStatusCode.OK;
        var middleware = Middleware(_ => throw new InvalidOperationException("mid-stream"));

        // The status line cannot be rewritten once the headers are sent, so the middleware
        // has nothing left to do but log and let it go.
        await Assert.ThrowsAsync<InvalidOperationException>(() => middleware.InvokeAsync(context));

        Assert.Equal((int)HttpStatusCode.OK, context.Response.StatusCode);
        Assert.Contains(_logger.Entries, e => e.Level == LogLevel.Error);
    }

    /// <summary>A context whose response reports that its headers are already sent.</summary>
    private static DefaultHttpContext StartedResponseContext()
    {
        var features = new FeatureCollection();
        features.Set<IHttpRequestFeature>(new HttpRequestFeature { Method = "GET", Path = "/api/courses" });
        features.Set<IHttpResponseFeature>(new StartedResponseFeature());
        features.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(new MemoryStream()));
        return new DefaultHttpContext(features);
    }

    private sealed class StartedResponseFeature : HttpResponseFeature
    {
        public override bool HasStarted => true;
    }

    /// <summary>Records what the middleware logged, so the tests can assert on it.</summary>
    private sealed class CapturingLogger : ILogger<ExceptionHandlingMiddleware>
    {
        public record Entry(LogLevel Level, Exception? Exception);

        public List<Entry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter)
            => Entries.Add(new Entry(logLevel, exception));
    }
}
