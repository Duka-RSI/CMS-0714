namespace CMS.API.Security;

public interface IJwtTokenService
{
    /// <summary>
    /// Issues a signed access token carrying the user's id, display name and role claims.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// The SysConfig 'appConfig' signing secret is missing, blank, or too short to sign with.
    /// </exception>
    Task<string> CreateAccessTokenAsync(
        string userId,
        string userName,
        IEnumerable<string> roleIds,
        CancellationToken cancellationToken = default);
}
