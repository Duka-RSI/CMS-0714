namespace CMS.API.Models;

/// <summary>
/// One course plus the N-N labels the detail page shows, as needed by the PDF export.
/// </summary>
/// <remarks>
/// Not a <see cref="Course"/> subclass: the export needs the certification and job-category
/// <em>names</em>, while Course carries only their pkids (and only on GET-by-id). Reading
/// them per course would be an N+1 — see <c>ICourseRepository.GetForExportAsync</c>, which
/// fills these in three queries no matter how many courses are selected.
/// </remarks>
public sealed class CourseExport
{
    public required Course Course { get; init; }

    /// <summary>Certification titles, ordered as the detail page orders them.</summary>
    public IReadOnlyList<string> CertificationLabels { get; init; } = [];

    /// <summary>Job category descriptions, ordered as the detail page orders them.</summary>
    public IReadOnlyList<string> JobCategoryLabels { get; init; } = [];
}
