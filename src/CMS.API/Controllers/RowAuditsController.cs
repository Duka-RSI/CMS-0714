using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

/// <summary>
/// Read-only access to a record's Row Audit history. A caller may only read the history of
/// records they could read themselves, so each audited table carries the same role
/// requirement its own controller does (see <see cref="AuditedTables"/>) — without this,
/// any logged-in user could harvest Admin-only metadata (AppUser ids, who changed what and
/// when) straight from the audit trail. There is no write endpoint: RowAudit rows are
/// written only by repositories, through <see cref="Auditing.IRowAuditWriter"/>.
/// </summary>
[ApiController]
[Route("api/row-audits")]
public class RowAuditsController : ControllerBase
{
    /// <summary>
    /// Every audited table → the role its history requires (null = any logged-in user),
    /// mirroring the [Authorize(Roles)] on the table's own controller. A table absent here
    /// is a 400: **a new audited feature must be registered here** or its badge shows
    /// "無法載入 Unavailable".
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string?> AuditedTables =
        new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            // Admin-only, like their controllers.
            ["AppUser"] = RoleNames.Admin,
            ["AppRole"] = RoleNames.Admin,
            ["PublishStatus"] = RoleNames.Admin,
            // Readable by any logged-in user, like their controllers.
            ["Course"] = null,
            ["CourseGroup"] = null,
            ["Partner"] = null,
            ["FeaturedPromoItem"] = null,
        };

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

        // A wrong value from an authenticated caller is a 400, never a 401 (the NG app
        // treats 401 as session expiry).
        if (!AuditedTables.TryGetValue(tableName, out var requiredRole))
        {
            return ValidationProblem("tableName 不是已稽核的資料表。");
        }

        if (requiredRole is not null && !User.IsInRole(requiredRole))
        {
            return Forbid();
        }

        var history = await _repository.GetHistoryAsync(tableName, pkid, cancellationToken);
        return Ok(history);
    }
}
