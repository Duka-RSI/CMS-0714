using System.Text;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Tests for the SysConfig-backed signing key: its validation rules and, importantly, its
/// caching — token validation runs on every authenticated request, so a cache miss per
/// request would mean a database round-trip per API call.
/// </summary>
public class SigningKeyProviderTests
{
    private const string ValidKey = "cloud4fun#123456cloud4fun#123456";   // 32 bytes

    private readonly Mock<ISysConfigRepository> _sysConfig = new(MockBehavior.Strict);
    private readonly MutableTimeProvider _time = new();

    /// <summary>A clock we can wind forward, so the TTL is testable without sleeping.</summary>
    private sealed class MutableTimeProvider : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 7, 15, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private SigningKeyProvider ProviderWithKey(string? key)
    {
        _sysConfig.Setup(s => s.GetAppConfigAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppConfig { DefaultPassword = "CMS4fun#", SymmetricSecurityKey = key });
        return BuildProvider();
    }

    private SigningKeyProvider BuildProvider()
    {
        // SigningKeyProvider is a singleton resolving a scoped repository, so it needs a real
        // scope factory rather than a mocked one.
        var services = new ServiceCollection();
        services.AddScoped(_ => _sysConfig.Object);
        var scopeFactory = services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
        return new SigningKeyProvider(scopeFactory, _time);
    }

    private static string KeyMaterialOf(SecurityKey key)
        => Encoding.UTF8.GetString(((SymmetricSecurityKey)key).Key);

    // ----- Reading -----

    [Fact]
    public async Task GetAsync_ReturnsTheSysConfigSecret()
    {
        var key = await ProviderWithKey(ValidKey).GetAsync();

        Assert.Equal(ValidKey, KeyMaterialOf(key));
    }

    [Fact]
    public void Get_ReturnsTheSameKeyAsTheAsyncOverload()
    {
        // The sync overload exists for JwtBearer's IssuerSigningKeyResolver.
        var key = ProviderWithKey(ValidKey).Get();

        Assert.Equal(ValidKey, KeyMaterialOf(key));
    }

    // ----- Caching -----

    [Fact]
    public async Task GetAsync_ReadsSysConfigOnlyOnceWithinTheTtl()
    {
        var provider = ProviderWithKey(ValidKey);

        await provider.GetAsync();
        await provider.GetAsync();
        await provider.GetAsync();

        _sysConfig.Verify(s => s.GetAppConfigAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetAsync_RereadsSysConfigOnceTheTtlExpires()
    {
        var provider = ProviderWithKey(ValidKey);
        await provider.GetAsync();

        _time.Now = _time.Now.Add(SigningKeyProvider.CacheTtl).AddSeconds(1);
        await provider.GetAsync();

        // Rotating the SysConfig row must take effect without a restart.
        _sysConfig.Verify(s => s.GetAppConfigAsync(It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task GetAsync_PicksUpARotatedSecretAfterTheTtl()
    {
        const string rotated = "rotated#123456rotated#1234567890";
        var provider = ProviderWithKey(ValidKey);
        Assert.Equal(ValidKey, KeyMaterialOf(await provider.GetAsync()));

        _sysConfig.Setup(s => s.GetAppConfigAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppConfig { DefaultPassword = "CMS4fun#", SymmetricSecurityKey = rotated });
        _time.Now = _time.Now.Add(SigningKeyProvider.CacheTtl).AddSeconds(1);

        Assert.Equal(rotated, KeyMaterialOf(await provider.GetAsync()));
    }

    // ----- Validation -----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task GetAsync_WithoutASecret_Throws(string? key)
    {
        var provider = ProviderWithKey(key);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => provider.GetAsync());
        Assert.Contains("symmetricSecurityKey", ex.Message);
    }

    [Fact]
    public async Task GetAsync_WithTooShortASecret_Throws()
    {
        // 31 bytes — one short of the 256 bits HMAC-SHA256 requires.
        var provider = ProviderWithKey(new string('k', 31));

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => provider.GetAsync());
        Assert.Contains("32", ex.Message);
    }

    [Fact]
    public async Task GetAsync_PropagatesABrokenSysConfigRow()
    {
        _sysConfig.Setup(s => s.GetAppConfigAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SysConfig 'appConfig' 設定不存在或為空。"));
        var provider = BuildProvider();

        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.GetAsync());
    }

    [Fact]
    public async Task GetAsync_DoesNotCacheAFailure()
    {
        _sysConfig.Setup(s => s.GetAppConfigAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("transient"));
        var provider = BuildProvider();
        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.GetAsync());

        // A DB blip must not poison the provider for the rest of the TTL.
        _sysConfig.Setup(s => s.GetAppConfigAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppConfig { DefaultPassword = "CMS4fun#", SymmetricSecurityKey = ValidKey });

        Assert.Equal(ValidKey, KeyMaterialOf(await provider.GetAsync()));
    }
}
