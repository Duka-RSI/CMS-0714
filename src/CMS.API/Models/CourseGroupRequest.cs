using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating a CourseGroup. <see cref="Pkid"/> is ignored on create
/// (IDENTITY) and identifies the row on update.
/// </summary>
public class CourseGroupRequest
{
    public short Pkid { get; set; }

    [Required]
    [MaxLength(100)]
    public string Description { get; set; } = string.Empty;
}
