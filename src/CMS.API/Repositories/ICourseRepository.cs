using CMS.API.Models;

namespace CMS.API.Repositories;

/// <summary>Which child tables block a Course delete. All-zero means the delete may proceed.</summary>
/// <param name="FaqCount">CourseFAQ rows (常見問題).</param>
/// <param name="RelatedLinkCount">CourseRelatedLink rows (相關連結).</param>
/// <param name="HotCourseCount">HotCourse rows (熱門課程).</param>
public readonly record struct CourseDeleteBlockers(int FaqCount, int RelatedLinkCount, int HotCourseCount)
{
    public bool Any => FaqCount > 0 || RelatedLinkCount > 0 || HotCourseCount > 0;
}

/// <summary>Outcome of a Course delete attempt.</summary>
/// <param name="Deleted">True when the row was removed.</param>
/// <param name="NotFound">True when no course had that pkid.</param>
/// <param name="Blockers">Populated when child rows prevented the delete.</param>
public readonly record struct CourseDeleteResult(bool Deleted, bool NotFound, CourseDeleteBlockers Blockers);

public interface ICourseRepository
{
    Task<IEnumerable<Course>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Course>> QueryAsync(CourseQuery query, CancellationToken cancellationToken = default);
    Task<Course?> GetByIdAsync(int pkid, CancellationToken cancellationToken = default);

    /// <summary>
    /// The given courses plus their certification / job-category labels, for the PDF export.
    /// </summary>
    /// <remarks>
    /// Three queries regardless of how many pkids are asked for — calling GetByIdAsync per
    /// course would be an N+1, and GetByIdAsync returns the N-N pkids rather than the names
    /// the PDF prints. Unknown pkids are simply absent from the result; ordering follows the
    /// list's own (DisplayOrder, then pkid) so an export reads in the same order as the
    /// screen it was started from.
    /// </remarks>
    Task<IReadOnlyList<CourseExport>> GetForExportAsync(
        IReadOnlyCollection<int> pkids, CancellationToken cancellationToken = default);
    Task<Course> CreateAsync(CourseRequest request, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(CourseRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes a course and its N-N junction rows. No FK to Course cascades, so child
    /// entities (CourseFAQ / CourseRelatedLink / HotCourse) block the delete instead of
    /// being destroyed — the result reports them so the controller can return 409.
    /// </summary>
    Task<CourseDeleteResult> DeleteAsync(int pkid, CancellationToken cancellationToken = default);
}
