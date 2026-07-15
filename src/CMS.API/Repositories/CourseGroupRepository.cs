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

    private const string SelectColumns = @"
        cg.pkid, cg.Description";

    public async Task<IEnumerable<CourseGroup>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} FROM CourseGroup cg ORDER BY cg.pkid ASC";
        return await connection.QueryAsync<CourseGroup>(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Keyword", string.IsNullOrWhiteSpace(query.Keyword) ? null : $"%{query.Keyword.Trim()}%");

        var sql = $@"
            SELECT {SelectColumns}
            FROM CourseGroup cg
            WHERE (@Keyword IS NULL OR cg.Description LIKE @Keyword)
            ORDER BY cg.pkid ASC";

        return await connection.QueryAsync<CourseGroup>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<CourseGroup?> GetByIdAsync(short pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} FROM CourseGroup cg WHERE cg.pkid = @Pkid";
        return await connection.QuerySingleOrDefaultAsync<CourseGroup>(
            new CommandDefinition(sql, new { Pkid = pkid }, cancellationToken: cancellationToken));
    }

    public async Task<CourseGroup> CreateAsync(CourseGroupRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // pkid is IDENTITY — excluded from the INSERT; SCOPE_IDENTITY() returns the new key.
        var newPkid = await connection.ExecuteScalarAsync<short>(new CommandDefinition(
            @"INSERT INTO CourseGroup (Description)
              VALUES (@Description);
              SELECT CAST(SCOPE_IDENTITY() AS smallint);",
            request, cancellationToken: cancellationToken));

        var created = await GetByIdAsync(newPkid, cancellationToken);
        return created!;
    }

    public async Task<bool> UpdateAsync(CourseGroupRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // pkid is the immutable primary key — never updated.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE CourseGroup
              SET Description = @Description
              WHERE pkid = @Pkid",
            request, cancellationToken: cancellationToken));

        return affected > 0;
    }

    public async Task<bool> DeleteAsync(short pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseGroup WHERE pkid = @Pkid",
            new { Pkid = pkid }, cancellationToken: cancellationToken));
        return affected > 0;
    }
}
