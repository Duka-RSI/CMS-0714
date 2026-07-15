using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

/// <summary>
/// Read-only access to a record's Row Audit history. Any logged-in caller (the global
/// FallbackPolicy) — the same audience that can already read the record itself, so its
/// change history is not a wider disclosure. There is no write endpoint: RowAudit rows are
/// written only by repositories, through <see cref="Auditing.IRowAuditWriter"/>.
/// </summary>
[ApiController]
[Route("api/row-audits")]
public class RowAuditsController : ControllerBase
{
    private readonly IRowAuditRepository _repository;

    public RowAuditsController(IRowAuditRepository repository)
    {
        _repository = repository;
    }

    /// <summary>
    /// The audit history of one record, newest first.
    /// </summary>
    /// <param name="tableName">The audited table, e.g. "Course".</param>
    /// <param name="pkid">
    /// The record's primary key. Sent as a string because RowAudit stores it as one
    /// (<c>PrimaryKeyValues</c> is nvarchar), so string PKs like AppRole.RoleId work too.
    /// </param>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<RowAuditHistoryItem>>> GetHistory(
        [FromQuery] string tableName,
        [FromQuery] string pkid,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(tableName) || string.IsNullOrWhiteSpace(pkid))
        {
            return ValidationProblem("tableName 與 pkid 皆為必填。");
        }

        var history = await _repository.GetHistoryAsync(tableName, pkid, cancellationToken);
        return Ok(history);
    }
}
