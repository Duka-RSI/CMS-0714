using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class CourseRepository : ICourseRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public CourseRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    // FK columns are Partner_pkid etc. — aliased to the model's property names because
    // Dapper does not match across the underscore. FK labels are flattened in via JOIN.
    private const string SelectColumns = @"
        c.pkid, c.Title, c.OfficialTitle, c.CourseId, c.ProdCourseId, c.FriendlyUrl,
        c.DisplayOrder,
        c.Partner_pkid AS PartnerPkid, c.CourseGroup_pkid AS CourseGroupPkid,
        c.PublishStatus_pkid AS PublishStatusPkid,
        c.ScheduleOn, c.ScheduleOff, c.Hour, c.ListPrice, c.LearningCredit,
        c.Material, c.Objective, c.Target, c.Prerequisites, c.Outline,
        c.TowardCertOrExam, c.Note, c.OtherInfo, c.CanRepeat,
        p.Name AS PartnerName,
        cg.Description AS CourseGroupDescription,
        ps.Description AS PublishStatusDescription,
        (SELECT COUNT(*) FROM CourseInCertification x WHERE x.Course_pkid = c.pkid) AS CertificationCount,
        (SELECT COUNT(*) FROM CourseJobCategories j WHERE j.Course_pkid = c.pkid) AS JobCategoryCount";

    // LEFT JOIN on CourseGroup: the FK is nullable, and an INNER JOIN would silently drop
    // every course that has no group.
    private const string FromJoin = @"
        FROM Course c
        INNER JOIN Partner p        ON p.pkid  = c.Partner_pkid
        LEFT  JOIN CourseGroup cg   ON cg.pkid = c.CourseGroup_pkid
        INNER JOIN PublishStatus ps ON ps.pkid = c.PublishStatus_pkid";

    private const string OrderBy = " ORDER BY c.DisplayOrder ASC, c.pkid DESC";

    public async Task<IEnumerable<Course>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} {FromJoin} {OrderBy}";
        return await connection.QueryAsync<Course>(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<Course>> QueryAsync(CourseQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Keyword", string.IsNullOrWhiteSpace(query.Keyword) ? null : $"%{query.Keyword.Trim()}%");
        parameters.Add("PartnerPkid", query.PartnerPkid);
        parameters.Add("CourseGroupPkid", query.CourseGroupPkid);
        parameters.Add("PublishStatusPkid", query.PublishStatusPkid);
        parameters.Add("CanRepeat", query.CanRepeat);
        parameters.Add("ScheduleOnFrom", query.ScheduleOnFrom);
        parameters.Add("ScheduleOnTo", query.ScheduleOnTo);
        parameters.Add("ScheduleOffFrom", query.ScheduleOffFrom);
        parameters.Add("ScheduleOffTo", query.ScheduleOffTo);

        var sql = $@"
            SELECT {SelectColumns}
            {FromJoin}
            WHERE (@Keyword IS NULL
                   OR c.Title LIKE @Keyword
                   OR c.CourseId LIKE @Keyword
                   OR c.ProdCourseId LIKE @Keyword
                   OR c.OfficialTitle LIKE @Keyword)
              AND (@PartnerPkid IS NULL OR c.Partner_pkid = @PartnerPkid)
              AND (@CourseGroupPkid IS NULL OR c.CourseGroup_pkid = @CourseGroupPkid)
              AND (@PublishStatusPkid IS NULL OR c.PublishStatus_pkid = @PublishStatusPkid)
              AND (@CanRepeat IS NULL OR c.CanRepeat = @CanRepeat)
              AND (@ScheduleOnFrom IS NULL OR c.ScheduleOn >= @ScheduleOnFrom)
              AND (@ScheduleOnTo IS NULL OR c.ScheduleOn <= @ScheduleOnTo)
              AND (@ScheduleOffFrom IS NULL OR c.ScheduleOff >= @ScheduleOffFrom)
              AND (@ScheduleOffTo IS NULL OR c.ScheduleOff <= @ScheduleOffTo)
            {OrderBy}";

        return await connection.QueryAsync<Course>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<Course?> GetByIdAsync(int pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await GetByIdAsync(connection, null, pkid, cancellationToken);
    }

    private static async Task<Course?> GetByIdAsync(IDbConnection connection, IDbTransaction? transaction, int pkid, CancellationToken cancellationToken)
    {
        var sql = $"SELECT {SelectColumns} {FromJoin} WHERE c.pkid = @Pkid";
        var course = await connection.QuerySingleOrDefaultAsync<Course>(
            new CommandDefinition(sql, new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));

        if (course is null)
        {
            return null;
        }

        var certificationPkids = await connection.QueryAsync<int>(new CommandDefinition(
            "SELECT Certification_pkid FROM CourseInCertification WHERE Course_pkid = @Pkid ORDER BY Certification_pkid",
            new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));
        course.CertificationPkids = certificationPkids.ToList();

        var jobCategoryPkids = await connection.QueryAsync<short>(new CommandDefinition(
            "SELECT JobCategory_pkid FROM CourseJobCategories WHERE Course_pkid = @Pkid ORDER BY JobCategory_pkid",
            new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));
        course.JobCategoryPkids = jobCategoryPkids.ToList();

        return course;
    }

    private const string WritableColumns = @"
        Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl, DisplayOrder,
        Partner_pkid, CourseGroup_pkid, PublishStatus_pkid, ScheduleOn, ScheduleOff,
        Hour, ListPrice, LearningCredit, Material, Objective, Target, Prerequisites,
        Outline, TowardCertOrExam, Note, OtherInfo, CanRepeat";

    public async Task<Course> CreateAsync(CourseRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        // pkid is IDENTITY — excluded from the INSERT; SCOPE_IDENTITY() returns the new key.
        var newPkid = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            $@"INSERT INTO Course ({WritableColumns})
               VALUES (@Title, @OfficialTitle, @CourseId, @ProdCourseId, @FriendlyUrl, @DisplayOrder,
                       @PartnerPkid, @CourseGroupPkid, @PublishStatusPkid, @ScheduleOn, @ScheduleOff,
                       @Hour, @ListPrice, @LearningCredit, @Material, @Objective, @Target, @Prerequisites,
                       @Outline, @TowardCertOrExam, @Note, @OtherInfo, @CanRepeat);
               SELECT CAST(SCOPE_IDENTITY() AS int);",
            request, transaction, cancellationToken: cancellationToken));

        await SyncCertificationsAsync(connection, transaction, newPkid, request.CertificationPkids, cancellationToken);
        await SyncJobCategoriesAsync(connection, transaction, newPkid, request.JobCategoryPkids, cancellationToken);

        var created = await GetByIdAsync(connection, transaction, newPkid, cancellationToken);
        transaction.Commit();
        return created!;
    }

    public async Task<bool> UpdateAsync(CourseRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        // pkid is the immutable primary key — never updated.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE Course
              SET Title = @Title, OfficialTitle = @OfficialTitle, CourseId = @CourseId,
                  ProdCourseId = @ProdCourseId, FriendlyUrl = @FriendlyUrl, DisplayOrder = @DisplayOrder,
                  Partner_pkid = @PartnerPkid, CourseGroup_pkid = @CourseGroupPkid,
                  PublishStatus_pkid = @PublishStatusPkid, ScheduleOn = @ScheduleOn,
                  ScheduleOff = @ScheduleOff, Hour = @Hour, ListPrice = @ListPrice,
                  LearningCredit = @LearningCredit, Material = @Material, Objective = @Objective,
                  Target = @Target, Prerequisites = @Prerequisites, Outline = @Outline,
                  TowardCertOrExam = @TowardCertOrExam, Note = @Note, OtherInfo = @OtherInfo,
                  CanRepeat = @CanRepeat
              WHERE pkid = @Pkid",
            request, transaction, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            transaction.Rollback();
            return false;
        }

        await SyncCertificationsAsync(connection, transaction, request.Pkid, request.CertificationPkids, cancellationToken);
        await SyncJobCategoriesAsync(connection, transaction, request.Pkid, request.JobCategoryPkids, cancellationToken);

        transaction.Commit();
        return true;
    }

    public async Task<CourseDeleteResult> DeleteAsync(int pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        var exists = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM Course WHERE pkid = @Pkid",
            new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));

        if (exists == 0)
        {
            transaction.Rollback();
            return new CourseDeleteResult(false, NotFound: true, default);
        }

        // No FK pointing at Course cascades. CourseFAQ / CourseRelatedLink / HotCourse are
        // child entities carrying their own content, so they block the delete rather than
        // being silently destroyed — deleting the course row regardless would raise
        // SqlException 547 and surface as a 500.
        var blockers = await connection.QuerySingleAsync<CourseDeleteBlockers>(new CommandDefinition(
            @"SELECT (SELECT COUNT(*) FROM CourseFAQ         WHERE Course_pkid = @Pkid) AS FaqCount,
                     (SELECT COUNT(*) FROM CourseRelatedLink WHERE Course_pkid = @Pkid) AS RelatedLinkCount,
                     (SELECT COUNT(*) FROM HotCourse         WHERE Course_pkid = @Pkid) AS HotCourseCount",
            new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));

        if (blockers.Any)
        {
            transaction.Rollback();
            return new CourseDeleteResult(false, NotFound: false, blockers);
        }

        // Junction rows are pure associations — safe to remove with the course.
        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseInCertification WHERE Course_pkid = @Pkid",
            new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));
        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseJobCategories WHERE Course_pkid = @Pkid",
            new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));

        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM Course WHERE pkid = @Pkid",
            new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));

        transaction.Commit();
        return new CourseDeleteResult(affected > 0, NotFound: false, default);
    }

    // N-N sync: delete-then-reinsert on the same connection/transaction (AppRole pattern).
    private static async Task SyncCertificationsAsync(IDbConnection connection, IDbTransaction transaction, int coursePkid, IEnumerable<int> certificationPkids, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseInCertification WHERE Course_pkid = @Pkid",
            new { Pkid = coursePkid }, transaction, cancellationToken: cancellationToken));

        var rows = certificationPkids
            .Distinct()
            .Select(id => new { CoursePkid = coursePkid, CertificationPkid = id })
            .ToList();

        if (rows.Count > 0)
        {
            await connection.ExecuteAsync(new CommandDefinition(
                "INSERT INTO CourseInCertification (Course_pkid, Certification_pkid) VALUES (@CoursePkid, @CertificationPkid)",
                rows, transaction, cancellationToken: cancellationToken));
        }
    }

    private static async Task SyncJobCategoriesAsync(IDbConnection connection, IDbTransaction transaction, int coursePkid, IEnumerable<short> jobCategoryPkids, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseJobCategories WHERE Course_pkid = @Pkid",
            new { Pkid = coursePkid }, transaction, cancellationToken: cancellationToken));

        var rows = jobCategoryPkids
            .Distinct()
            .Select(id => new { CoursePkid = coursePkid, JobCategoryPkid = id })
            .ToList();

        if (rows.Count > 0)
        {
            await connection.ExecuteAsync(new CommandDefinition(
                "INSERT INTO CourseJobCategories (Course_pkid, JobCategory_pkid) VALUES (@CoursePkid, @JobCategoryPkid)",
                rows, transaction, cancellationToken: cancellationToken));
        }
    }
}
