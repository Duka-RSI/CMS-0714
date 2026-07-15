namespace CMS.API.Models;

/// <summary>
/// The JSON payload stored in SysConfig.configValue where configKey = 'appConfig'.
/// </summary>
/// <remarks>
/// Only the properties this API actually needs are bound. The stored object also holds a
/// symmetricSecurityKey (a signing secret) which is deliberately NOT mapped, so it can
/// never leak through this model.
/// </remarks>
public class AppConfig
{
    /// <summary>Default password assigned to newly created users (hashed before storage).</summary>
    public string? DefaultPassword { get; set; }
}
