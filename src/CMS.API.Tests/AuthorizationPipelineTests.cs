using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// End-to-end tests for the authorization pipeline, booted through <see cref="WebApplicationFactory{T}"/>.
/// </summary>
/// <remarks>
/// Controller unit tests call actions directly and therefore bypass authentication entirely —
/// they cannot tell whether the middleware is wired up at all. These tests drive the real
/// pipeline over HTTP. The database is never touched: every repository is replaced with a
/// mock, including the SysConfig-backed signing key.
/// </remarks>
public class AuthorizationPipelineTests : IClassFixture<AuthorizationPipelineTests.Factory>
{
    private const string SigningKey = "cloud4fun#123456cloud4fun#123456";
    private const string Password = "CMS4fun#";

    private readonly Factory _factory;

    public AuthorizationPipelineTests(Factory factory) => _factory = factory;

    public class Factory : WebApplicationFactory<Program>
    {
        public Mock<IAuthRepository> AuthRepository { get; } = new();
        public Mock<IAppRoleRepository> AppRoleRepository { get; } = new();
        public Mock<ICourseRepository> CourseRepository { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
                // Swap every repository the tested endpoints touch for a mock, plus the signing
                // key provider — so nothing here reaches SQL Server.
                services.RemoveAll<ISigningKeyProvider>();
                var signingKeys = new Mock<ISigningKeyProvider>();
                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey));
                signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>())).ReturnsAsync(key);
                signingKeys.Setup(k => k.Get()).Returns(key);
                services.AddSingleton(signingKeys.Object);

                services.RemoveAll<IAuthRepository>();
                services.AddScoped(_ => AuthRepository.Object);
                services.RemoveAll<IAppRoleRepository>();
                services.AddScoped(_ => AppRoleRepository.Object);
                services.RemoveAll<ICourseRepository>();
                services.AddScoped(_ => CourseRepository.Object);
            });
        }
    }

    /// <summary>Logs in through the real endpoint and returns the issued token.</summary>
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

    // ----- AuthController stays anonymous -----

    [Fact]
    public async Task Login_IsReachableWithoutTheBearerToken()
    {
        var client = _factory.CreateClient();

        var token = await LoginAsync(client);

        // Reaching a 200 at all proves the endpoint opted out of the global fallback policy.
        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public async Task Login_WithBadCredentials_Returns401FromTheControllerNotTheMiddleware()
    {
        _factory.AuthRepository
            .Setup(r => r.GetCredentialAsync("ghost@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync((AppUserCredential?)null);
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/Auth/login",
            new { userId = "ghost@uuu.com.tw", password = "whatever" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        // The controller's own message — proof this is the credential check, not the guard.
        Assert.Contains("使用者代碼或密碼錯誤", await response.Content.ReadAsStringAsync());
    }

    // ----- AuthController's own protected action -----

    [Fact]
    public async Task UpdateProfile_WithoutAToken_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PutAsJsonAsync("/api/Auth/profile", new { userName = "Anyone" });

        // [AllowAnonymous] sits on the controller: without its own [Authorize], this action
        // would inherit it and let anyone rename... nobody in particular. This is the test
        // that catches that attribute going missing.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpdateProfile_WithAValidToken_RenamesTheTokenUserAndIgnoresTheBodyUserId()
    {
        _factory.AuthRepository
            .Setup(r => r.UpdateUserNameAsync("miles@uuu.com.tw", "Renamed", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var token = await LoginAsync(_factory.CreateClient(), "User");

        var response = await ClientWithToken(token)
            .PutAsJsonAsync("/api/Auth/profile", new { userId = "victim@uuu.com.tw", userName = "Renamed" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<UserProfileResponse>();
        Assert.Equal("miles@uuu.com.tw", payload!.UserId);
        // End-to-end proof that the body's userId is inert: the victim is never touched.
        _factory.AuthRepository.Verify(
            r => r.UpdateUserNameAsync("victim@uuu.com.tw", It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateProfile_WithABlankUserName_Returns400()
    {
        var token = await LoginAsync(_factory.CreateClient(), "User");

        var response = await ClientWithToken(token).PutAsJsonAsync("/api/Auth/profile", new { userName = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ----- Everything else requires a token -----

    [Theory]
    [InlineData("/api/courses")]
    [InlineData("/api/app-roles")]
    [InlineData("/api/lookups/app-roles")]
    public async Task ProtectedEndpoint_WithoutAToken_Returns401(string url)
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithAGarbageToken_Returns401()
    {
        var client = ClientWithToken("not-a-real-jwt");

        var response = await client.GetAsync("/api/courses");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithATokenSignedByTheWrongKey_Returns401()
    {
        var foreignKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(new string('x', 32)));
        var foreignKeys = new Mock<ISigningKeyProvider>();
        foreignKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>())).ReturnsAsync(foreignKey);
        var forged = await new JwtTokenService(foreignKeys.Object)
            .CreateAccessTokenAsync("miles@uuu.com.tw", "Miles", ["Admin"]);

        var response = await ClientWithToken(forged).GetAsync("/api/courses");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithAValidToken_Returns200()
    {
        _factory.CourseRepository
            .Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        var token = await LoginAsync(_factory.CreateClient(), "User");

        var response = await ClientWithToken(token).GetAsync("/api/courses");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ----- Admin-only endpoints -----

    [Fact]
    public async Task AdminEndpoint_WithANonAdminToken_Returns403()
    {
        var token = await LoginAsync(_factory.CreateClient(), "User");

        var response = await ClientWithToken(token).GetAsync("/api/app-roles");

        // Authenticated but not entitled — 403, not 401.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminEndpoint_WithAnAdminToken_Returns200()
    {
        _factory.AppRoleRepository
            .Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        var token = await LoginAsync(_factory.CreateClient(), "Admin", "User");

        var response = await ClientWithToken(token).GetAsync("/api/app-roles");

        // Proves the "role" claim survives validation and reaches [Authorize(Roles = "Admin")].
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task NonAdminEndpoint_IsReachableByANonAdmin()
    {
        _factory.CourseRepository
            .Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        var token = await LoginAsync(_factory.CreateClient(), "User");

        var response = await ClientWithToken(token).GetAsync("/api/courses");

        // The Admin restriction must not have leaked onto the ordinary features.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
