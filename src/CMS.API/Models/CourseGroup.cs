namespace CMS.API.Models;

/// <summary>
/// Response model for the CourseGroup table (課程群組). PK is <see cref="Pkid"/>
/// (smallint IDENTITY). No foreign keys or N-N relationships.
/// </summary>
public class CourseGroup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}
