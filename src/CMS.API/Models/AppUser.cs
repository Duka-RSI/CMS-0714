namespace CMS.API.Models;

/// <summary>
/// Response model for the AppUser table (使用者). PK is <see cref="UserId"/> (nvarchar);
/// <see cref="Pkid"/> is an IDENTITY surrogate shown in the list ("主代碼").
/// </summary>
/// <remarks>
/// PasswordHash is intentionally absent — it is never sent to the frontend.
/// </remarks>
public class AppUser
{
    public int Pkid { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public bool IsActive { get; set; }

    /// <summary>When the password was last set. NULL = still on the system default password.</summary>
    public DateTime? PasswordUpdatedTime { get; set; }

    /// <summary>Number of AppUserRole rows referencing this user ("角色數"). Subquery count.</summary>
    public int RoleCount { get; set; }

    /// <summary>Assigned roles (AppRole.RoleId). Populated only on GET-by-id.</summary>
    public List<string> RoleIds { get; set; } = [];
}
