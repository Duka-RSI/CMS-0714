using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating an AppUser. <see cref="UserId"/> is the primary key
/// (immutable on update — the form disables it in edit mode).
/// </summary>
/// <remarks>
/// There is deliberately NO password field: on create the server hashes the SysConfig
/// default password, and an update never touches PasswordHash. Use the
/// reset-password endpoint to change it.
/// </remarks>
public class AppUserRequest
{
    [Required]
    [MaxLength(200)]
    public string UserId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string UserName { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    /// <summary>N-N (AppUserRole): roles assigned to this user, by AppRole.RoleId.</summary>
    public List<string> RoleIds { get; set; } = [];
}
