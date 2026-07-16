using System.Data;
using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

/// <summary>
/// Repository for the login path and the two self-service writes. Separate from
/// <see cref="AppUserRepository"/>, whose projection deliberately never selects PasswordHash —
/// this is the only repository allowed to read it, and it hands the value back in a
/// backend-only model.
/// </summary>
public sealed class AuthRepository : IAuthRepository
{
    /// <summary>Both writes here change an AppUser row, so that is what they audit.</summary>
    private const string AuditTableName = "AppUser";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IRowAuditWriter _rowAudit;

    public AuthRepository(IDbConnectionFactory connectionFactory, IRowAuditWriter rowAudit)
    {
        _connectionFactory = connectionFactory;
        _rowAudit = rowAudit;
    }

    /// <summary>
    /// The AppUser snapshot the audit diff compares.
    /// </summary>
    /// <remarks>
    /// PasswordHash is excluded — this repository is the one place that may read it, and an
    /// audit row is not a reason to. RoleIds is deliberately left empty: neither write here
    /// can touch role links, so an empty list on both sides never registers as a change.
    /// </remarks>
    private static async Task<AppUser?> GetAuditSnapshotAsync(
        IDbConnection connection, string userId, CancellationToken cancellationToken)
        => await connection.QuerySingleOrDefaultAsync<AppUser>(new CommandDefinition(
            @"SELECT u.pkid, u.UserId, u.UserName, u.IsActive, u.PasswordUpdatedTime
              FROM AppUser u
              WHERE u.UserId = @UserId",
            new { UserId = userId }, cancellationToken: cancellationToken));

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

        var before = await GetAuditSnapshotAsync(connection, userId, cancellationToken);
        if (before is null)
        {
            return false;
        }

        // UserName is the only column in the SET clause: IsActive, PasswordHash and the
        // AppUserRole rows are untouchable through the self-service path.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE AppUser SET UserName = @UserName WHERE UserId = @UserId",
            new { UserId = userId, UserName = userName }, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        var after = await GetAuditSnapshotAsync(connection, userId, cancellationToken);
        await _rowAudit.LogUpdateAsync(AuditTableName, before, after!, cancellationToken);
        return true;
    }

    public async Task<bool> UpdatePasswordAsync(string userId, string passwordHash, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var before = await GetAuditSnapshotAsync(connection, userId, cancellationToken);
        if (before is null)
        {
            return false;
        }

        // GETUTCDATE() rather than a C# timestamp, matching AppUserRepository.ResetPasswordAsync:
        // one clock (the database's) stamps PasswordUpdatedTime however the password changed.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE AppUser
              SET PasswordHash = @PasswordHash, PasswordUpdatedTime = GETUTCDATE()
              WHERE UserId = @UserId",
            new { UserId = userId, PasswordHash = passwordHash }, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        // The diff reports PasswordUpdatedTime moving — the hash is not in the snapshot, so
        // it cannot reach the audit row.
        var after = await GetAuditSnapshotAsync(connection, userId, cancellationToken);
        await _rowAudit.LogUpdateAsync(AuditTableName, before, after!, cancellationToken);
        return true;
    }
}
