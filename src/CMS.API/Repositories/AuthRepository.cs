using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

/// <summary>
/// Read-only repository for the login path. Separate from <see cref="AppUserRepository"/>,
/// whose projection deliberately never selects PasswordHash — this is the only repository
/// allowed to read it, and it hands the value back in a backend-only model.
/// </summary>
public sealed class AuthRepository : IAuthRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public AuthRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<AppUserCredential?> GetCredentialAsync(string userId, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var credential = await connection.QuerySingleOrDefaultAsync<AppUserCredential>(new CommandDefinition(
            @"SELECT u.UserId, u.UserName, u.IsActive, u.PasswordHash
              FROM AppUser u
              WHERE u.UserId = @UserId",
            new { UserId = userId }, cancellationToken: cancellationToken));

        if (credential is null)
        {
            return null;
        }

        var roleIds = await connection.QueryAsync<string>(new CommandDefinition(
            "SELECT RoleId FROM AppUserRole WHERE UserId = @UserId ORDER BY RoleId",
            new { UserId = userId }, cancellationToken: cancellationToken));
        credential.RoleIds = roleIds.ToList();

        return credential;
    }

    public async Task<bool> UpdateUserNameAsync(string userId, string userName, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // UserName is the only column in the SET clause: IsActive, PasswordHash and the
        // AppUserRole rows are untouchable through the self-service path.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE AppUser SET UserName = @UserName WHERE UserId = @UserId",
            new { UserId = userId, UserName = userName }, cancellationToken: cancellationToken));

        return affected > 0;
    }
}
