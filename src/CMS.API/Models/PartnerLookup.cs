namespace CMS.API.Models;

/// <summary>Slim Partner lookup row for FK dropdowns (Course, Certification, PartnerCourseGroup).</summary>
public class PartnerLookup
{
    public short Pkid { get; set; }
    public string Name { get; set; } = string.Empty;
}
