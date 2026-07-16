using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class PartnerRepository : IPartnerRepository
{
    private const string AuditTableName = "Partner";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IRowAuditWriter _rowAudit;

    public PartnerRepository(IDbConnectionFactory connectionFactory, IRowAuditWriter rowAudit)
    {
        _connectionFactory = connectionFactory;
        _rowAudit = rowAudit;
    }

    private const string SelectColumns = @"
        p.pkid, p.Name, p.AppKey, p.NameOnPartnerMenu, p.NameOnCourseDetailPage,
        p.DisplayOrder, p.ImageFilename";

    public async Task<IEnumerable<Partner>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} FROM Partner p ORDER BY p.DisplayOrder ASC, p.pkid ASC";
        return await connection.QueryAsync<Partner>(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<Partner>> QueryAsync(PartnerQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Keyword", string.IsNullOrWhiteSpace(query.Keyword) ? null : $"%{query.Keyword.Trim()}%");

        var sql = $@"
            SELECT {SelectColumns}
            FROM Partner p
            WHERE (@Keyword IS NULL
                   OR p.Name LIKE @Keyword
                   OR p.AppKey LIKE @Keyword
                   OR p.NameOnPartnerMenu LIKE @Keyword
                   OR p.NameOnCourseDetailPage LIKE @Keyword)
            ORDER BY p.DisplayOrder ASC, p.pkid ASC";

        return await connection.QueryAsync<Partner>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<Partner?> GetByIdAsync(short pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} FROM Partner p WHERE p.pkid = @Pkid";
        return await connection.QuerySingleOrDefaultAsync<Partner>(
            new CommandDefinition(sql, new { Pkid = pkid }, cancellationToken: cancellationToken));
    }

    public async Task<Partner> CreateAsync(PartnerRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // pkid is IDENTITY — excluded from the INSERT; SCOPE_IDENTITY() returns the new key.
        var newPkid = await connection.ExecuteScalarAsync<short>(new CommandDefinition(
            @"INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
              VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
              SELECT CAST(SCOPE_IDENTITY() AS smallint);",
            request, cancellationToken: cancellationToken));

        var created = await GetByIdAsync(newPkid, cancellationToken);
        await _rowAudit.LogInsertAsync(AuditTableName, created!, cancellationToken);
        return created!;
    }

    public async Task<bool> UpdateAsync(PartnerRequest request, CancellationToken cancellationToken = default)
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
            @"UPDATE Partner
              SET Name = @Name, AppKey = @AppKey, NameOnPartnerMenu = @NameOnPartnerMenu,
                  NameOnCourseDetailPage = @NameOnCourseDetailPage, DisplayOrder = @DisplayOrder,
                  ImageFilename = @ImageFilename
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

    public async Task<bool> DeleteAsync(short pkid, CancellationToken cancellationToken = default)
    {
        // Read the row before it goes: ActionDesc is its Name.
        var deleted = await GetByIdAsync(pkid, cancellationToken);
        if (deleted is null)
        {
            return false;
        }

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM Partner WHERE pkid = @Pkid",
            new { Pkid = pkid }, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        await _rowAudit.LogDeleteAsync(AuditTableName, deleted, cancellationToken);
        return true;
    }
}
