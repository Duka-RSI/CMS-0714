using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating a Course. <see cref="Pkid"/> is an int IDENTITY —
/// server-assigned on create (ignored in the INSERT), immutable on update.
/// </summary>
public class CourseRequest
{
    public int Pkid { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(300)]
    public string? OfficialTitle { get; set; }

    [Required]
    [MaxLength(50)]
    public string CourseId { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string ProdCourseId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string FriendlyUrl { get; set; } = string.Empty;

    public int DisplayOrder { get; set; }

    [Required]
    public short PartnerPkid { get; set; }

    /// <summary>Nullable FK — null means "no group".</summary>
    public short? CourseGroupPkid { get; set; }

    [Required]
    public byte PublishStatusPkid { get; set; }

    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }

    [MaxLength(500)]
    public string? Material { get; set; }

    [MaxLength(4000)]
    public string? Objective { get; set; }

    [MaxLength(500)]
    public string? Target { get; set; }

    [MaxLength(4000)]
    public string? Prerequisites { get; set; }

    /// <summary>nvarchar(max) — no length cap.</summary>
    public string? Outline { get; set; }

    /// <summary>nvarchar(max) — no length cap.</summary>
    public string? TowardCertOrExam { get; set; }

    [MaxLength(4000)]
    public string? Note { get; set; }

    [MaxLength(4000)]
    public string? OtherInfo { get; set; }

    public bool CanRepeat { get; set; }

    /// <summary>N-N (CourseInCertification): certifications this course counts toward.</summary>
    public List<int> CertificationPkids { get; set; } = [];

    /// <summary>N-N (CourseJobCategories): job categories this course targets. smallint PK.</summary>
    public List<short> JobCategoryPkids { get; set; } = [];
}
