namespace CMS.API.Models;

/// <summary>
/// An AppUser row as seen by the login path only — the one place <see cref="PasswordHash"/>
/// is allowed to leave the database.
/// </summary>
/// <remarks>
/// Backend-only. This type must never be used as a response model: the ordinary
/// <see cref="AppUser"/> response model exists precisely so PasswordHash cannot be
/// serialized to a client. Loaded by <see cref="Repositories.AuthRepository"/>.
/// </remarks>
public class AppUserCredential
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public bool IsActive { get; set; }

    /// <summary>Unsalted SHA-256 of the password, lower-case hex (see PasswordHasher).</summary>
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>RoleIds from AppUserRole; become the token's role claims.</summary>
    public List<string> RoleIds { get; set; } = [];
}
