using System.Text;
using CMS.API.Repositories;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Security;

/// <summary>
/// Reads the `symmetricSecurityKey` from the SysConfig 'appConfig' JSON and caches it for
/// <see cref="CacheTtl"/>.
/// </summary>
/// <remarks>
/// Why a cache: token *validation* runs on every authenticated request, so reading the row
/// each time would put a database round-trip in front of every API call. Why a TTL rather
/// than read-once-at-startup: the secret stays rotatable without a redeploy (a rotation
/// takes effect within <see cref="CacheTtl"/>), and a database that is down at boot does
/// not stop the app from starting.
///
/// Registered as a singleton, so it resolves the scoped <see cref="ISysConfigRepository"/>
/// through <see cref="IServiceScopeFactory"/> rather than injecting it.
/// </remarks>
public sealed class SigningKeyProvider : ISigningKeyProvider
{
    /// <summary>How long a loaded key is reused before SysConfig is read again.</summary>
    public static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    // HMAC-SHA256 requires a key of at least 256 bits; IdentityModel rejects anything shorter.
    private const int MinimumKeyBytes = 32;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private SymmetricSecurityKey? _cached;
    private DateTimeOffset _cachedUntil;

    public SigningKeyProvider(IServiceScopeFactory scopeFactory, TimeProvider timeProvider)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
    }

    public async Task<SymmetricSecurityKey> GetAsync(CancellationToken cancellationToken = default)
    {
        if (TryGetCached(out var cached))
        {
            return cached;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            // Re-check: another caller may have loaded it while we waited for the gate.
            if (TryGetCached(out cached))
            {
                return cached;
            }

            var key = await LoadAsync(cancellationToken);
            _cached = key;
            _cachedUntil = _timeProvider.GetUtcNow().Add(CacheTtl);
            return key;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <remarks>
    /// Sync-over-async, deliberately: JwtBearer's IssuerSigningKeyResolver offers no async
    /// seam. The blocking read only happens on a cold or stale cache — once per TTL, not
    /// per request — and there is no synchronization context here to deadlock against.
    /// </remarks>
    public SymmetricSecurityKey Get()
        => TryGetCached(out var cached) ? cached : GetAsync().GetAwaiter().GetResult();

    private bool TryGetCached(out SymmetricSecurityKey key)
    {
        var cached = Volatile.Read(ref _cached);
        if (cached is not null && _timeProvider.GetUtcNow() < _cachedUntil)
        {
            key = cached;
            return true;
        }

        key = null!;
        return false;
    }

    private async Task<SymmetricSecurityKey> LoadAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var sysConfig = scope.ServiceProvider.GetRequiredService<ISysConfigRepository>();

        // Throws InvalidOperationException when the row is missing or the JSON is malformed.
        var appConfig = await sysConfig.GetAppConfigAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(appConfig.SymmetricSecurityKey))
        {
            throw new InvalidOperationException(
                "SysConfig 'appConfig' 未設定 'symmetricSecurityKey',無法簽發或驗證存取權杖。");
        }

        var keyBytes = Encoding.UTF8.GetBytes(appConfig.SymmetricSecurityKey);
        if (keyBytes.Length < MinimumKeyBytes)
        {
            throw new InvalidOperationException(
                $"SysConfig 'appConfig' 的 'symmetricSecurityKey' 長度不足 " +
                $"({keyBytes.Length} bytes),HMAC-SHA256 至少需要 {MinimumKeyBytes} bytes。");
        }

        return new SymmetricSecurityKey(keyBytes);
    }
}
