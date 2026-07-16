using System.Security.Claims;
using System.Text;
using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Tests for PUT /api/Auth/profile — self-service rename of the signed-in user.
/// </summary>
/// <remarks>
/// The identity under test comes from the token, so these build a ClaimsPrincipal by hand
/// and hang it on the controller context, the way the JwtBearer handler would.
/// </remarks>
public class AuthProfileControllerTests
{
    private const string TokenUserId = "miles@uuu.com.tw";

    private readonly Mock<IAuthRepository> _repository = new(MockBehavior.Strict);
    private readonly Mock<ISigningKeyProvider> _signingKeys = new(MockBehavior.Strict);
    private readonly AuthController _controller;

    public AuthProfileControllerTests()
    {
        _signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(new string('k', 32))));

        _controller = new AuthController(_repository.Object, new JwtTokenService(_signingKeys.Object));
        SignInAs(TokenUserId);
    }

    /// <summary>
    /// ValidationProblem() resolves a ProblemDetailsFactory off the request services; a bare
    /// DefaultHttpContext has none, and the result comes back with no status code at all.
    /// The real pipeline always has one, so supply an equivalent rather than assert on
    /// behaviour that only happens in tests. (AuthorizationPipelineTests checks the real 400.)
    /// </summary>
    private sealed class TestProblemDetailsFactory : ProblemDetailsFactory
    {
        public override ProblemDetails CreateProblemDetails(HttpContext httpContext,
            int? statusCode = null, string? title = null, string? type = null,
            string? detail = null, string? instance = null)
            => new() { Status = statusCode ?? StatusCodes.Status500InternalServerError, Title = title, Detail = detail };

        public override ValidationProblemDetails CreateValidationProblemDetails(HttpContext httpContext,
            ModelStateDictionary modelStateDictionary, int? statusCode = null, string? title = null,
            string? type = null, string? detail = null, string? instance = null)
            => new(modelStateDictionary) { Status = statusCode ?? StatusCodes.Status400BadRequest, Title = title };
    }

    /// <summary>Puts the given user on the request, as an authenticated bearer token would.</summary>
    private void SignInAs(string? userId, params string[] roles)
    {
        var claims = new List<Claim>();
        if (userId is not null)
        {
            claims.Add(new Claim(JwtTokenService.UserIdClaimType, userId));
        }
        claims.AddRange(roles.Select(r => new Claim(JwtTokenService.RoleClaimType, r)));

        var services = new ServiceCollection();
        services.AddSingleton<ProblemDetailsFactory, TestProblemDetailsFactory>();

        var identity = new ClaimsIdentity(claims, authenticationType: "TestBearer");
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(identity),
                RequestServices = services.BuildServiceProvider(),
            },
        };
    }

    private Task<ActionResult<UserProfileResponse>> Update(string userName)
        => _controller.UpdateProfile(new UpdateProfileRequest { UserName = userName }, CancellationToken.None);

    private void ExpectUpdate(string userId, string userName, bool result = true)
        => _repository.Setup(r => r.UpdateUserNameAsync(userId, userName, It.IsAny<CancellationToken>()))
            .ReturnsAsync(result);

    // ----- Happy path -----

    [Fact]
    public async Task UpdateProfile_UpdatesTheUserNameOfTheTokenUser()
    {
        ExpectUpdate(TokenUserId, "Miles Sun");

        var result = await Update("Miles Sun");

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsType<UserProfileResponse>(ok.Value);
        Assert.Equal(TokenUserId, payload.UserId);
        Assert.Equal("Miles Sun", payload.UserName);
        _repository.Verify(r => r.UpdateUserNameAsync(TokenUserId, "Miles Sun", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task UpdateProfile_TrimsTheUserNameBeforeStoringIt()
    {
        ExpectUpdate(TokenUserId, "Miles Sun");

        var result = await Update("   Miles Sun   ");

        // Both what is stored and what is returned must be the trimmed value.
        _repository.Verify(r => r.UpdateUserNameAsync(TokenUserId, "Miles Sun", It.IsAny<CancellationToken>()), Times.Once);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("Miles Sun", Assert.IsType<UserProfileResponse>(ok.Value).UserName);
    }

    // ----- The body cannot choose the victim -----

    [Fact]
    public void UpdateProfileRequest_HasNoUserIdOrRoleProperties()
    {
        var properties = typeof(UpdateProfileRequest).GetProperties().Select(p => p.Name).ToList();

        // The strongest guarantee available: a UserId sent in the body cannot be bound
        // because there is nowhere for it to bind to. Same for roles.
        Assert.Equal(["UserName"], properties);
    }

    [Fact]
    public async Task UpdateProfile_IgnoresAUserIdSentInTheBody()
    {
        ExpectUpdate(TokenUserId, "Hacked");

        // Deserializing a body that carries an extra userId: System.Text.Json drops unknown
        // properties, so this is exactly what the controller would receive in production.
        var body = System.Text.Json.JsonSerializer.Deserialize<UpdateProfileRequest>(
            """{"userId":"victim@uuu.com.tw","userName":"Hacked","roleIds":["Admin"]}""",
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        await _controller.UpdateProfile(body, CancellationToken.None);

        // The token's user was renamed; the body's victim was never touched.
        _repository.Verify(r => r.UpdateUserNameAsync(TokenUserId, "Hacked", It.IsAny<CancellationToken>()), Times.Once);
        _repository.Verify(
            r => r.UpdateUserNameAsync("victim@uuu.com.tw", It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateProfile_RenamesWhoeverTheTokenSays()
    {
        SignInAs("someone-else@uuu.com.tw");
        ExpectUpdate("someone-else@uuu.com.tw", "Someone Else");

        await Update("Someone Else");

        _repository.Verify(
            r => r.UpdateUserNameAsync("someone-else@uuu.com.tw", "Someone Else", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    // ----- Validation -----

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    [InlineData("\n  \t ")]
    public async Task UpdateProfile_WithABlankUserName_Returns400AndWritesNothing(string userName)
    {
        // "" is caught by [Required]; whitespace-only sails past it and needs the trim check.
        _controller.ModelState.Clear();
        if (userName.Length == 0)
        {
            _controller.ModelState.AddModelError(nameof(UpdateProfileRequest.UserName), "Required");
        }

        var result = await Update(userName);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
        _repository.Verify(
            r => r.UpdateUserNameAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateProfile_WithInvalidModelState_Returns400()
    {
        _controller.ModelState.AddModelError(nameof(UpdateProfileRequest.UserName), "太長了");

        var result = await Update("whatever");

        Assert.Equal(StatusCodes.Status400BadRequest,
            Assert.IsType<BadRequestObjectResult>(result.Result).StatusCode);
        _repository.Verify(
            r => r.UpdateUserNameAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ----- Token edge cases -----

    [Fact]
    public async Task UpdateProfile_WithATokenCarryingNoSubject_Returns401()
    {
        SignInAs(null);

        var result = await Update("Miles Sun");

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
        _repository.Verify(
            r => r.UpdateUserNameAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateProfile_WhenTheTokenUserNoLongerExists_Returns404()
    {
        ExpectUpdate(TokenUserId, "Miles Sun", result: false);

        var result = await Update("Miles Sun");

        Assert.IsType<NotFoundResult>(result.Result);
    }
}
