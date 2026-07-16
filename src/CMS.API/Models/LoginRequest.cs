using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Credentials posted to POST /api/Auth/login.</summary>
public class LoginRequest
{
    [Required, MaxLength(200)]
    public string UserId { get; set; } = string.Empty;

    /// <summary>Plaintext password. Hashed for comparison; never logged or stored.</summary>
    [Required]
    public string Password { get; set; } = string.Empty;
}
