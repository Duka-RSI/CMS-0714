namespace CMS.API.Models;

/// <summary>
/// Response model for the Partner table (合作廠商). PK is <see cref="Pkid"/>
/// (smallint IDENTITY). No foreign keys or N-N relationships.
/// </summary>
public class Partner
{
    public short Pkid { get; set; }
    public string Name { get; set; } = string.Empty;
    public string AppKey { get; set; } = string.Empty;
    public string NameOnPartnerMenu { get; set; } = string.Empty;
    public string NameOnCourseDetailPage { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public string? ImageFilename { get; set; }
}
