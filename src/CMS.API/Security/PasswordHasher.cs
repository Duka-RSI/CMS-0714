using System.Security.Cryptography;
using System.Text;

namespace CMS.API.Security;

/// <summary>
/// Hashes passwords for the AppUser.PasswordHash column.
/// </summary>
/// <remarks>
/// Unsalted SHA-256, lower-case hex. This encoding is REQUIRED for compatibility with the
/// existing PasswordHash values (64-char lower-case hex) and the login path that verifies
/// them — Base64 or upper-case hex would not match. PasswordHasherTests locks this down.
///
/// Security debt (deliberate, documented in spec/auth/AppUser.md): SHA-256 is fast and
/// unsalted, so it is not a suitable password KDF. A salted adaptive KDF (bcrypt/Argon2id/
/// PBKDF2) is the correct choice, but changing it here would invalidate every stored hash.
/// Migrating the scheme is separate work.
/// </remarks>
public static class PasswordHasher
{
    /// <summary>SHA-256 of the UTF-8 bytes of <paramref name="plaintext"/>, as lower-case hex.</summary>
    public static string Hash(string plaintext)
    {
        ArgumentNullException.ThrowIfNull(plaintext);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(plaintext));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
