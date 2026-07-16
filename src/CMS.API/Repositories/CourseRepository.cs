using System.Data;
using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class CourseRepository : ICourseRepository
{
    private const string AuditTableName = "Course";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IRowAuditWriter _rowAudit;

    public CourseRepository(IDbConnectionFactory connectionFactory, IRowAuditWriter rowAudit)
    {
        _connectionFactory = connectionFactory;
        _rowAudit = rowAudit;
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

    public async Task<IReadOnlyList<CourseExport>> GetForExportAsync(
        IReadOnlyCollection<int> pkids, CancellationToken cancellationToken = default)
    {
        if (pkids.Count == 0)
        {
            return [];
        }

        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // Same columns and order as the list, so the PDF reads like the screen it came from.
        var courses = (await connection.QueryAsync<Course>(new CommandDefinition(
            $"SELECT {SelectColumns} {FromJoin} WHERE c.pkid IN @Pkids {OrderBy}",
            new { Pkids = pkids }, cancellationToken: cancellationToken))).ToList();

        if (courses.Count == 0)
        {
            return [];
        }

        // One query for every course's certifications, one for their job categories — the
        // labels, not the pkids, since that is what the PDF prints. Certification.Title is
        // nchar(100): RTRIM here, or every label carries its padding into the document.
        var certifications = await connection.QueryAsync<CourseLabelRow>(new CommandDefinition(
            @"SELECT cic.Course_pkid AS CoursePkid,
                     RTRIM(ct.Title) AS Label,
                     ct.pkid AS LabelPkid
              FROM CourseInCertification cic
              INNER JOIN Certification ct ON ct.pkid = cic.Certification_pkid
              WHERE cic.Course_pkid IN @Pkids
              ORDER BY cic.Course_pkid, cic.Certification_pkid",
            new { Pkids = pkids }, cancellationToken: cancellationToken));

        var jobCategories = await connection.QueryAsync<CourseLabelRow>(new CommandDefinition(
            @"SELECT cjc.Course_pkid AS CoursePkid,
                     jc.Description AS Label,
                     jc.pkid AS LabelPkid
              FROM CourseJobCategories cjc
              INNER JOIN JobCategory jc ON jc.pkid = cjc.JobCategory_pkid
              WHERE cjc.Course_pkid IN @Pkids
              ORDER BY cjc.Course_pkid, cjc.JobCategory_pkid",
            new { Pkids = pkids }, cancellationToken: cancellationToken));

        // Certification.Title is nullable: mirror the detail page and fall back to #pkid so
        // a label is never blank.
        var certByCourse = GroupLabels(certifications);
        var jobsByCourse = GroupLabels(jobCategories);

        return courses
            .Select(course => new CourseExport
            {
                Course = course,
                CertificationLabels = certByCourse.GetValueOrDefault(course.Pkid, []),
                JobCategoryLabels = jobsByCourse.GetValueOrDefault(course.Pkid, []),
            })
            .ToList();
    }

    /// <summary>One N-N label row, keyed back to its course. Shared by both label queries.</summary>
    private sealed class CourseLabelRow
    {
        public int CoursePkid { get; init; }
        public string? Label { get; init; }
        public int LabelPkid { get; init; }
    }

    private static Dictionary<int, IReadOnlyList<string>> GroupLabels(IEnumerable<CourseLabelRow> rows)
        => rows
            .GroupBy(r => r.CoursePkid)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<string>)g
                    .Select(r => string.IsNullOrWhiteSpace(r.Label) ? $"#{r.LabelPkid}" : r.Label)
                    .ToList());

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

        // Audited after the commit: the row is durable, and a failed audit write must not
        // take a committed change down with it.
        await _rowAudit.LogInsertAsync(AuditTableName, created!, cancellationToken);
        return created!;
    }

    public async Task<bool> UpdateAsync(CourseRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        // Both snapshots are read inside the transaction, so the diff cannot straddle
        // somebody else's concurrent edit.
        var before = await GetByIdAsync(connection, transaction, request.Pkid, cancellationToken);
        if (before is null)
        {
            transaction.Rollback();
            return false;
        }

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

        var after = await GetByIdAsync(connection, transaction, request.Pkid, cancellationToken);
        transaction.Commit();

        await _rowAudit.LogUpdateAsync(AuditTableName, before, after!, cancellationToken);
        return true;
    }

    public async Task<CourseDeleteResult> DeleteAsync(int pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        // Doubles as the existence check the COUNT(1) used to do, and as the row the audit
        // entry describes once it is gone.
        var deleted = await GetByIdAsync(connection, transaction, pkid, cancellationToken);

        if (deleted is null)
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

        // Only a delete that actually happened is audited — a blocked or not-found one
        // returned above without reaching this line.
        if (affected == 0)
        {
            return new CourseDeleteResult(false, NotFound: false, default);
        }

        await _rowAudit.LogDeleteAsync(AuditTableName, deleted, cancellationToken);
        return new CourseDeleteResult(true, NotFound: false, default);
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
