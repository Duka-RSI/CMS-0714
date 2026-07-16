namespace CMS.API.Security;

/// <summary>
/// Complexity rules for a user-chosen password: at least <see cref="MinimumLength"/>
/// characters, drawing on at least <see cref="RequiredCharacterClasses"/> of the four
/// character classes.
/// </summary>
/// <remarks>
/// Applies to passwords a user picks for themselves (change-password). It deliberately does
/// **not** gate the SysConfig default password that AppUser create/reset assigns — that
/// value is the admin's choice, and validating it here would turn a bad config into a
/// failure to create users.
///
/// The rule is mirrored client-side in `password-policy.ts` so the form can complain before
/// a round-trip. This is the authoritative copy; the client's is a courtesy.
///
/// Note this is orthogonal to the hashing weakness documented on <see cref="PasswordHasher"/>:
/// complexity limits guessing, it does not make unsalted SHA-256 a suitable KDF.
/// </remarks>
public static class PasswordPolicy
{
    public const int MinimumLength = 8;

    /// <summary>How many of the four character classes a password must draw on.</summary>
    public const int RequiredCharacterClasses = 3;

    /// <summary>
    /// Shown verbatim in the UI when <see cref="IsCompliant"/> fails. Bilingual, and kept
    /// identical to the string in the Angular `password-policy.ts`.
    /// </summary>
    public const string RequirementMessage =
        "密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：" +
        "大寫英文／小寫英文／數字／符號 " +
        "(Password must be at least 8 characters and contain at least 3 of the 4 classes: " +
        "uppercase / lowercase / digit / symbol.)";

    /// <summary>
    /// True when <paramref name="password"/> meets the length and character-class rules.
    /// </summary>
    /// <remarks>
    /// "Symbol" means anything that is not a letter or a digit — punctuation, whitespace,
    /// currency marks and so on. Letters without case (CJK, for instance) count towards no
    /// class at all, so a password of only Chinese characters is rejected however long it is.
    /// Nothing is trimmed: a password's leading and trailing spaces are part of it.
    /// </remarks>
    public static bool IsCompliant(string? password)
    {
        if (password is null || password.Length < MinimumLength)
        {
            return false;
        }

        var classes = 0;
        if (password.Any(char.IsUpper)) classes++;
        if (password.Any(char.IsLower)) classes++;
        if (password.Any(char.IsDigit)) classes++;
        if (password.Any(c => !char.IsLetterOrDigit(c))) classes++;

        return classes >= RequiredCharacterClasses;
    }
}
