using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating a CourseGroup. <see cref="Pkid"/> is a smallint
/// IDENTITY — server-assigned on create (ignored in the INSERT), and immutable on
/// update (the form disables it in edit mode).
/// </summary>
public class CourseGroupRequest
{
    public short Pkid { get; set; }

    [Required]
    [MaxLength(100)]
    public string Description { get; set; } = string.Empty;
}
