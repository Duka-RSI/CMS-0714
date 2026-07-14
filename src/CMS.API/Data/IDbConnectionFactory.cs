using System.Data;

namespace CMS.API.Data;

/// <summary>
/// Creates open ADO.NET connections to the CMS database for Dapper to use.
/// </summary>
public interface IDbConnectionFactory
{
    Task<IDbConnection> CreateOpenConnectionAsync(CancellationToken cancellationToken = default);
}
