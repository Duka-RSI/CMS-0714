namespace CMS.API.Models;

/// <summary>
/// The signed-in user's profile, as returned by PUT /api/Auth/profile.
/// </summary>
/// <remarks>
/// Carries the **stored** UserName back — the server trims it, so the client must take
/// this value rather than echo what it sent. No token: updating a display name does not
/// re-issue credentials.
/// </remarks>
public class UserProfileResponse
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
}
