namespace CMS.API.Models;

/// <summary>
/// Slim lookup row for AppUser, used to populate the "使用者" multiselect on the AppRole form.
/// The frontend renders the label as "UserName (UserId)".
/// </summary>
public class AppUserLookup
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
}
