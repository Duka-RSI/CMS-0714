using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class CourseGroupRepository : ICourseGroupRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public CourseGroupRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
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
        return new CourseGroup { Pkid = pkid, Description = request.Description };
    }

    public async Task<bool> UpdateAsync(CourseGroupRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE CourseGroup SET Description = @Description WHERE pkid = @Pkid",
            request, cancellationToken: cancellationToken));
        return affected > 0;
    }

    public async Task<bool> DeleteAsync(short pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        // FK_Course_CourseGroup is ON DELETE CASCADE — courses in the group are removed by SQL Server.
        // FK_PartnerCourseGroup_CourseGroup has no cascade — a referenced group throws SqlException 547
        // (translated to 409 Conflict by the controller).
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseGroup WHERE pkid = @Pkid",
            new { Pkid = pkid }, cancellationToken: cancellationToken));
        return affected > 0;
    }
}
