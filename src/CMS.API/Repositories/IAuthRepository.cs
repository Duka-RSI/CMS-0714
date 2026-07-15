using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IAuthRepository
{
    /// <summary>
    /// Loads the credential row for <paramref name="userId"/>, including PasswordHash and the
    /// user's RoleIds. Returns null when no such UserId exists.
    /// </summary>
    /// <remarks>
    /// Inactive users are returned too — the caller decides, so that "unknown user",
    /// "wrong password" and "disabled account" all fail the same generic way.
    /// </remarks>
    Task<AppUserCredential?> GetCredentialAsync(string userId, CancellationToken cancellationToken = default);
}
