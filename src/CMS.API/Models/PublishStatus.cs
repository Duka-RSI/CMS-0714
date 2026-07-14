namespace CMS.API.Models;

/// <summary>
/// Response model for the PublishStatus lookup table. The primary key
/// <see cref="Pkid"/> is a user-assigned <c>tinyint</c> (NOT an IDENTITY).
/// </summary>
public class PublishStatus
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}
