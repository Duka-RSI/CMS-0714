namespace CMS.API.Models;

/// <summary>Slim CourseGroup lookup row for FK dropdowns (Course, PartnerCourseGroup).</summary>
public class CourseGroupLookup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}
