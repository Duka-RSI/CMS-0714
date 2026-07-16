using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Security;

/// <summary>
/// Issues HMAC-SHA256 access tokens for the login endpoint.
/// </summary>
/// <remarks>
/// The signing secret comes from <see cref="ISigningKeyProvider"/> — the SysConfig
/// 'appConfig' `symmetricSecurityKey`, never hard-coded, and the same key the JwtBearer
/// handler validates against.
///
/// Claims are written with short, literal names ("sub" / "name" / "role") rather than the
/// ClaimTypes.* URIs, so the token stays compact and predictable. The JwtBearer handler is
/// configured with MapInboundClaims = false and RoleClaimType = <see cref="RoleClaimType"/>
/// to read them back verbatim.
///
/// No issuer/audience is set, and validation is configured to match: this API is the only
/// issuer and the only consumer, so iss/aud would be ceremony that validates nothing.
/// </remarks>
public sealed class JwtTokenService : IJwtTokenService
{
    /// <summary>How long an issued token stays valid.</summary>
    public static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(24);

    /// <summary>Claim carrying AppUser.UserId.</summary>
    public const string UserIdClaimType = JwtRegisteredClaimNames.Sub;

    /// <summary>Claim carrying AppUser.UserName.</summary>
    public const string UserNameClaimType = JwtRegisteredClaimNames.Name;

    /// <summary>Claim carrying one AppUserRole.RoleId; repeated once per role.</summary>
    public const string RoleClaimType = "role";

    private readonly ISigningKeyProvider _signingKeyProvider;

    public JwtTokenService(ISigningKeyProvider signingKeyProvider)
    {
        _signingKeyProvider = signingKeyProvider;
    }

    public async Task<string> CreateAccessTokenAsync(
        string userId,
        string userName,
        IEnumerable<string> roleIds,
        CancellationToken cancellationToken = default)
    {
        var signingKey = await _signingKeyProvider.GetAsync(cancellationToken);

        var claims = new List<Claim>
        {
            new(UserIdClaimType, userId),
            new(UserNameClaimType, userName),
            // Distinct id per token, so an issued token can be identified (e.g. for revocation).
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        claims.AddRange(roleIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .Select(id => new Claim(RoleClaimType, id)));

        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            claims: claims,
            notBefore: now,
            expires: now.Add(TokenLifetime),
            signingCredentials: new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256));

        var handler = new JwtSecurityTokenHandler();
        // Write claim types verbatim instead of remapping them to the ClaimTypes.* URIs.
        handler.OutboundClaimTypeMap.Clear();
        return handler.WriteToken(token);
    }
}
