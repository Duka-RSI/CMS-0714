namespace CMS.API.Models;

/// <summary>
/// The user profile returned by a successful login. Deliberately minimal — no PasswordHash,
/// no role list, nothing beyond what the client needs to render the session.
/// </summary>
public class LoginResponse
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;

    /// <summary>Signed JWT; carries the UserId, UserName and role claims.</summary>
    public string AccessToken { get; set; } = string.Empty;
}
