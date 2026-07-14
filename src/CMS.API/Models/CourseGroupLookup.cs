namespace CMS.API.Models;

/// <summary>
/// Slim lookup row for CourseGroup, used to populate FK dropdowns (e.g. the future Course form).
/// </summary>
public class CourseGroupLookup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}
