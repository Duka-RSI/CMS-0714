namespace CMS.API.Models;

/// <summary>Slim Certification row for the Course "認證" multiselect.</summary>
/// <remarks>
/// Certification.Title is nchar(100) and nullable — the repository RTRIMs it, and the
/// client falls back to the pkid when it is null.
/// </remarks>
public class CertificationLookup
{
    public int Pkid { get; set; }
    public string? Title { get; set; }
}
