namespace CMS.API.Models;

/// <summary>
/// Search DTO for the CourseGroup list filter drawer (POST /api/course-groups/query).
/// </summary>
public class CourseGroupQuery
{
    /// <summary>LIKE match on Description.</summary>
    public string? Keyword { get; set; }
}
