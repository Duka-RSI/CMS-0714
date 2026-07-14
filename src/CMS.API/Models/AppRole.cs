namespace CMS.API.Models;

/// <summary>
/// Response model for the AppRole table. PK is <see cref="RoleId"/> (nvarchar);
/// <see cref="Pkid"/> is an IDENTITY surrogate shown in the list ("主代碼").
/// </summary>
public class AppRole
{
    public int Pkid { get; set; }
    public string RoleId { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public int PermissionLevel { get; set; }
    public string? Description { get; set; }

    /// <summary>Number of AppUserRole rows referencing this role ("使用者數"). Subquery count.</summary>
    public int UserCount { get; set; }

    /// <summary>Assigned users (AppUser.UserId). Populated only on GET-by-id.</summary>
    public List<string> UserIds { get; set; } = [];
}
