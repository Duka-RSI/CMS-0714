using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ISysConfigRepository
{
    /// <summary>
    /// Reads and parses the SysConfig 'appConfig' JSON row.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// The row is missing/empty, the JSON is malformed, or defaultPassword is absent/blank.
    /// </exception>
    Task<AppConfig> GetAppConfigAsync(CancellationToken cancellationToken = default);
}
