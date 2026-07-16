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

    /// <summary>
    /// Sets the display name of <paramref name="userId"/>. False when no such user exists.
    /// </summary>
    /// <remarks>
    /// Self-service: deliberately narrower than <see cref="IAppUserRepository.UpdateAsync"/>,
    /// which also syncs roles. UserName is the only column this can touch.
    /// </remarks>
    Task<bool> UpdateUserNameAsync(string userId, string userName, CancellationToken cancellationToken = default);

    /// <summary>
    /// Stores a new <paramref name="passwordHash"/> for <paramref name="userId"/> and stamps
    /// PasswordUpdatedTime with the current UTC time. False when no such user exists.
    /// </summary>
    /// <remarks>
    /// Takes an already-hashed value: hashing is the caller's job, so a plaintext password
    /// can never reach the repository layer or a SQL parameter.
    /// </remarks>
    Task<bool> UpdatePasswordAsync(string userId, string passwordHash, CancellationToken cancellationToken = default);
}
