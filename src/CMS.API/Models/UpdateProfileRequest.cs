using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Body of PUT /api/Auth/profile — self-service edit of the signed-in user's display name.
/// </summary>
/// <remarks>
/// There is deliberately **no UserId and no RoleIds property**. The user being edited comes
/// from the JWT, so a caller cannot rename somebody else by putting their id in the body,
/// and cannot grant themselves a role. Unknown JSON properties are ignored by the
/// deserializer, so sending them is harmless — <see cref="Controllers.AuthController"/>
/// never sees them.
/// </remarks>
public class UpdateProfileRequest
{
    /// <summary>New display name. Required; trimmed before storage.</summary>
    [Required, MaxLength(200)]
    public string UserName { get; set; } = string.Empty;
}
