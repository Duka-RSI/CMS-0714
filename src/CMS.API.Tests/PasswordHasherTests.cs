using CMS.API.Security;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Locks the PasswordHash encoding. The existing AppUser rows are 64-char lower-case hex
/// SHA-256; if a refactor switches to Base64 or upper-case hex, every new user silently
/// becomes unable to log in. These tests fail loudly if that happens.
/// </summary>
public class PasswordHasherTests
{
    [Fact]
    public void Hash_MatchesKnownSha256Vector()
    {
        // Standard SHA-256 test vector for "abc".
        Assert.Equal(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            PasswordHasher.Hash("abc"));
    }

    [Fact]
    public void Hash_ProducesSixtyFourCharLowerCaseHex()
    {
        var hash = PasswordHasher.Hash("CMS4fun#");

        Assert.Equal(64, hash.Length);
        Assert.Matches("^[0-9a-f]{64}$", hash);
    }

    [Fact]
    public void Hash_IsDeterministic()
    {
        Assert.Equal(PasswordHasher.Hash("CMS4fun#"), PasswordHasher.Hash("CMS4fun#"));
    }

    [Fact]
    public void Hash_DiffersForDifferentInputs()
    {
        Assert.NotEqual(PasswordHasher.Hash("CMS4fun#"), PasswordHasher.Hash("CMS4fun$"));
    }

    [Fact]
    public void Hash_HashesNonAsciiAsUtf8()
    {
        // Guards the UTF-8 encoding choice — UTF-16/Latin-1 bytes would hash differently.
        Assert.Equal(
            "9afffe5662c6aa2f61c2ca90e7c682dfe970177ed72ec357c115f8d4fe9e4563",
            PasswordHasher.Hash("密碼123"));
    }

    // ----- Verify (the login path) -----

    [Fact]
    public void Verify_AcceptsThePasswordThatProducedTheHash()
    {
        Assert.True(PasswordHasher.Verify("CMS4fun#", PasswordHasher.Hash("CMS4fun#")));
    }

    [Fact]
    public void Verify_RejectsAWrongPassword()
    {
        Assert.False(PasswordHasher.Verify("CMS4fun$", PasswordHasher.Hash("CMS4fun#")));
    }

    [Fact]
    public void Verify_MatchesAHashStoredAsLowerCaseHex()
    {
        // The shape of the rows actually in AppUser — a literal stored hash must verify.
        Assert.True(PasswordHasher.Verify(
            "abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void Verify_RejectsAMissingStoredHash(string? storedHash)
    {
        // PasswordHash is NOT NULL in the DB, but an empty hash must never authenticate.
        Assert.False(PasswordHasher.Verify("CMS4fun#", storedHash!));
    }

    [Fact]
    public void Verify_RejectsAStoredHashOfADifferentLength()
    {
        // FixedTimeEquals returns false on a length mismatch rather than throwing.
        Assert.False(PasswordHasher.Verify("abc", "ba7816bf"));
    }
}
