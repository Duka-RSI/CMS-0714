namespace CMS.API.Models;

/// <summary>
/// Search DTO for the AppUser list filter drawer (POST /api/app-users/query).
/// </summary>
public class AppUserQuery
{
    /// <summary>LIKE match across UserId and UserName.</summary>
    public string? Keyword { get; set; }

    /// <summary>Tri-state: null = no filter, true = 啟用, false = 停用.</summary>
    public bool? IsActive { get; set; }
}
