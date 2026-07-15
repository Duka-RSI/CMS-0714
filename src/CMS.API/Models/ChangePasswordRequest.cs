using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Body of POST /api/Auth/change-password — the signed-in user changing their own password.
/// </summary>
/// <remarks>
/// Plaintext in, nothing out: the API hashes these and never returns a hash. As with
/// <see cref="UpdateProfileRequest"/>, there is no UserId property — the account comes from
/// the token, so this cannot be pointed at anyone else.
///
/// Passwords are never trimmed; leading and trailing spaces are part of the secret.
/// </remarks>
public class ChangePasswordRequest
{
    /// <summary>Must hash to the stored PasswordHash, or nothing changes.</summary>
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    /// <summary>Must satisfy <see cref="Security.PasswordPolicy"/>.</summary>
    [Required]
    public string NewPassword { get; set; } = string.Empty;

    /// <summary>Must equal <see cref="NewPassword"/> exactly.</summary>
    [Required]
    public string ConfirmPassword { get; set; } = string.Empty;
}
