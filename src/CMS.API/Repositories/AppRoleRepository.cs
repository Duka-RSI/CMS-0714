using System.Data;
using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class AppRoleRepository : IAppRoleRepository
{
    private const string AuditTableName = "AppRole";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IRowAuditWriter _rowAudit;

    public AppRoleRepository(IDbConnectionFactory connectionFactory, IRowAuditWriter rowAudit)
    {
        _connectionFactory = connectionFactory;
        _rowAudit = rowAudit;
    }

    // Base projection. UserCount is a correlated subquery over the AppUserRole junction.
    private const string SelectColumns = @"
        r.pkid, r.RoleId, r.RoleName, r.PermissionLevel, r.Description,
        (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.RoleId = r.RoleId) AS UserCount";

    public async Task<IEnumerable<AppRole>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $@"SELECT {SelectColumns} FROM AppRole r ORDER BY r.RoleId ASC";
        return await connection.QueryAsync<AppRole>(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<AppRole>> QueryAsync(AppRoleQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Keyword", string.IsNullOrWhiteSpace(query.Keyword) ? null : $"%{query.Keyword.Trim()}%");
        parameters.Add("PermissionLevel", query.PermissionLevel);

        var sql = $@"
            SELECT {SelectColumns}
            FROM AppRole r
            WHERE (@Keyword IS NULL
                   OR r.RoleId LIKE @Keyword
                   OR r.RoleName LIKE @Keyword
                   OR r.Description LIKE @Keyword)
              AND (@PermissionLevel IS NULL OR r.PermissionLevel = @PermissionLevel)
            ORDER BY r.RoleId ASC";

        return await connection.QueryAsync<AppRole>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<AppRole?> GetByIdAsync(string roleId, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await GetByIdAsync(connection, null, roleId, cancellationToken);
    }

    private static async Task<AppRole?> GetByIdAsync(IDbConnection connection, IDbTransaction? transaction, string roleId, CancellationToken cancellationToken)
    {
        var sql = $@"SELECT {SelectColumns} FROM AppRole r WHERE r.RoleId = @RoleId";
        var role = await connection.QuerySingleOrDefaultAsync<AppRole>(
            new CommandDefinition(sql, new { RoleId = roleId }, transaction, cancellationToken: cancellationToken));

        if (role is null)
        {
            return null;
        }

        var userIds = await connection.QueryAsync<string>(new CommandDefinition(
            "SELECT UserId FROM AppUserRole WHERE RoleId = @RoleId ORDER BY UserId",
            new { RoleId = roleId }, transaction, cancellationToken: cancellationToken));
        role.UserIds = userIds.ToList();
        return role;
    }

    public async Task<AppRole> CreateAsync(AppRoleRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        await connection.ExecuteAsync(new CommandDefinition(
            @"INSERT INTO AppRole (RoleId, RoleName, PermissionLevel, Description)
              VALUES (@RoleId, @RoleName, @PermissionLevel, @Description)",
            request, transaction, cancellationToken: cancellationToken));

        await SyncUsersAsync(connection, transaction, request.RoleId, request.UserIds, cancellationToken);

        var created = await GetByIdAsync(connection, transaction, request.RoleId, cancellationToken);
        transaction.Commit();

        // Audited after the commit: the row is durable, and a failed audit write must not
        // take a committed change down with it.
        await _rowAudit.LogInsertAsync(AuditTableName, created!, cancellationToken);
        return created!;
    }

    public async Task<bool> UpdateAsync(AppRoleRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        // Both snapshots are read inside the transaction, so the diff cannot straddle
        // somebody else's concurrent edit.
        var before = await GetByIdAsync(connection, transaction, request.RoleId, cancellationToken);
        if (before is null)
        {
            transaction.Rollback();
            return false;
        }

        // RoleId is the immutable primary key — never updated.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE AppRole
              SET RoleName = @RoleName, PermissionLevel = @PermissionLevel, Description = @Description
              WHERE RoleId = @RoleId",
            request, transaction, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            transaction.Rollback();
            return false;
        }

        await SyncUsersAsync(connection, transaction, request.RoleId, request.UserIds, cancellationToken);
        var after = await GetByIdAsync(connection, transaction, request.RoleId, cancellationToken);
        transaction.Commit();

        await _rowAudit.LogUpdateAsync(AuditTableName, before, after!, cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(string roleId, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        // Read the row before it goes: ActionDesc is its RoleId.
        var deleted = await GetByIdAsync(connection, transaction, roleId, cancellationToken);
        if (deleted is null)
        {
            transaction.Rollback();
            return false;
        }

        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE RoleId = @RoleId",
            new { RoleId = roleId }, transaction, cancellationToken: cancellationToken));

        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppRole WHERE RoleId = @RoleId",
            new { RoleId = roleId }, transaction, cancellationToken: cancellationToken));

        transaction.Commit();

        if (affected == 0)
        {
            return false;
        }

        await _rowAudit.LogDeleteAsync(AuditTableName, deleted, cancellationToken);
        return true;
    }

    public async Task<bool> ExistsAsync(string roleId, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var count = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM AppRole WHERE RoleId = @RoleId",
            new { RoleId = roleId }, cancellationToken: cancellationToken));
        return count > 0;
    }

    // N-N sync: delete-then-reinsert on the same connection/transaction.
    private static async Task SyncUsersAsync(IDbConnection connection, IDbTransaction transaction, string roleId, IEnumerable<string> userIds, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE RoleId = @RoleId",
            new { RoleId = roleId }, transaction, cancellationToken: cancellationToken));

        var rows = userIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .Select(id => new { UserId = id, RoleId = roleId })
            .ToList();

        if (rows.Count > 0)
        {
            await connection.ExecuteAsync(new CommandDefinition(
                "INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId)",
                rows, transaction, cancellationToken: cancellationToken));
        }
    }
}
