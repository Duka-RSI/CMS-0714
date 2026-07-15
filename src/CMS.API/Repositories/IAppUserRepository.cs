using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IAppUserRepository
{
    Task<IEnumerable<AppUser>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery query, CancellationToken cancellationToken = default);
    Task<AppUser?> GetByIdAsync(string userId, CancellationToken cancellationToken = default);
    Task<AppUser> CreateAsync(AppUserRequest request, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(AppUserRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(string userId, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>Resets the user's password to the SysConfig default and stamps PasswordUpdatedTime.</summary>
    Task<bool> ResetPasswordAsync(string userId, CancellationToken cancellationToken = default);
}
