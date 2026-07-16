using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Which courses to merge into one PDF. Body of <c>POST /api/courses/pdf</c>.</summary>
/// <remarks>
/// A POST with a body rather than a GET with a repeated query param: a user can select every
/// row on a 50-row page, and that many ids would strain a URL for no benefit. The endpoint
/// is read-only all the same — it writes nothing and is not audited.
/// </remarks>
public sealed class CoursePdfRequest
{
    /// <summary>
    /// The selected courses' pkids. Capped because each one becomes a rendered page: the
    /// request is synchronous, and an unbounded selection would tie up a request thread
    /// building a document nobody wants to wait for.
    /// </summary>
    [Required(ErrorMessage = "請至少選擇一門課程。")]
    [MinLength(1, ErrorMessage = "請至少選擇一門課程。")]
    [MaxLength(MaxCourses, ErrorMessage = "一次最多匯出 100 門課程。")]
    public List<int> Pkids { get; set; } = [];

    /// <summary>Most rows a single export may carry. Mirrored by the NG list's guard.</summary>
    public const int MaxCourses = 100;
}
