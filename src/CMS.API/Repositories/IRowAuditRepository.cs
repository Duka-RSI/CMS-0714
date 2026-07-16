using CMS.API.Models;

namespace CMS.API.Repositories;

/// <summary>
/// Inserts rows into the RowAudit table.
/// </summary>
/// <remarks>
/// Split out from <see cref="Auditing.IRowAuditWriter"/> so the writer's reflection logic is
/// unit-testable: Dapper's async extensions require a real <c>DbConnection</c>, so a mocked
/// <see cref="Data.IDbConnectionFactory"/> cannot stand in for one. Repositories call the
/// writer, never this.
/// </remarks>
public interface IRowAuditRepository
{
    Task InsertAsync(RowAuditEntry entry, CancellationToken cancellationToken = default);

    /// <summary>
    /// The audit history of one record — every RowAudit row for a
    /// (<paramref name="tableName"/>, <paramref name="primaryKeyValues"/>) pair, newest first.
    /// </summary>
    Task<IEnumerable<RowAuditHistoryItem>> GetHistoryAsync(
        string tableName, string primaryKeyValues, CancellationToken cancellationToken = default);
}
