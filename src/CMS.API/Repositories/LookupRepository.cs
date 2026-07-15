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

    public async Task<IEnumerable<AppRoleLookup>> GetAppRolesAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await connection.QueryAsync<AppRoleLookup>(new CommandDefinition(
            "SELECT RoleId, RoleName FROM AppRole ORDER BY RoleId ASC",
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

    public async Task<IEnumerable<CourseGroupLookup>> GetCourseGroupsAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await connection.QueryAsync<CourseGroupLookup>(new CommandDefinition(
            "SELECT pkid, Description FROM CourseGroup ORDER BY Description ASC",
            cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<CertificationLookup>> GetCertificationsAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        // Title is nchar(100) — RTRIM it, or every label carries trailing padding.
        return await connection.QueryAsync<CertificationLookup>(new CommandDefinition(
            "SELECT pkid, RTRIM(Title) AS Title FROM Certification ORDER BY Title ASC",
            cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<JobCategoryLookup>> GetJobCategoriesAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await connection.QueryAsync<JobCategoryLookup>(new CommandDefinition(
            "SELECT pkid, Description FROM JobCategory ORDER BY Description ASC",
            cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<TrainingCenterLookup>> GetTrainingCentersAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await connection.QueryAsync<TrainingCenterLookup>(new CommandDefinition(
            "SELECT pkid, Name FROM TrainingCenter ORDER BY DisplayOrder ASC, pkid ASC",
            cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<PromotionLookup>> GetPromotionsAsync(string? keyword, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // Capped: this backs an as-you-type PromoCode autocomplete, not a full list.
        return await connection.QueryAsync<PromotionLookup>(new CommandDefinition(
            @"SELECT TOP (@Take) pkid, PromoCode, Topic, Description
              FROM Promotion2
              WHERE (@Keyword IS NULL OR PromoCode LIKE @Keyword)
              ORDER BY PromoCode ASC",
            new
            {
                Keyword = string.IsNullOrWhiteSpace(keyword) ? null : $"%{keyword.Trim()}%",
                Take = PromotionLookupLimit
            },
            cancellationToken: cancellationToken));
    }

    /// <summary>Max rows returned by the PromoCode autocomplete.</summary>
    private const int PromotionLookupLimit = 20;
}
