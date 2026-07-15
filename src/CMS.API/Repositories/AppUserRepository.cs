using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Security;
using Dapper;

namespace CMS.API.Repositories;

public sealed class AppUserRepository : IAppUserRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ISysConfigRepository _sysConfigRepository;

    public AppUserRepository(IDbConnectionFactory connectionFactory, ISysConfigRepository sysConfigRepository)
    {
        _connectionFactory = connectionFactory;
        _sysConfigRepository = sysConfigRepository;
    }

    // Base projection. PasswordHash is deliberately never selected — it must not leave the DB.
    // RoleCount is a correlated subquery over the AppUserRole junction.
    private const string SelectColumns = @"
        u.pkid, u.UserId, u.UserName, u.IsActive, u.PasswordUpdatedTime,
        (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.UserId = u.UserId) AS RoleCount";

    public async Task<IEnumerable<AppUser>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $@"SELECT {SelectColumns} FROM AppUser u ORDER BY u.UserId ASC";
        return await connection.QueryAsync<AppUser>(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Keyword", string.IsNullOrWhiteSpace(query.Keyword) ? null : $"%{query.Keyword.Trim()}%");
        parameters.Add("IsActive", query.IsActive);

        var sql = $@"
            SELECT {SelectColumns}
            FROM AppUser u
            WHERE (@Keyword IS NULL
                   OR u.UserId LIKE @Keyword
                   OR u.UserName LIKE @Keyword)
              AND (@IsActive IS NULL OR u.IsActive = @IsActive)
            ORDER BY u.UserId ASC";

        return await connection.QueryAsync<AppUser>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<AppUser?> GetByIdAsync(string userId, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await GetByIdAsync(connection, null, userId, cancellationToken);
    }

    private static async Task<AppUser?> GetByIdAsync(IDbConnection connection, IDbTransaction? transaction, string userId, CancellationToken cancellationToken)
    {
        var sql = $@"SELECT {SelectColumns} FROM AppUser u WHERE u.UserId = @UserId";
        var user = await connection.QuerySingleOrDefaultAsync<AppUser>(
            new CommandDefinition(sql, new { UserId = userId }, transaction, cancellationToken: cancellationToken));

        if (user is null)
        {
            return null;
        }

        var roleIds = await connection.QueryAsync<string>(new CommandDefinition(
            "SELECT RoleId FROM AppUserRole WHERE UserId = @UserId ORDER BY RoleId",
            new { UserId = userId }, transaction, cancellationToken: cancellationToken));
        user.RoleIds = roleIds.ToList();
        return user;
    }

    public async Task<AppUser> CreateAsync(AppUserRequest request, CancellationToken cancellationToken = default)
    {
        // New users start on the system default password; PasswordUpdatedTime stays NULL,
        // which is the "still on the default password" signal.
        var passwordHash = await HashDefaultPasswordAsync(cancellationToken);

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        await connection.ExecuteAsync(new CommandDefinition(
            @"INSERT INTO AppUser (UserId, UserName, IsActive, PasswordHash, PasswordUpdatedTime)
              VALUES (@UserId, @UserName, @IsActive, @PasswordHash, NULL)",
            new { request.UserId, request.UserName, request.IsActive, PasswordHash = passwordHash },
            transaction, cancellationToken: cancellationToken));

        await SyncRolesAsync(connection, transaction, request.UserId, request.RoleIds, cancellationToken);

        var created = await GetByIdAsync(connection, transaction, request.UserId, cancellationToken);
        transaction.Commit();
        return created!;
    }

    public async Task<bool> UpdateAsync(AppUserRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        // UserId is the immutable primary key — never updated.
        // PasswordHash / PasswordUpdatedTime are deliberately absent: an edit must never
        // alter the password. Use ResetPasswordAsync for that.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE AppUser
              SET UserName = @UserName, IsActive = @IsActive
              WHERE UserId = @UserId",
            new { request.UserId, request.UserName, request.IsActive },
            transaction, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            transaction.Rollback();
            return false;
        }

        await SyncRolesAsync(connection, transaction, request.UserId, request.RoleIds, cancellationToken);
        transaction.Commit();
        return true;
    }

    public async Task<bool> DeleteAsync(string userId, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE UserId = @UserId",
            new { UserId = userId }, transaction, cancellationToken: cancellationToken));

        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUser WHERE UserId = @UserId",
            new { UserId = userId }, transaction, cancellationToken: cancellationToken));

        transaction.Commit();
        return affected > 0;
    }

    public async Task<bool> ExistsAsync(string userId, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var count = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM AppUser WHERE UserId = @UserId",
            new { UserId = userId }, cancellationToken: cancellationToken));
        return count > 0;
    }

    public async Task<bool> ResetPasswordAsync(string userId, CancellationToken cancellationToken = default)
    {
        var passwordHash = await HashDefaultPasswordAsync(cancellationToken);

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE AppUser
              SET PasswordHash = @PasswordHash, PasswordUpdatedTime = GETUTCDATE()
              WHERE UserId = @UserId",
            new { UserId = userId, PasswordHash = passwordHash }, cancellationToken: cancellationToken));
        return affected > 0;
    }

    /// <summary>Reads the SysConfig default password and hashes it for storage.</summary>
    private async Task<string> HashDefaultPasswordAsync(CancellationToken cancellationToken)
    {
        var appConfig = await _sysConfigRepository.GetAppConfigAsync(cancellationToken);
        // GetAppConfigAsync throws unless DefaultPassword is present and non-blank.
        return PasswordHasher.Hash(appConfig.DefaultPassword!);
    }

    // N-N sync: delete-then-reinsert on the same connection/transaction.
    private static async Task SyncRolesAsync(IDbConnection connection, IDbTransaction transaction, string userId, IEnumerable<string> roleIds, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE UserId = @UserId",
            new { UserId = userId }, transaction, cancellationToken: cancellationToken));

        var rows = roleIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .Select(id => new { UserId = userId, RoleId = id })
            .ToList();

        if (rows.Count > 0)
        {
            await connection.ExecuteAsync(new CommandDefinition(
                "INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId)",
                rows, transaction, cancellationToken: cancellationToken));
        }
    }
}
