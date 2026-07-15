namespace CMS.API.Auditing;

/// <summary>
/// Writes one RowAudit row describing a change to any business table. Repositories call this
/// after a successful Insert / Update / Delete.
/// </summary>
/// <remarks>
/// Entities are read by reflection, so any model works without registering it anywhere.
/// A failed audit write never fails the caller — see <see cref="RowAuditWriter"/>.
/// </remarks>
public interface IRowAuditWriter
{
    /// <summary>
    /// Logs an insert. ActionDesc becomes the entity's first string property in declaration
    /// order (a Name/Title/Code field, typically).
    /// </summary>
    /// <param name="tableName">The audited table, e.g. "Course".</param>
    Task LogInsertAsync<T>(string tableName, T entity, CancellationToken cancellationToken = default)
        where T : class;

    /// <summary>
    /// Logs an update. ActionDesc becomes the names of the properties whose value differs
    /// between <paramref name="before"/> and <paramref name="after"/>. Writes nothing at all
    /// when they are identical.
    /// </summary>
    Task LogUpdateAsync<T>(string tableName, T before, T after, CancellationToken cancellationToken = default)
        where T : class;

    /// <summary>
    /// Logs a delete. ActionDesc becomes the deleted entity's first string property, by the
    /// same rule as <see cref="LogInsertAsync"/>.
    /// </summary>
    Task LogDeleteAsync<T>(string tableName, T entity, CancellationToken cancellationToken = default)
        where T : class;
}
