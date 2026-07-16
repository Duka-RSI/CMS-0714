namespace CMS.API.Auditing;

/// <summary>
/// Marks a model property that <see cref="RowAuditWriter"/> must ignore entirely.
/// </summary>
/// <remarks>
/// For properties that are **not columns of the audited table**: labels flattened in by a
/// JOIN (<c>Course.PartnerName</c>) and subquery counts (<c>AppRole.UserCount</c>).
///
/// Without this, an update reports them alongside the column that actually changed —
/// "PartnerPkid, PartnerName" for one edit — and a count derived from *another* table
/// (<c>CourseGroup.CourseCount</c>) would show up as a change to a row nobody touched.
///
/// The writer skips marked properties for every purpose: the update diff, the
/// first-string-property rule behind ActionDesc, and the pkid lookup.
///
/// **Mark the derived properties on any new model.** Forgetting is silent — the audit rows
/// are merely noisier, and nothing fails.
/// </remarks>
[AttributeUsage(AttributeTargets.Property)]
public sealed class NotAuditedAttribute : Attribute
{
}
