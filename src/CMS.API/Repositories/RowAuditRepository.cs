using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class RowAuditRepository : IRowAuditRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public RowAuditRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task InsertAsync(RowAuditEntry entry, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // Parameters are typed to match the columns: AnsiString for the varchar ones, so
        // SqlClient sends them as varchar rather than making SQL Server convert down from
        // nvarchar on every insert.
        var parameters = new DynamicParameters();
        parameters.Add("TableName", entry.TableName, DbType.AnsiString, size: 50);
        parameters.Add("UserName", entry.UserName, DbType.String, size: 100);
        parameters.Add("PrimaryKeyValues", entry.PrimaryKeyValues, DbType.String, size: 100);
        parameters.Add("ActionType", entry.ActionType, DbType.AnsiString, size: 20);
        parameters.Add("ActionDesc", entry.ActionDesc, DbType.AnsiString, size: 1000);
        parameters.Add("DateTime", entry.DateTime, DbType.DateTime);

        // pkid is IDENTITY — never written.
        await connection.ExecuteAsync(new CommandDefinition(
            @"INSERT INTO RowAudit (TableName, UserName, PrimaryKeyValues, ActionType, ActionDesc, [DateTime])
              VALUES (@TableName, @UserName, @PrimaryKeyValues, @ActionType, @ActionDesc, @DateTime)",
            parameters, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<RowAuditHistoryItem>> GetHistoryAsync(
        string tableName, string primaryKeyValues, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // Newest first; pkid is the IDENTITY tiebreaker so rows sharing a DateTime tick
        // (datetime resolves to ~3.33ms) still order by the sequence they were written.
        var parameters = new DynamicParameters();
        parameters.Add("TableName", tableName, DbType.AnsiString, size: 50);
        parameters.Add("PrimaryKeyValues", primaryKeyValues, DbType.String, size: 100);

        return await connection.QueryAsync<RowAuditHistoryItem>(new CommandDefinition(
            @"SELECT [DateTime], UserName, ActionType, ActionDesc
              FROM RowAudit
              WHERE TableName = @TableName AND PrimaryKeyValues = @PrimaryKeyValues
              ORDER BY [DateTime] DESC, pkid DESC",
            parameters, cancellationToken: cancellationToken));
    }
}
