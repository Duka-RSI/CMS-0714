using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CMS.API.Middleware;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// End-to-end tests for the global exception middleware, booted through
/// <see cref="WebApplicationFactory{T}"/> like <see cref="AuthorizationPipelineTests"/>.
/// </summary>
/// <remarks>
/// The repository mock throws with a deliberately toxic message (SQL text, a connection
/// string, a password) so the leak assertions prove something real: none of it may appear
/// in the response, while all of it must reach the server-side log. The factory boots the
/// Development environment on purpose — the environment where ASP.NET is most inclined to
/// volunteer stack traces.
/// </remarks>
public class ExceptionHandlingPipelineTests : IClassFixture<ExceptionHandlingPipelineTests.Factory>
{
    private const string SigningKey = "cloud4fun#123456cloud4fun#123456";
    private const string Password = "CMS4fun#";

    /// <summary>Every fragment of this must stay server-side.</summary>
    private const string ToxicExceptionMessage =
        "SELECT PasswordHash FROM AppUser; Server=.\\SQLEXPRESS;Database=CMS;Password=hunter2";

    private readonly Factory _factory;

    public ExceptionHandlingPipelineTests(Factory factory) => _factory = factory;

    /// <summary>Captures every log entry the host writes, so tests can assert on logging.</summary>
    public sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public record Entry(string Category, LogLevel Level, string Message, Exception? Exception);

        public ConcurrentQueue<Entry> Entries { get; } = new();

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, Entries);

        public void Dispose() { }

        private sealed class CapturingLogger(string category, ConcurrentQueue<Entry> entries) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
                Exception? exception, Func<TState, Exception?, string> formatter)
                => entries.Enqueue(new Entry(category, logLevel, formatter(state, exception), exception));
        }
    }

    public class Factory : WebApplicationFactory<Program>
    {
        public Mock<IAuthRepository> AuthRepository { get; } = new();
        public Mock<ICourseRepository> CourseRepository { get; } = new();
        public Mock<IAppRoleRepository> AppRoleRepository { get; } = new();
        public CapturingLoggerProvider Logs { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureLogging(logging => logging.AddProvider(Logs));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<ISigningKeyProvider>();
                var signingKeys = new Mock<ISigningKeyProvider>();
                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey));
                signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>())).ReturnsAsync(key);
                signingKeys.Setup(k => k.Get()).Returns(key);
                services.AddSingleton(signingKeys.Object);

                services.RemoveAll<IAuthRepository>();
                services.AddScoped(_ => AuthRepository.Object);
                services.RemoveAll<ICourseRepository>();
                services.AddScoped(_ => CourseRepository.Object);
                services.RemoveAll<IAppRoleRepository>();
                services.AddScoped(_ => AppRoleRepository.Object);
            });
        }
    }

    private async Task<string> LoginAsync(HttpClient client, params string[] roleIds)
    {
        _factory.AuthRepository
            .Setup(r => r.GetCredentialAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppUserCredential
            {
                UserId = "miles@uuu.com.tw",
                UserName = "Miles",
                IsActive = true,
                PasswordHash = PasswordHasher.Hash(Password),
                RoleIds = [.. roleIds],
            });

        var response = await client.PostAsJsonAsync("/api/Auth/login",
            new { userId = "miles@uuu.com.tw", password = Password });
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<LoginResponse>();
        return payload!.AccessToken;
    }

    private HttpClient ClientWithToken(string token)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private async Task<HttpResponseMessage> CallThrowingEndpointAsync()
    {
        _factory.CourseRepository
            .Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException(ToxicExceptionMessage));
        var token = await LoginAsync(_factory.CreateClient(), "User");

        return await ClientWithToken(token).GetAsync("/api/courses");
    }

    // ----- Unhandled exceptions become one generic 500 -----

    [Fact]
    public async Task ThrowingEndpoint_Returns500WithTheGenericJsonBody()
    {
        var response = await CallThrowingEndpointAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(ExceptionHandlingMiddleware.GenericMessage, body.RootElement.GetProperty("message").GetString());
        // Exactly one property — nothing else rides along.
        Assert.Single(body.RootElement.EnumerateObject());
    }

    [Fact]
    public async Task ThrowingEndpoint_LeaksNoStackTraceSqlOrConnectionDetails()
    {
        var response = await CallThrowingEndpointAsync();

        var body = await response.Content.ReadAsStringAsync();
        // The exception message (SQL + connection string + password) stays server-side...
        Assert.DoesNotContain("SELECT", body);
        Assert.DoesNotContain("SQLEXPRESS", body);
        Assert.DoesNotContain("hunter2", body);
        // ...and so do the exception type and the stack trace ("   at Namespace.Method").
        Assert.DoesNotContain("InvalidOperationException", body);
        Assert.DoesNotContain("at CMS.API", body);
    }

    [Fact]
    public async Task ThrowingEndpoint_LogsTheFullExceptionServerSide()
    {
        await CallThrowingEndpointAsync();

        // The fixture (and its log capture) is shared across this class, so the other
        // throwing tests contribute entries too — assert one matches, not exactly one.
        var entry = _factory.Logs.Entries.FirstOrDefault(
            e => e.Level == LogLevel.Error && e.Category == typeof(ExceptionHandlingMiddleware).FullName);
        Assert.NotNull(entry);
        // The log keeps everything the response must not: message and stack trace.
        Assert.IsType<InvalidOperationException>(entry.Exception);
        Assert.Equal(ToxicExceptionMessage, entry.Exception.Message);
        Assert.NotNull(entry.Exception.StackTrace);
    }

    // ----- The deliberate responses are untouched by the middleware -----

    [Fact]
    public async Task MissingToken_StillReturns401NotAGeneric500()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/courses");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ForbiddenRole_StillReturns403NotAGeneric500()
    {
        var token = await LoginAsync(_factory.CreateClient(), "User");

        var response = await ClientWithToken(token).GetAsync("/api/app-roles");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ValidationFailure_StillReturns400WithItsOwnBodyNotTheGenericMessage()
    {
        var token = await LoginAsync(_factory.CreateClient(), "User");

        var response = await ClientWithToken(token)
            .PutAsJsonAsync("/api/Auth/profile", new { userName = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // The validation payload survives — it is a returned result, not a caught exception.
        Assert.DoesNotContain(ExceptionHandlingMiddleware.GenericMessage,
            await response.Content.ReadAsStringAsync());
    }
}
