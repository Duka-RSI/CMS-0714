namespace CMS.API.Models;

/// <summary>
/// One row of a record's audit history, as returned by <c>GET /api/row-audits</c>.
/// </summary>
/// <remarks>
/// A read-only projection of <see cref="RowAuditEntry"/> minus the routing columns
/// (TableName / PrimaryKeyValues are the filter, not payload) and the IDENTITY pkid.
/// </remarks>
public sealed class RowAuditHistoryItem
{
    /// <summary>When the change happened (UTC, as stored).</summary>
    public DateTime DateTime { get; set; }

    /// <summary>The user who made it, or "system".</summary>
    public string UserName { get; set; } = string.Empty;

    /// <summary>"Insert" | "Update" | "Delete".</summary>
    public string ActionType { get; set; } = string.Empty;

    /// <summary>Insert/Delete: the record's label. Update: the changed column names. May be null.</summary>
    public string? ActionDesc { get; set; }
}
