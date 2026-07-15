using System.Collections;
using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;

namespace CMS.API.Auditing;

/// <summary>
/// Builds and writes RowAudit rows for any entity type via reflection.
/// </summary>
/// <remarks>
/// <para><b>Failures are swallowed.</b> Repositories call this <i>after</i> the business row is
/// already committed, so throwing here would report a failure for work that actually
/// succeeded. A failed audit write is logged as a warning and nothing else.</para>
///
/// <para><b>UserName comes from the token's "name" claim</b> and therefore goes stale after a
/// self-service rename until the next login — the token is not re-issued (see
/// spec/auth/Authorization.md). The audit row records the name as it stood when the token was
/// minted, which is close enough for an audit trail and costs no database round-trip.</para>
/// </remarks>
public sealed class RowAuditWriter : IRowAuditWriter
{
    /// <summary>UserName written when there is no authenticated caller.</summary>
    public const string SystemUserName = "system";

    /// <summary>Property holding the audited row's primary key. Matched case-insensitively.</summary>
    public const string PkidPropertyName = "pkid";

    /// <summary>Separator between changed property names in an Update's ActionDesc.</summary>
    public const string ChangedPropertySeparator = ", ";

    public const string InsertAction = "Insert";
    public const string UpdateAction = "Update";
    public const string DeleteAction = "Delete";

    // Column limits. The varchar ones are byte budgets, not character counts — see
    // TruncateToAnsiBytes.
    private const int TableNameMaxBytes = 50;
    private const int ActionDescMaxBytes = 1000;
    private const int UserNameMaxChars = 100;
    private const int PrimaryKeyValuesMaxChars = 100;

    /// <summary>Reflection is per-type and immutable, so it is resolved once and cached.</summary>
    private static readonly ConcurrentDictionary<Type, PropertyInfo[]> PropertyCache = new();

    /// <summary>
    /// Options for the BeforeValues/AfterValues JSON. The relaxed encoder keeps Chinese
    /// readable in the column — the strict default escapes every CJK character to its
    /// backslash-u form, tripling the size. The value lands in an nvarchar(max) column,
    /// never in HTML, so that escaping buys nothing here.
    /// </summary>
    private static readonly JsonSerializerOptions ValueJsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly IRowAuditRepository _repository;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<RowAuditWriter> _logger;

    public RowAuditWriter(
        IRowAuditRepository repository,
        IHttpContextAccessor httpContextAccessor,
        TimeProvider timeProvider,
        ILogger<RowAuditWriter> logger)
    {
        _repository = repository;
        _httpContextAccessor = httpContextAccessor;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public Task LogInsertAsync<T>(string tableName, T entity, CancellationToken cancellationToken = default)
        where T : class
        // No value payloads: the inserted row is the current state of the table itself.
        => WriteAsync(tableName, InsertAction, PrimaryKeyOf(entity), FirstStringValueOf(entity),
            beforeValues: null, afterValues: null, cancellationToken);

    public Task LogDeleteAsync<T>(string tableName, T entity, CancellationToken cancellationToken = default)
        where T : class
        // BeforeValues keeps the whole audited row as it stood — after the DELETE this is the
        // only place its values still exist, which is what makes an accidental delete traceable.
        => WriteAsync(tableName, DeleteAction, PrimaryKeyOf(entity), FirstStringValueOf(entity),
            beforeValues: SerializeValues(SnapshotOf(entity)), afterValues: null, cancellationToken);

    public Task LogUpdateAsync<T>(string tableName, T before, T after, CancellationToken cancellationToken = default)
        where T : class
    {
        var changed = ChangedPropertyNames(before, after);

        // An update that changed nothing gets no row: an audit trail of "someone saved the
        // form without editing it" is noise, and an empty ActionDesc would not be
        // distinguishable from one we failed to build.
        if (changed.Count == 0)
        {
            return Task.CompletedTask;
        }

        // Only the changed properties' values, mirroring the names in ActionDesc — a Course
        // carries several nvarchar(4000) columns, and storing untouched ones on every edit
        // would bloat the table for nothing.
        return WriteAsync(
            tableName,
            UpdateAction,
            PrimaryKeyOf(after),
            string.Join(ChangedPropertySeparator, changed),
            beforeValues: SerializeValues(ValuesOf(before, changed)),
            afterValues: SerializeValues(ValuesOf(after, changed)),
            cancellationToken);
    }

    private async Task WriteAsync(
        string tableName,
        string actionType,
        string primaryKeyValues,
        string? actionDesc,
        string? beforeValues,
        string? afterValues,
        CancellationToken cancellationToken)
    {
        try
        {
            var entry = new RowAuditEntry
            {
                TableName = TruncateToAnsiBytes(tableName ?? string.Empty, TableNameMaxBytes),
                UserName = TruncateToChars(CurrentUserName(), UserNameMaxChars),
                PrimaryKeyValues = TruncateToChars(primaryKeyValues, PrimaryKeyValuesMaxChars),
                ActionType = actionType,
                ActionDesc = actionDesc is null ? null : TruncateToAnsiBytes(actionDesc, ActionDescMaxBytes),
                DateTime = _timeProvider.GetUtcNow().UtcDateTime,
                // nvarchar(max) — no truncation needed.
                BeforeValues = beforeValues,
                AfterValues = afterValues,
            };

            await _repository.InsertAsync(entry, cancellationToken);
        }
        catch (Exception ex)
        {
            // The business row is already committed; losing its audit row must not turn a
            // successful save into a 500.
            _logger.LogWarning(
                ex,
                "Failed to write a RowAudit row for {ActionType} on {TableName} (pk {PrimaryKeyValues}).",
                actionType, tableName, primaryKeyValues);
        }
    }

    /// <summary>
    /// The signed-in user's UserName from the current request's token, or
    /// <see cref="SystemUserName"/> when there is no authenticated caller (a background task,
    /// or a request that never went through authentication).
    /// </summary>
    private string CurrentUserName()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true)
        {
            return SystemUserName;
        }

        // JwtBearer runs with MapInboundClaims = false, so the claim type is the literal
        // "name" that JwtTokenService wrote.
        var userName = user.FindFirst(JwtTokenService.UserNameClaimType)?.Value;
        return string.IsNullOrWhiteSpace(userName) ? SystemUserName : userName;
    }

    // ----- Reflection -----

    private static string PrimaryKeyOf<T>(T entity) where T : class
    {
        var pkid = AuditableProperties(typeof(T))
            .FirstOrDefault(p => string.Equals(p.Name, PkidPropertyName, StringComparison.OrdinalIgnoreCase));

        return pkid?.GetValue(entity)?.ToString() ?? string.Empty;
    }

    /// <summary>The first string-typed property in declaration order, or null if there is none.</summary>
    private static string? FirstStringValueOf<T>(T entity) where T : class
        => AuditableProperties(typeof(T))
            .FirstOrDefault(p => p.PropertyType == typeof(string))
            ?.GetValue(entity) as string;

    private static List<string> ChangedPropertyNames<T>(T before, T after) where T : class
    {
        var changed = new List<string>();
        foreach (var property in AuditableProperties(typeof(T)))
        {
            if (!ValuesMatch(property.GetValue(before), property.GetValue(after)))
            {
                changed.Add(property.Name);
            }
        }

        return changed;
    }

    /// <summary>The named properties' values, in declaration order (Dictionary preserves insertion order).</summary>
    private static Dictionary<string, object?> ValuesOf<T>(T entity, List<string> propertyNames) where T : class
    {
        var wanted = new HashSet<string>(propertyNames, StringComparer.Ordinal);
        return AuditableProperties(typeof(T))
            .Where(p => wanted.Contains(p.Name))
            .ToDictionary(p => p.Name, p => p.GetValue(entity));
    }

    /// <summary>Every auditable property's value — the whole row as the writer sees it.</summary>
    private static Dictionary<string, object?> SnapshotOf<T>(T entity) where T : class
        => AuditableProperties(typeof(T)).ToDictionary(p => p.Name, p => p.GetValue(entity));

    /// <summary>
    /// The values as JSON, or null if serialization fails — a value payload we could not
    /// build must degrade the row, not lose it (and never fail the caller).
    /// </summary>
    private string? SerializeValues(Dictionary<string, object?> values)
    {
        try
        {
            return JsonSerializer.Serialize(values, ValueJsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to serialize RowAudit values; storing NULL instead.");
            return null;
        }
    }

    /// <summary>
    /// Public readable instance properties that are actual columns, in declaration order.
    /// </summary>
    /// <remarks>
    /// GetProperties() does not guarantee an order, so the metadata token — which increases in
    /// declaration order within a type — is what actually pins "the FIRST string property".
    ///
    /// <see cref="NotAuditedAttribute"/> properties are dropped here rather than at each call
    /// site, so a JOINed label or a subquery count is invisible to the diff, to the
    /// first-string-property rule and to the pkid lookup alike.
    /// </remarks>
    private static PropertyInfo[] AuditableProperties(Type type)
        => PropertyCache.GetOrAdd(type, static t => t
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanRead
                        && p.GetIndexParameters().Length == 0
                        && !p.IsDefined(typeof(NotAuditedAttribute), inherit: true))
            .OrderBy(p => p.MetadataToken)
            .ToArray());

    /// <summary>
    /// Value equality, with collections compared element-wise.
    /// </summary>
    /// <remarks>
    /// The N-N link properties (AppRole.UserIds, AppUser.RoleIds, …) are List&lt;string&gt;,
    /// which does not override Equals — reference comparison would report every one of them as
    /// changed on every update.
    /// </remarks>
    private static bool ValuesMatch(object? before, object? after)
    {
        if (before is null || after is null)
        {
            return before is null && after is null;
        }

        // string is IEnumerable<char>; compare it as a value, not as a sequence.
        if (before is string || after is string)
        {
            return Equals(before, after);
        }

        if (before is IEnumerable beforeItems && after is IEnumerable afterItems)
        {
            return SequencesMatch(beforeItems, afterItems);
        }

        return Equals(before, after);
    }

    private static bool SequencesMatch(IEnumerable before, IEnumerable after)
    {
        var beforeEnumerator = before.GetEnumerator();
        var afterEnumerator = after.GetEnumerator();
        try
        {
            while (true)
            {
                var beforeMoved = beforeEnumerator.MoveNext();
                var afterMoved = afterEnumerator.MoveNext();

                if (beforeMoved != afterMoved)
                {
                    return false;
                }

                if (!beforeMoved)
                {
                    return true;
                }

                if (!ValuesMatch(beforeEnumerator.Current, afterEnumerator.Current))
                {
                    return false;
                }
            }
        }
        finally
        {
            (beforeEnumerator as IDisposable)?.Dispose();
            (afterEnumerator as IDisposable)?.Dispose();
        }
    }

    // ----- Truncation -----

    /// <summary>Truncates to a character count, for the nvarchar columns.</summary>
    internal static string TruncateToChars(string value, int maxChars)
    {
        if (value.Length <= maxChars)
        {
            return value;
        }

        // Don't cut a surrogate pair in half.
        var cut = char.IsLowSurrogate(value[maxChars]) ? maxChars - 1 : maxChars;
        return value[..Math.Max(cut, 0)];
    }

    /// <summary>
    /// Truncates to a byte budget, for the varchar columns.
    /// </summary>
    /// <remarks>
    /// The database collation is Chinese_Taiwan_Stroke_CI_AS, so a varchar column is measured
    /// in cp950 bytes, not characters: a 501-character Chinese title overflows varchar(1000)
    /// and SQL Server rejects the insert outright. cp950 encodes ASCII in one byte and
    /// everything else in at most two (an unmappable character collapses to a single '?'), so
    /// costing every non-ASCII character at two never under-counts what actually gets stored —
    /// which is the direction that matters.
    ///
    /// The lossiness is accepted: a character outside Big5 (emoji, kana, Cyrillic) is stored as
    /// '?' by the column's own type. Widening it to nvarchar would be a schema change.
    /// </remarks>
    internal static string TruncateToAnsiBytes(string value, int maxBytes)
    {
        var bytes = 0;
        for (var i = 0; i < value.Length; i++)
        {
            bytes += value[i] <= 0x7F ? 1 : 2;
            if (bytes > maxBytes)
            {
                var cut = char.IsLowSurrogate(value[i]) ? i - 1 : i;
                return value[..Math.Max(cut, 0)];
            }
        }

        return value;
    }
}
