using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class CourseGroupRepository : ICourseGroupRepository
{
    private const string AuditTableName = "CourseGroup";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IRowAuditWriter _rowAudit;

    public CourseGroupRepository(IDbConnectionFactory connectionFactory, IRowAuditWriter rowAudit)
    {
        _connectionFactory = connectionFactory;
        _rowAudit = rowAudit;
    }

    // Base projection. Counts are correlated subqueries over the referencing tables.
    private const string SelectColumns = @"
        g.pkid, g.Description,
        (SELECT COUNT(*) FROM Course c WHERE c.CourseGroup_pkid = g.pkid) AS CourseCount,
        (SELECT COUNT(*) FROM PartnerCourseGroup p WHERE p.CourseGroup_pkid = g.pkid) AS PartnerCourseGroupCount";

    public async Task<IEnumerable<CourseGroup>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g ORDER BY g.pkid DESC";
        return await connection.QueryAsync<CourseGroup>(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Keyword", string.IsNullOrWhiteSpace(query.Keyword) ? null : $"%{query.Keyword.Trim()}%");

        var sql = $@"
            SELECT {SelectColumns}
            FROM CourseGroup g
            WHERE (@Keyword IS NULL OR g.Description LIKE @Keyword)
            ORDER BY g.pkid DESC";

        return await connection.QueryAsync<CourseGroup>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<CourseGroup?> GetByIdAsync(short pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g WHERE g.pkid = @Pkid";
        return await connection.QuerySingleOrDefaultAsync<CourseGroup>(
            new CommandDefinition(sql, new { Pkid = pkid }, cancellationToken: cancellationToken));
    }

    public async Task<CourseGroup> CreateAsync(CourseGroupRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var pkid = await connection.ExecuteScalarAsync<short>(new CommandDefinition(
            @"INSERT INTO CourseGroup (Description) VALUES (@Description);
              SELECT CAST(SCOPE_IDENTITY() AS smallint);",
            request, cancellationToken: cancellationToken));

        // Freshly created group has no referencing rows yet.
        var created = new CourseGroup { Pkid = pkid, Description = request.Description };
        await _rowAudit.LogInsertAsync(AuditTableName, created, cancellationToken);
        return created;
    }

    public async Task<bool> UpdateAsync(CourseGroupRequest request, CancellationToken cancellationToken = default)
    {
        // Snapshot for the audit diff. A missing row means the UPDATE would have affected
        // nothing anyway, so the early return matches the previous behaviour.
        var before = await GetByIdAsync(request.Pkid, cancellationToken);
        if (before is null)
        {
            return false;
        }

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE CourseGroup SET Description = @Description WHERE pkid = @Pkid",
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
        // Read the row before it goes: ActionDesc is its Description.
        var deleted = await GetByIdAsync(pkid, cancellationToken);
        if (deleted is null)
        {
            return false;
        }

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        // FK_Course_CourseGroup is ON DELETE CASCADE — courses in the group are removed by SQL Server.
        // Those cascaded Course deletes get no audit row: SQL Server does them, so no repository
        // ever sees them. See spec/admin/RowAudit.md.
        // FK_PartnerCourseGroup_CourseGroup has no cascade — a referenced group throws SqlException 547
        // (translated to 409 Conflict by the controller), and the audit row is never reached.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseGroup WHERE pkid = @Pkid",
            new { Pkid = pkid }, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        await _rowAudit.LogDeleteAsync(AuditTableName, deleted, cancellationToken);
        return true;
    }
}
