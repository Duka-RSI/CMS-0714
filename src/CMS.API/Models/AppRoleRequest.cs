using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating an AppRole. <see cref="RoleId"/> is the primary key
/// (immutable on update — the form disables it in edit mode).
/// </summary>
public class AppRoleRequest
{
    [Required]
    [MaxLength(200)]
    public string RoleId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string RoleName { get; set; } = string.Empty;

    public int PermissionLevel { get; set; } = 100;

    [MaxLength(400)]
    public string? Description { get; set; }

    /// <summary>N-N (AppUserRole): users assigned to this role, by AppUser.UserId.</summary>
    public List<string> UserIds { get; set; } = [];
}
