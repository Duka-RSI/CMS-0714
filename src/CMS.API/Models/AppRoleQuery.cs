namespace CMS.API.Models;

/// <summary>
/// Search DTO for the AppRole list filter drawer (POST /api/app-roles/query).
/// </summary>
public class AppRoleQuery
{
    /// <summary>LIKE match across RoleId, RoleName and Description.</summary>
    public string? Keyword { get; set; }

    /// <summary>Exact match on PermissionLevel (optional).</summary>
    public int? PermissionLevel { get; set; }
}
