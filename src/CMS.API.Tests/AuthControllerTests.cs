using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json;
using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for POST /api/Auth/login. The repository is mocked so these run
/// without a database, but the token service is the real one (over a mocked SysConfig) —
/// the point of these tests is what the endpoint actually signs and returns, so a mocked
/// token service would assert nothing.
/// </summary>
public class AuthControllerTests
{
    private const string UserId = "miles@uuu.com.tw";
    private const string UserName = "Miles";
    private const string CorrectPassword = "CMS4fun#";
    private const string SigningKey = "cloud4fun#123456cloud4fun#123456";

    private readonly Mock<IAuthRepository> _repository = new(MockBehavior.Strict);
    private readonly Mock<ISigningKeyProvider> _signingKeys = new(MockBehavior.Strict);
    private readonly AuthController _controller;

    public AuthControllerTests()
    {
        _signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey)));

        _controller = new AuthController(_repository.Object, new JwtTokenService(_signingKeys.Object));
    }

    private static AppUserCredential Sample(bool isActive = true, string password = CorrectPassword) => new()
    {
        UserId = UserId,
        UserName = UserName,
        IsActive = isActive,
        PasswordHash = PasswordHasher.Hash(password),
        RoleIds = ["admin", "editor"],
    };

    private void SetupUser(AppUserCredential? credential)
        => _repository.Setup(r => r.GetCredentialAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(credential);

    private Task<ActionResult<LoginResponse>> Login(string userId = UserId, string password = CorrectPassword)
        => _controller.Login(new LoginRequest { UserId = userId, Password = password }, CancellationToken.None);

    // ----- Success -----

    [Fact]
    public async Task Login_WithValidActiveUser_ReturnsProfileAndToken()
    {
        SetupUser(Sample());

        var result = await Login();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsType<LoginResponse>(ok.Value);
        Assert.Equal(UserId, payload.UserId);
        Assert.Equal(UserName, payload.UserName);
        Assert.False(string.IsNullOrWhiteSpace(payload.AccessToken));
    }

    [Fact]
    public async Task Login_IssuesTokenCarryingUserIdUserNameAndRoleClaims()
    {
        SetupUser(Sample());

        var token = await LoginAndReadTokenAsync();

        Assert.Equal(UserId, token.Claims.Single(c => c.Type == JwtTokenService.UserIdClaimType).Value);
        Assert.Equal(UserName, token.Claims.Single(c => c.Type == JwtTokenService.UserNameClaimType).Value);

        var roles = token.Claims.Where(c => c.Type == JwtTokenService.RoleClaimType).Select(c => c.Value).ToList();
        Assert.Equal(["admin", "editor"], roles.Order());
    }

    [Fact]
    public async Task Login_IssuesTokenExpiringIn24Hours()
    {
        SetupUser(Sample());

        var token = await LoginAndReadTokenAsync();

        var expected = DateTime.UtcNow.AddHours(24);
        // ValidTo is UTC; allow a minute for the clock moving during the test.
        Assert.True((token.ValidTo - expected).Duration() < TimeSpan.FromMinutes(1),
            $"Expected an expiry near {expected:O} but got {token.ValidTo:O}.");
    }

    [Fact]
    public async Task Login_ResponseNeverContainsPasswordHash()
    {
        var credential = Sample();
        SetupUser(credential);

        var result = await Login();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var json = JsonSerializer.Serialize(ok.Value);
        Assert.DoesNotContain(credential.PasswordHash, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        // The signed token must not smuggle it back either.
        var token = new JwtSecurityTokenHandler().ReadJwtToken(Assert.IsType<LoginResponse>(ok.Value).AccessToken);
        Assert.DoesNotContain(credential.PasswordHash, token.RawPayload, StringComparison.OrdinalIgnoreCase);
    }

    // ----- Failures: all three are indistinguishable to the caller -----

    [Fact]
    public async Task Login_WithWrongPassword_Returns401()
    {
        SetupUser(Sample());

        var result = await Login(password: "wrong-password");

        AssertGenericUnauthorized(result);
    }

    [Fact]
    public async Task Login_WithUnknownUserId_Returns401()
    {
        SetupUser(null);

        var result = await Login(userId: "nobody@uuu.com.tw");

        AssertGenericUnauthorized(result);
    }

    [Fact]
    public async Task Login_WithInactiveUser_Returns401()
    {
        SetupUser(Sample(isActive: false));

        var result = await Login();

        AssertGenericUnauthorized(result);
    }

    [Fact]
    public async Task Login_FailureMessageIsIdenticalForEveryFailedCheck()
    {
        SetupUser(null);
        var unknown = MessageOf(await Login());

        SetupUser(Sample());
        var wrongPassword = MessageOf(await Login(password: "wrong-password"));

        SetupUser(Sample(isActive: false));
        var inactive = MessageOf(await Login());

        // A caller must not be able to tell an unknown user from a disabled one.
        Assert.Equal(unknown, wrongPassword);
        Assert.Equal(unknown, inactive);
    }

    // ----- Server faults are not 401s -----

    [Fact]
    public async Task Login_WhenTheSigningKeyIsUnusable_Returns500()
    {
        SetupUser(Sample());
        _signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SysConfig 'appConfig' 未設定 'symmetricSecurityKey'。"));

        var result = await Login();

        // Valid credentials that cannot be turned into a token are a server fault, not a 401.
        var problem = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status500InternalServerError, problem.StatusCode);
    }

    [Fact]
    public async Task Login_WhenSysConfigIsBroken_Returns500()
    {
        SetupUser(Sample());
        _signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SysConfig 'appConfig' 設定不存在或為空。"));

        var result = await Login();

        var problem = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status500InternalServerError, problem.StatusCode);
    }

    // ----- Helpers -----

    private async Task<JwtSecurityToken> LoginAndReadTokenAsync()
    {
        var ok = Assert.IsType<OkObjectResult>((await Login()).Result);
        var payload = Assert.IsType<LoginResponse>(ok.Value);
        return new JwtSecurityTokenHandler().ReadJwtToken(payload.AccessToken);
    }

    private static void AssertGenericUnauthorized(ActionResult<LoginResponse> result)
    {
        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);

        var message = MessageOf(result);
        Assert.False(string.IsNullOrWhiteSpace(message));
        // The message must not name the failing check.
        Assert.DoesNotContain("停用", message);
        Assert.DoesNotContain("不存在", message);
    }

    private static string MessageOf(ActionResult<LoginResponse> result)
    {
        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
        var message = unauthorized.Value?.GetType().GetProperty("message")?.GetValue(unauthorized.Value);
        return Assert.IsType<string>(message);
    }
}
