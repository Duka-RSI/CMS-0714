using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class LookupRepository : ILookupRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public LookupRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<IEnumerable<AppUserLookup>> GetAppUsersAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await connection.QueryAsync<AppUserLookup>(new CommandDefinition(
            "SELECT UserId, UserName FROM AppUser ORDER BY UserName ASC",
            cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<PublishStatusLookup>> GetPublishStatusesAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await connection.QueryAsync<PublishStatusLookup>(new CommandDefinition(
            "SELECT pkid, Description FROM PublishStatus ORDER BY pkid ASC",
            cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<PartnerLookup>> GetPartnersAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await connection.QueryAsync<PartnerLookup>(new CommandDefinition(
            "SELECT pkid, Name FROM Partner ORDER BY DisplayOrder ASC, Name ASC",
            cancellationToken: cancellationToken));
    }
}
