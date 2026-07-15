using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Security;

/// <summary>
/// Supplies the HMAC-SHA256 signing key from SysConfig 'appConfig', for both issuing and
/// validating access tokens.
/// </summary>
public interface ISigningKeyProvider
{
    /// <summary>Gets the signing key, reading SysConfig only when the cache is cold or stale.</summary>
    /// <exception cref="InvalidOperationException">
    /// The SysConfig row is missing/malformed, or 'symmetricSecurityKey' is absent, blank or too short.
    /// </exception>
    Task<SymmetricSecurityKey> GetAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Blocking overload for callers with no async seam — specifically JwtBearer's
    /// <c>IssuerSigningKeyResolver</c>, which is synchronous by design.
    /// </summary>
    SymmetricSecurityKey Get();
}
