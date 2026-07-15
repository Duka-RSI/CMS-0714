using System.IdentityModel.Tokens.Jwt;
using System.Text;
using CMS.API.Security;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Unit tests for the access-token issuer. The signing key is mocked — where that key comes
/// from and how it is validated is <see cref="SigningKeyProviderTests"/>' job.
/// </summary>
public class JwtTokenServiceTests
{
    private const string KeyMaterial = "cloud4fun#123456cloud4fun#123456";   // 32 bytes = HS256 minimum

    private readonly Mock<ISigningKeyProvider> _signingKeys = new(MockBehavior.Strict);
    private readonly JwtTokenService _service;

    public JwtTokenServiceTests()
    {
        _signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(KeyMaterial)));
        _service = new JwtTokenService(_signingKeys.Object);
    }

    private async Task<JwtSecurityToken> IssueAsync(params string[] roleIds)
    {
        var jwt = await _service.CreateAccessTokenAsync("miles@uuu.com.tw", "Miles", roleIds);
        return new JwtSecurityTokenHandler().ReadJwtToken(jwt);
    }

    [Fact]
    public async Task CreateAccessToken_SignsWithHmacSha256()
    {
        var token = await IssueAsync();

        Assert.Equal("HS256", token.Header.Alg);
        _signingKeys.Verify(k => k.GetAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateAccessToken_IsVerifiableWithTheSigningKey()
    {
        var jwt = await _service.CreateAccessTokenAsync("miles@uuu.com.tw", "Miles", ["Admin"]);

        // Mirrors the JwtBearer setup in Program.cs. MapInboundClaims = false is load-bearing:
        // left at its default, the handler rewrites "role" to the ClaimTypes.Role URI, and a
        // RoleClaimType of "role" would then match nothing — [Authorize(Roles=...)] would
        // silently reject every Admin.
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(KeyMaterial)),
            RoleClaimType = JwtTokenService.RoleClaimType,
        };

        // The whole point of the token: the signature must verify under the issuing key...
        var principal = handler.ValidateToken(jwt, parameters, out _);
        Assert.True(principal.IsInRole("Admin"));

        // ...and must not verify under any other key.
        parameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(new string('x', 32)));
        Assert.Throws<SecurityTokenSignatureKeyNotFoundException>(
            () => handler.ValidateToken(jwt, parameters, out _));
    }

    [Fact]
    public async Task CreateAccessToken_WritesUserIdAndUserNameClaims()
    {
        var token = await IssueAsync();

        Assert.Equal("miles@uuu.com.tw", token.Claims.Single(c => c.Type == JwtTokenService.UserIdClaimType).Value);
        Assert.Equal("Miles", token.Claims.Single(c => c.Type == JwtTokenService.UserNameClaimType).Value);
    }

    [Fact]
    public async Task CreateAccessToken_WritesOneRoleClaimPerRole()
    {
        var token = await IssueAsync("Admin", "User", "viewer");

        var roles = token.Claims.Where(c => c.Type == JwtTokenService.RoleClaimType).Select(c => c.Value).ToList();
        Assert.Equal(["Admin", "User", "viewer"], roles.Order());
    }

    [Fact]
    public async Task CreateAccessToken_WithNoRoles_WritesNoRoleClaims()
    {
        var token = await IssueAsync();

        Assert.DoesNotContain(token.Claims, c => c.Type == JwtTokenService.RoleClaimType);
    }

    [Fact]
    public async Task CreateAccessToken_IgnoresBlankAndDuplicateRoles()
    {
        var token = await IssueAsync("Admin", "Admin", "  ", "");

        var roles = token.Claims.Where(c => c.Type == JwtTokenService.RoleClaimType).Select(c => c.Value);
        Assert.Equal(["Admin"], roles);
    }

    [Fact]
    public async Task CreateAccessToken_ExpiresIn24Hours()
    {
        var token = await IssueAsync();

        Assert.True((token.ValidTo - DateTime.UtcNow.AddHours(24)).Duration() < TimeSpan.FromMinutes(1),
            $"Expected a ~24h expiry but got {token.ValidTo:O} (now {DateTime.UtcNow:O}).");
        Assert.Equal(TimeSpan.FromHours(24), JwtTokenService.TokenLifetime);
    }

    [Fact]
    public async Task CreateAccessToken_GivesEachTokenADistinctJti()
    {
        var first = await IssueAsync();
        var second = await IssueAsync();

        Assert.NotEqual(first.Id, second.Id);
    }

    [Fact]
    public async Task CreateAccessToken_PropagatesAnUnusableSigningKey()
    {
        _signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SysConfig 'appConfig' 未設定 'symmetricSecurityKey'。"));

        // The controller turns this into a 500 rather than a 401 — see AuthControllerTests.
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.CreateAccessTokenAsync("miles@uuu.com.tw", "Miles", []));
    }
}
