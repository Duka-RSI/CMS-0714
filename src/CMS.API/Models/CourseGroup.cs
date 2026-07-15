namespace CMS.API.Models;

/// <summary>
/// Response model for the CourseGroup table (課程群組). PK is <see cref="Pkid"/> (smallint IDENTITY).
/// </summary>
public class CourseGroup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;

    /// <summary>Number of Course rows in this group ("課程數"). Subquery count.</summary>
    public int CourseCount { get; set; }

    /// <summary>Number of PartnerCourseGroup rows referencing this group ("廠商群組數"). Subquery count.</summary>
    public int PartnerCourseGroupCount { get; set; }
}
