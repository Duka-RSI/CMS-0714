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
/// Tests for POST /api/Auth/change-password. The repository is mocked, so "changes nothing"
/// is asserted as "UpdatePasswordAsync was never called".
/// </summary>
public class AuthChangePasswordControllerTests
{
    private const string TokenUserId = "miles@uuu.com.tw";
    private const string CurrentPassword = "CMS4fun#";
    private const string GoodNewPassword = "Str0ng!pass";

    private readonly Mock<IAuthRepository> _repository = new(MockBehavior.Strict);
    private readonly Mock<ISigningKeyProvider> _signingKeys = new(MockBehavior.Strict);
    private readonly AuthController _controller;

    public AuthChangePasswordControllerTests()
    {
        _signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(new string('k', 32))));
        _controller = new AuthController(_repository.Object, new JwtTokenService(_signingKeys.Object));

        SignInAs(TokenUserId);
        StoredPasswordIs(CurrentPassword);
    }

    /// <summary>See AuthProfileControllerTests: ValidationProblem() needs one of these.</summary>
    private sealed class TestProblemDetailsFactory : ProblemDetailsFactory
    {
        public override ProblemDetails CreateProblemDetails(HttpContext httpContext,
            int? statusCode = null, string? title = null, string? type = null,
            string? detail = null, string? instance = null)
            => new() { Status = statusCode ?? StatusCodes.Status500InternalServerError };

        public override ValidationProblemDetails CreateValidationProblemDetails(HttpContext httpContext,
            ModelStateDictionary modelStateDictionary, int? statusCode = null, string? title = null,
            string? type = null, string? detail = null, string? instance = null)
            => new(modelStateDictionary) { Status = statusCode ?? StatusCodes.Status400BadRequest };
    }

    private void SignInAs(string? userId)
    {
        var claims = userId is null ? [] : new List<Claim> { new(JwtTokenService.UserIdClaimType, userId) };
        var services = new ServiceCollection();
        services.AddSingleton<ProblemDetailsFactory, TestProblemDetailsFactory>();

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestBearer")),
                RequestServices = services.BuildServiceProvider(),
            },
        };
    }

    /// <summary>Points the mocked repository at a user whose stored hash is of <paramref name="plaintext"/>.</summary>
    private void StoredPasswordIs(string plaintext)
        => _repository.Setup(r => r.GetCredentialAsync(TokenUserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppUserCredential
            {
                UserId = TokenUserId,
                UserName = "Miles",
                IsActive = true,
                PasswordHash = PasswordHasher.Hash(plaintext),
                RoleIds = ["Admin"],
            });

    private Task<IActionResult> Change(string current, string @new, string confirm)
        => _controller.ChangePassword(
            new ChangePasswordRequest { CurrentPassword = current, NewPassword = @new, ConfirmPassword = confirm },
            CancellationToken.None);

    private void ExpectPasswordWrite(string expectedPlaintext)
        => _repository
            .Setup(r => r.UpdatePasswordAsync(TokenUserId, PasswordHasher.Hash(expectedPlaintext), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    private void AssertNothingWasWritten()
        => _repository.Verify(
            r => r.UpdatePasswordAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);

    private static string MessageOf(IActionResult result)
    {
        var bad = Assert.IsType<BadRequestObjectResult>(result);
        var message = bad.Value?.GetType().GetProperty("message")?.GetValue(bad.Value);
        return Assert.IsType<string>(message);
    }

    // ----- Success -----

    [Fact]
    public async Task ChangePassword_WithEverythingValid_StoresSha256OfTheNewPassword()
    {
        ExpectPasswordWrite(GoodNewPassword);

        var result = await Change(CurrentPassword, GoodNewPassword, GoodNewPassword);

        Assert.IsType<NoContentResult>(result);
        // The stored value is SHA-256 of the new password, and nothing else.
        _repository.Verify(
            r => r.UpdatePasswordAsync(TokenUserId, PasswordHasher.Hash(GoodNewPassword), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task ChangePassword_StoresA64CharLowerCaseHexHashNotThePlaintext()
    {
        string? written = null;
        _repository.Setup(r => r.UpdatePasswordAsync(TokenUserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, CancellationToken>((_, hash, _) => written = hash)
            .ReturnsAsync(true);

        await Change(CurrentPassword, GoodNewPassword, GoodNewPassword);

        Assert.Matches("^[0-9a-f]{64}$", written!);
        Assert.DoesNotContain(GoodNewPassword, written!);
    }

    [Fact]
    public async Task ChangePassword_ChangesThePasswordOfTheTokenUser()
    {
        ExpectPasswordWrite(GoodNewPassword);

        await Change(CurrentPassword, GoodNewPassword, GoodNewPassword);

        // The account is read and written by the token's id — the body cannot name one.
        _repository.Verify(r => r.GetCredentialAsync(TokenUserId, It.IsAny<CancellationToken>()), Times.Once);
        _repository.Verify(
            r => r.UpdatePasswordAsync(TokenUserId, It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public void ChangePasswordRequest_CarriesNoUserIdAndNoHash()
    {
        var properties = typeof(ChangePasswordRequest).GetProperties().Select(p => p.Name).ToList();

        // Plaintext only, and no way to point this at another account.
        Assert.Equal(["CurrentPassword", "NewPassword", "ConfirmPassword"], properties);
    }

    // ----- 1. Wrong current password -----

    [Fact]
    public async Task ChangePassword_WithAWrongCurrentPassword_ChangesNothing()
    {
        var result = await Change("not-my-password", GoodNewPassword, GoodNewPassword);

        Assert.Equal("目前密碼不正確。", MessageOf(result));
        AssertNothingWasWritten();
    }

    [Fact]
    public async Task ChangePassword_WithAWrongCurrentPassword_Returns400Not401()
    {
        var result = await Change("not-my-password", GoodNewPassword, GoodNewPassword);

        // 401 would trip the client's session-expiry interceptor and sign the user out for
        // a typo. They are authenticated; they just got the password wrong.
        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task ChangePassword_ChecksTheCurrentPasswordBeforeTheNewOnesPolicy()
    {
        // Both are wrong; the current-password failure is the one reported.
        var result = await Change("not-my-password", "weak", "weak");

        Assert.Equal("目前密碼不正確。", MessageOf(result));
        AssertNothingWasWritten();
    }

    [Fact]
    public async Task ChangePassword_IsCaseSensitiveAboutTheCurrentPassword()
    {
        var result = await Change(CurrentPassword.ToUpperInvariant(), GoodNewPassword, GoodNewPassword);

        Assert.Equal("目前密碼不正確。", MessageOf(result));
        AssertNothingWasWritten();
    }

    // ----- 2. Complexity -----

    [Theory]
    [InlineData("Aa1!", "shorter than 8")]
    [InlineData("Aa1!Aa1", "7 characters")]
    [InlineData("abcdefghij", "lower only")]
    [InlineData("ABCDEFGHIJ", "upper only")]
    [InlineData("1234567890", "digits only")]
    [InlineData("abcdefg1", "two classes")]
    [InlineData("密碼密碼密碼密碼", "caseless letters, no class")]
    public async Task ChangePassword_WithANonCompliantNewPassword_ChangesNothing(string newPassword, string why)
    {
        var result = await Change(CurrentPassword, newPassword, newPassword);

        Assert.Equal(PasswordPolicy.RequirementMessage, MessageOf(result));
        AssertNothingWasWritten();
        Assert.False(PasswordPolicy.IsCompliant(newPassword), why);
    }

    [Fact]
    public async Task ChangePassword_RejectingComplexityReturnsTheExactBilingualMessage()
    {
        var result = await Change(CurrentPassword, "abcdefgh", "abcdefgh");

        var message = MessageOf(result);
        Assert.Contains("密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：", message);
        Assert.Contains("大寫英文／小寫英文／數字／符號", message);
        Assert.Contains("at least 3 of the 4 classes", message);
    }

    [Fact]
    public async Task ChangePassword_ChecksComplexityBeforeTheConfirmation()
    {
        // A weak new password with a mismatched confirmation reports the policy failure.
        var result = await Change(CurrentPassword, "abcdefgh", "something-else");

        Assert.Equal(PasswordPolicy.RequirementMessage, MessageOf(result));
        AssertNothingWasWritten();
    }

    // ----- 3. Confirmation -----

    [Fact]
    public async Task ChangePassword_WhenTheConfirmationDoesNotMatch_ChangesNothing()
    {
        var result = await Change(CurrentPassword, GoodNewPassword, "Str0ng!passX");

        Assert.Equal("新密碼與確認密碼不一致。", MessageOf(result));
        AssertNothingWasWritten();
    }

    [Fact]
    public async Task ChangePassword_ComparesTheConfirmationExactly()
    {
        // Differs only by case — still a mismatch.
        var result = await Change(CurrentPassword, GoodNewPassword, GoodNewPassword.ToUpperInvariant());

        Assert.Equal("新密碼與確認密碼不一致。", MessageOf(result));
        AssertNothingWasWritten();
    }

    // ----- Edge cases -----

    [Fact]
    public async Task ChangePassword_AllowsReusingTheCurrentPassword()
    {
        // No "must differ from the current one" rule was asked for; this documents that.
        ExpectPasswordWrite(CurrentPassword);

        var result = await Change(CurrentPassword, CurrentPassword, CurrentPassword);

        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task ChangePassword_WithInvalidModelState_ChangesNothing()
    {
        _controller.ModelState.AddModelError(nameof(ChangePasswordRequest.NewPassword), "Required");

        var result = await Change(CurrentPassword, "", "");

        Assert.Equal(StatusCodes.Status400BadRequest,
            Assert.IsType<BadRequestObjectResult>(result).StatusCode);
        AssertNothingWasWritten();
    }

    [Fact]
    public async Task ChangePassword_WithATokenCarryingNoSubject_Returns401()
    {
        SignInAs(null);

        var result = await Change(CurrentPassword, GoodNewPassword, GoodNewPassword);

        Assert.IsType<UnauthorizedObjectResult>(result);
        AssertNothingWasWritten();
    }

    [Fact]
    public async Task ChangePassword_WhenTheTokenUserNoLongerExists_Returns404()
    {
        _repository.Setup(r => r.GetCredentialAsync(TokenUserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((AppUserCredential?)null);

        var result = await Change(CurrentPassword, GoodNewPassword, GoodNewPassword);

        Assert.IsType<NotFoundResult>(result);
        AssertNothingWasWritten();
    }
}
