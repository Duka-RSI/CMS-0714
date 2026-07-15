using System.Security.Claims;
using CMS.API.Auditing;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// The writer's reflection logic: which property becomes ActionDesc, which becomes
/// PrimaryKeyValues, how an update's changed-property list is built, where UserName comes
/// from, and the column limits.
/// </summary>
/// <remarks>
/// IRowAuditRepository is mocked, so no database is touched — the SQL itself is not covered
/// here (Dapper's async extensions need a real DbConnection, which is the reason the
/// repository is a separate seam at all).
/// </remarks>
public class RowAuditWriterTests
{
    private readonly Mock<IRowAuditRepository> _repository = new();
    private readonly Mock<IHttpContextAccessor> _httpContextAccessor = new();
    private readonly MutableTimeProvider _time = new();

    /// <summary>The entry handed to the repository, or null if nothing was written.</summary>
    private RowAuditEntry? _written;

    public RowAuditWriterTests()
    {
        _repository
            .Setup(r => r.InsertAsync(It.IsAny<RowAuditEntry>(), It.IsAny<CancellationToken>()))
            .Callback<RowAuditEntry, CancellationToken>((entry, _) => _written = entry)
            .Returns(Task.CompletedTask);

        // Default: an authenticated caller, so the tests that are not about the claim don't
        // all have to arrange one.
        SignIn("miles");
    }

    private RowAuditWriter CreateWriter() => new(
        _repository.Object,
        _httpContextAccessor.Object,
        _time,
        NullLogger<RowAuditWriter>.Instance);

    /// <summary>Puts an authenticated principal carrying the given "name" claim on the request.</summary>
    private void SignIn(string? userName)
    {
        var claims = new List<Claim> { new(JwtTokenService.UserIdClaimType, "miles@uuu.com.tw") };
        if (userName is not null)
        {
            claims.Add(new Claim(JwtTokenService.UserNameClaimType, userName));
        }

        // A non-null authenticationType is what makes IsAuthenticated true.
        var identity = new ClaimsIdentity(claims, "TestBearer");
        _httpContextAccessor
            .Setup(a => a.HttpContext)
            .Returns(new DefaultHttpContext { User = new ClaimsPrincipal(identity) });
    }

    // ----- ActionDesc: Insert / Delete take the first string property -----

    [Fact]
    public async Task LogInsert_WritesTheFirstStringPropertyAsActionDesc()
    {
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 7, Name = "報表模組", Description = "second" });

        Assert.NotNull(_written);
        // Name, not Description — and not DisplayOrder, which is declared first but isn't a string.
        Assert.Equal("報表模組", _written!.ActionDesc);
        Assert.Equal("Widget", _written.TableName);
        Assert.Equal("Insert", _written.ActionType);
    }

    [Fact]
    public async Task LogDelete_WritesTheFirstStringPropertyAsActionDesc()
    {
        var writer = CreateWriter();

        await writer.LogDeleteAsync("Widget", new Widget { Pkid = 7, Name = "gone", Description = "second" });

        Assert.NotNull(_written);
        Assert.Equal("gone", _written!.ActionDesc);
        Assert.Equal("Delete", _written.ActionType);
    }

    [Fact]
    public async Task LogInsert_WithANullFirstStringProperty_WritesANullActionDesc()
    {
        var writer = CreateWriter();

        // Name is the first string property and it is null: the rule still picks it, rather
        // than falling through to the next string property.
        await writer.LogInsertAsync("Widget", new Widget { Pkid = 7, Name = null!, Description = "second" });

        Assert.NotNull(_written);
        Assert.Null(_written!.ActionDesc);
    }

    [Fact]
    public async Task LogInsert_WithNoStringProperty_WritesANullActionDesc()
    {
        var writer = CreateWriter();

        await writer.LogInsertAsync("Numeric", new NumericOnly { Pkid = 3, Count = 9 });

        Assert.NotNull(_written);
        Assert.Null(_written!.ActionDesc);
    }

    // ----- ActionDesc: Update lists the changed property names -----

    [Fact]
    public async Task LogUpdate_WritesExactlyTheChangedPropertyNames()
    {
        var writer = CreateWriter();
        var before = new Widget { Pkid = 7, DisplayOrder = 1, Name = "old", Description = "same", IsActive = false };
        var after = new Widget { Pkid = 7, DisplayOrder = 2, Name = "new", Description = "same", IsActive = false };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.NotNull(_written);
        // DisplayOrder and Name changed; Pkid, Description and IsActive did not.
        Assert.Equal("DisplayOrder, Name", _written!.ActionDesc);
        Assert.Equal("Update", _written.ActionType);
    }

    [Fact]
    public async Task LogUpdate_ListsChangedNamesInDeclarationOrder()
    {
        var writer = CreateWriter();
        var before = new Widget { Pkid = 7, DisplayOrder = 1, Name = "old", Description = "old", IsActive = false };
        var after = new Widget { Pkid = 7, DisplayOrder = 2, Name = "new", Description = "new", IsActive = true };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.Equal("DisplayOrder, Name, Description, IsActive", _written!.ActionDesc);
    }

    [Fact]
    public async Task LogUpdate_TreatsANullToValueTransitionAsAChange()
    {
        var writer = CreateWriter();
        var before = new Widget { Pkid = 7, Name = "x", Description = null };
        var after = new Widget { Pkid = 7, Name = "x", Description = "now set" };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.Equal("Description", _written!.ActionDesc);
    }

    [Fact]
    public async Task LogUpdate_WithNothingChanged_WritesNoRowAtAll()
    {
        var writer = CreateWriter();
        var before = new Widget { Pkid = 7, DisplayOrder = 1, Name = "same", Description = "same", IsActive = true };
        var after = new Widget { Pkid = 7, DisplayOrder = 1, Name = "same", Description = "same", IsActive = true };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.Null(_written);
        _repository.Verify(
            r => r.InsertAsync(It.IsAny<RowAuditEntry>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ----- Update: collection properties compare element-wise -----

    [Fact]
    public async Task LogUpdate_IgnoresACollectionWhoseContentsAreUnchanged()
    {
        var writer = CreateWriter();
        // Two distinct List<string> instances holding the same items. List<string> doesn't
        // override Equals, so a reference comparison would call this a change.
        var before = new Widget { Pkid = 7, Name = "x", Tags = ["a", "b"] };
        var after = new Widget { Pkid = 7, Name = "x", Tags = ["a", "b"] };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.Null(_written);
    }

    [Theory]
    [InlineData(new[] { "a", "c" }, "an element differs")]
    [InlineData(new[] { "a", "b", "c" }, "an element was added")]
    [InlineData(new[] { "a" }, "an element was removed")]
    [InlineData(new string[0], "all elements were removed")]
    [InlineData(new[] { "b", "a" }, "the order differs")]
    public async Task LogUpdate_ReportsACollectionWhoseContentsChanged(string[] afterTags, string why)
    {
        var writer = CreateWriter();
        var before = new Widget { Pkid = 7, Name = "x", Tags = ["a", "b"] };
        var after = new Widget { Pkid = 7, Name = "x", Tags = [.. afterTags] };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.NotNull(_written);
        Assert.Equal("Tags", _written!.ActionDesc);
        Assert.NotNull(why);
    }

    // ----- [NotAudited] -----

    [Fact]
    public async Task LogUpdate_IgnoresANotAuditedProperty()
    {
        var writer = CreateWriter();
        // PartnerName is a JOINed label, not a column of this table: changing PartnerPkid
        // drags it along, and reporting both would double-count one edit.
        var before = new Derived { Pkid = 1, Title = "x", PartnerPkid = 1, PartnerName = "Alpha", UserCount = 3 };
        var after = new Derived { Pkid = 1, Title = "x", PartnerPkid = 2, PartnerName = "Beta", UserCount = 4 };

        await writer.LogUpdateAsync("Derived", before, after);

        Assert.Equal("PartnerPkid", _written!.ActionDesc);
    }

    [Fact]
    public async Task LogUpdate_WithOnlyNotAuditedPropertiesChanged_WritesNoRow()
    {
        var writer = CreateWriter();
        // A subquery count can move because another table changed. Nothing happened to
        // *this* row, so it earns no audit row.
        var before = new Derived { Pkid = 1, Title = "x", PartnerPkid = 1, PartnerName = "Alpha", UserCount = 3 };
        var after = new Derived { Pkid = 1, Title = "x", PartnerPkid = 1, PartnerName = "Beta", UserCount = 99 };

        await writer.LogUpdateAsync("Derived", before, after);

        Assert.Null(_written);
    }

    [Fact]
    public async Task LogInsert_SkipsANotAuditedStringWhenChoosingActionDesc()
    {
        var writer = CreateWriter();

        // NotAuditedLabel is declared before Title and is a string, but it is invisible to
        // the writer — so ActionDesc is Title.
        await writer.LogInsertAsync("Skipped", new NotAuditedFirstString { Pkid = 1, Label = "joined", Title = "real" });

        Assert.Equal("real", _written!.ActionDesc);
    }

    // ----- PrimaryKeyValues -----

    [Fact]
    public async Task LogInsert_ReadsPrimaryKeyValuesFromPkid()
    {
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 42, Name = "x" });

        Assert.Equal("42", _written!.PrimaryKeyValues);
    }

    [Fact]
    public async Task LogUpdate_ReadsPrimaryKeyValuesFromPkid()
    {
        var writer = CreateWriter();
        var before = new Widget { Pkid = 42, Name = "old" };
        var after = new Widget { Pkid = 42, Name = "new" };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.Equal("42", _written!.PrimaryKeyValues);
    }

    [Fact]
    public async Task LogInsert_FindsPkidCaseInsensitively()
    {
        var writer = CreateWriter();

        // Every model in this codebase spells the property "Pkid" while the column is "pkid".
        await writer.LogInsertAsync("Lower", new LowerCasePkid { pkid = 5, Label = "x" });

        Assert.Equal("5", _written!.PrimaryKeyValues);
    }

    [Fact]
    public async Task LogInsert_WithNoPkidProperty_WritesAnEmptyPrimaryKeyValues()
    {
        var writer = CreateWriter();

        // PrimaryKeyValues is NOT NULL, so this must be "" rather than null.
        await writer.LogInsertAsync("Keyless", new Keyless { Label = "x" });

        Assert.Equal(string.Empty, _written!.PrimaryKeyValues);
    }

    // ----- UserName -----

    [Fact]
    public async Task LogInsert_TakesUserNameFromTheNameClaim()
    {
        SignIn("孫小明");
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });

        Assert.Equal("孫小明", _written!.UserName);
    }

    [Fact]
    public async Task LogInsert_WithNoHttpContext_WritesSystemAsUserName()
    {
        _httpContextAccessor.Setup(a => a.HttpContext).Returns((HttpContext?)null);
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });

        Assert.Equal("system", _written!.UserName);
    }

    [Fact]
    public async Task LogInsert_WithAnUnauthenticatedUser_WritesSystemAsUserName()
    {
        // No authenticationType → IsAuthenticated is false, even though the claim is present.
        var identity = new ClaimsIdentity([new Claim(JwtTokenService.UserNameClaimType, "miles")]);
        _httpContextAccessor
            .Setup(a => a.HttpContext)
            .Returns(new DefaultHttpContext { User = new ClaimsPrincipal(identity) });
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });

        Assert.Equal("system", _written!.UserName);
    }

    [Theory]
    [InlineData(null, "the claim is absent")]
    [InlineData("", "the claim is empty")]
    [InlineData("   ", "the claim is whitespace")]
    public async Task LogInsert_WithNoUsableNameClaim_WritesSystemAsUserName(string? userName, string why)
    {
        SignIn(userName);
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });

        Assert.Equal("system", _written!.UserName);
        Assert.NotNull(why);
    }

    // ----- Column limits -----

    [Fact]
    public async Task LogInsert_TruncatesActionDescToOneThousandCharacters()
    {
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = new string('a', 1500) });

        Assert.Equal(1000, _written!.ActionDesc!.Length);
        Assert.Equal(new string('a', 1000), _written.ActionDesc);
    }

    [Fact]
    public async Task LogInsert_TruncatesANonAsciiActionDescToOneThousandBytesNotCharacters()
    {
        var writer = CreateWriter();

        // varchar(1000) under a Chinese_Taiwan_Stroke collation is a 1000-BYTE budget, and
        // each of these costs two. 500 characters is the real ceiling.
        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = new string('課', 600) });

        Assert.Equal(500, _written!.ActionDesc!.Length);
    }

    [Fact]
    public async Task LogInsert_LeavesAnActionDescThatFitsAlone()
    {
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = new string('a', 1000) });

        Assert.Equal(1000, _written!.ActionDesc!.Length);
    }

    [Fact]
    public async Task LogUpdate_TruncatesALongChangedPropertyList()
    {
        var writer = CreateWriter();
        var before = new WideRow();
        var after = new WideRow();
        // Every property differs, so the name list overflows varchar(1000).
        for (var i = 0; i < WideRow.PropertyCount; i++)
        {
            after.Set(i, "changed");
        }

        await writer.LogUpdateAsync("WideRow", before, after);

        Assert.NotNull(_written);
        Assert.True(_written!.ActionDesc!.Length <= 1000);
    }

    [Fact]
    public async Task LogInsert_TruncatesUserNameToOneHundredCharacters()
    {
        SignIn(new string('名', 150));
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });

        // UserName is nvarchar(100) — characters, not bytes.
        Assert.Equal(100, _written!.UserName.Length);
    }

    // ----- DateTime -----

    [Fact]
    public async Task LogInsert_StampsTheCurrentUtcTime()
    {
        _time.UtcNow = new DateTimeOffset(2026, 7, 15, 4, 30, 0, TimeSpan.Zero);
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });

        Assert.Equal(new DateTime(2026, 7, 15, 4, 30, 0, DateTimeKind.Utc), _written!.DateTime);
    }

    // ----- Failures never reach the caller -----

    [Fact]
    public async Task LogInsert_SwallowsARepositoryFailure()
    {
        _repository
            .Setup(r => r.InsertAsync(It.IsAny<RowAuditEntry>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("the database is down"));
        var writer = CreateWriter();

        // The business row is already committed — a lost audit row must not surface as a 500.
        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });
    }

    [Fact]
    public async Task LogInsert_SwallowsAFailureToResolveTheCaller()
    {
        _httpContextAccessor
            .Setup(a => a.HttpContext)
            .Throws(new ObjectDisposedException("HttpContext"));
        var writer = CreateWriter();

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "x" });

        Assert.Null(_written);
    }

    // ----- Fixtures -----

    /// <summary>
    /// Shaped like a real model: pkid first, a non-string property before the first string one
    /// (so "first string property" can't be confused with "first property"), a second string
    /// property (so it can't be confused with "any string property"), and an N-N style list.
    /// </summary>
    private sealed class Widget
    {
        public int Pkid { get; set; }
        public int DisplayOrder { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public bool IsActive { get; set; }
        public List<string> Tags { get; set; } = [];
    }

    private sealed class NumericOnly
    {
        public int Pkid { get; set; }
        public int Count { get; set; }
    }

    /// <summary>Shaped like Course: a real FK column plus the label and count derived from it.</summary>
    private sealed class Derived
    {
        public int Pkid { get; set; }
        public string Title { get; set; } = string.Empty;
        public int PartnerPkid { get; set; }

        [NotAudited]
        public string PartnerName { get; set; } = string.Empty;

        [NotAudited]
        public int UserCount { get; set; }
    }

    private sealed class NotAuditedFirstString
    {
        public int Pkid { get; set; }

        [NotAudited]
        public string Label { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;
    }

    private sealed class LowerCasePkid
    {
        public int pkid { get; set; }
        public string Label { get; set; } = string.Empty;
    }

    private sealed class Keyless
    {
        public string Label { get; set; } = string.Empty;
    }

    /// <summary>Enough long-named string properties to overflow ActionDesc's 1000 bytes.</summary>
    private sealed class WideRow
    {
        public const int PropertyCount = 12;

        public int Pkid { get; set; }
        public string AVeryLongPropertyNameForTruncationTesting01 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting02 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting03 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting04 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting05 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting06 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting07 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting08 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting09 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting10 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting11 { get; set; } = string.Empty;
        public string AVeryLongPropertyNameForTruncationTesting12 { get; set; } = string.Empty;

        public void Set(int index, string value)
            => GetType().GetProperty($"AVeryLongPropertyNameForTruncationTesting{index + 1:00}")!
                .SetValue(this, value);
    }

    /// <summary>A clock the test drives, mirroring SigningKeyProviderTests.</summary>
    private sealed class MutableTimeProvider : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => UtcNow;
    }
}
