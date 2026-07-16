using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class PublishStatusRepository : IPublishStatusRepository
{
    private const string AuditTableName = "PublishStatus";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IRowAuditWriter _rowAudit;

    public PublishStatusRepository(IDbConnectionFactory connectionFactory, IRowAuditWriter rowAudit)
    {
        _connectionFactory = connectionFactory;
        _rowAudit = rowAudit;
    }

    private const string SelectColumns =
        "s.pkid, s.Description, s.IsDraft, s.IsPublished, s.IsDiscontinued";

    public async Task<IEnumerable<PublishStatus>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} FROM PublishStatus s ORDER BY s.pkid ASC";
        return await connection.QueryAsync<PublishStatus>(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<PublishStatus>> QueryAsync(PublishStatusQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Keyword", string.IsNullOrWhiteSpace(query.Keyword) ? null : $"%{query.Keyword.Trim()}%");
        parameters.Add("IsDraft", query.IsDraft);
        parameters.Add("IsPublished", query.IsPublished);
        parameters.Add("IsDiscontinued", query.IsDiscontinued);

        var sql = $@"
            SELECT {SelectColumns}
            FROM PublishStatus s
            WHERE (@Keyword IS NULL OR s.Description LIKE @Keyword)
              AND (@IsDraft IS NULL OR s.IsDraft = @IsDraft)
              AND (@IsPublished IS NULL OR s.IsPublished = @IsPublished)
              AND (@IsDiscontinued IS NULL OR s.IsDiscontinued = @IsDiscontinued)
            ORDER BY s.pkid ASC";

        return await connection.QueryAsync<PublishStatus>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<PublishStatus?> GetByIdAsync(byte pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} FROM PublishStatus s WHERE s.pkid = @Pkid";
        return await connection.QuerySingleOrDefaultAsync<PublishStatus>(
            new CommandDefinition(sql, new { Pkid = pkid }, cancellationToken: cancellationToken));
    }

    public async Task<PublishStatus> CreateAsync(PublishStatusRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // pkid is user-assigned (not IDENTITY), so it is written explicitly.
        await connection.ExecuteAsync(new CommandDefinition(
            @"INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
              VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued)",
            request, cancellationToken: cancellationToken));

        var created = await GetByIdAsync(request.Pkid, cancellationToken);
        await _rowAudit.LogInsertAsync(AuditTableName, created!, cancellationToken);
        return created!;
    }

    public async Task<bool> UpdateAsync(PublishStatusRequest request, CancellationToken cancellationToken = default)
    {
        // Snapshot for the audit diff. A missing row means the UPDATE would have affected
        // nothing anyway, so the early return matches the previous behaviour.
        var before = await GetByIdAsync(request.Pkid, cancellationToken);
        if (before is null)
        {
            return false;
        }

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // pkid is the immutable primary key — never updated.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE PublishStatus
              SET Description = @Description, IsDraft = @IsDraft,
                  IsPublished = @IsPublished, IsDiscontinued = @IsDiscontinued
              WHERE pkid = @Pkid",
            request, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        var after = await GetByIdAsync(request.Pkid, cancellationToken);
        await _rowAudit.LogUpdateAsync(AuditTableName, before, after!, cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(byte pkid, CancellationToken cancellationToken = default)
    {
        // Read the row before it goes: ActionDesc is its Description.
        var deleted = await GetByIdAsync(pkid, cancellationToken);
        if (deleted is null)
        {
            return false;
        }

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM PublishStatus WHERE pkid = @Pkid",
            new { Pkid = pkid }, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        await _rowAudit.LogDeleteAsync(AuditTableName, deleted, cancellationToken);
        return true;
    }

    public async Task<bool> ExistsAsync(byte pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var count = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM PublishStatus WHERE pkid = @Pkid",
            new { Pkid = pkid }, cancellationToken: cancellationToken));
        return count > 0;
    }
}
