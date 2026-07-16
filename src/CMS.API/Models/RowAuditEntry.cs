namespace CMS.API.Models;

/// <summary>
/// One row of the RowAudit table — a single change to a single business row.
/// </summary>
/// <remarks>
/// Built by <see cref="Auditing.RowAuditWriter"/> and inserted by
/// <see cref="Repositories.IRowAuditRepository"/>. Every string here is already truncated to
/// its column's limit by the writer; the repository inserts it verbatim.
///
/// RowAudit.pkid is an IDENTITY and is deliberately absent — it is never written.
/// </remarks>
public sealed class RowAuditEntry
{
    /// <summary>The audited table, e.g. "Course". Column is varchar(50).</summary>
    public required string TableName { get; init; }

    /// <summary>
    /// The signed-in user's UserName, or "system" when there is no authenticated caller.
    /// Column is nvarchar(100).
    /// </summary>
    public required string UserName { get; init; }

    /// <summary>The audited row's pkid, as a string. Column is nvarchar(100).</summary>
    public required string PrimaryKeyValues { get; init; }

    /// <summary>"Insert", "Update" or "Delete". Column is varchar(20).</summary>
    public required string ActionType { get; init; }

    /// <summary>
    /// Insert/Delete: the entity's first string property. Update: the changed property names.
    /// Column is varchar(1000) and nullable.
    /// </summary>
    public string? ActionDesc { get; init; }

    /// <summary>When the change happened (UTC). Column is datetime.</summary>
    public DateTime DateTime { get; init; }

    /// <summary>
    /// Update: JSON of the changed properties' old values. Delete: JSON of the whole audited
    /// row as it stood. Insert: null. Column is nvarchar(max) and nullable.
    /// </summary>
    public string? BeforeValues { get; init; }

    /// <summary>
    /// Update: JSON of the changed properties' new values. Insert/Delete: null.
    /// Column is nvarchar(max) and nullable.
    /// </summary>
    public string? AfterValues { get; init; }
}
