namespace CMS.API.Models;

/// <summary>
/// The JSON payload stored in SysConfig.configValue where configKey = 'appConfig'.
/// </summary>
/// <remarks>
/// Only the properties this API actually needs are bound.
///
/// <see cref="SymmetricSecurityKey"/> is the JWT signing secret: it is read at runtime by
/// <see cref="Security.JwtTokenService"/> and must never be returned by an endpoint. This
/// model is backend-only — it is not a response model and must not be handed to a client.
/// </remarks>
public class AppConfig
{
    /// <summary>Default password assigned to newly created users (hashed before storage).</summary>
    public string? DefaultPassword { get; set; }

    /// <summary>HMAC-SHA256 signing secret for login access tokens. Never expose this.</summary>
    public string? SymmetricSecurityKey { get; set; }
}
