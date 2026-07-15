using CMS.API.Auditing;

namespace CMS.API.Models;

/// <summary>
/// Response model for the Course table (課程). PK is <see cref="Pkid"/> (int IDENTITY).
/// FKs to Partner, CourseGroup (nullable) and PublishStatus; N-N with Certification
/// (CourseInCertification) and JobCategory (CourseJobCategories).
/// </summary>
/// <remarks>
/// FK labels are flattened in via JOIN rather than Dapper multi-map nav objects, matching
/// FeaturedPromoItemRepository.
/// </remarks>
public class Course
{
    public int Pkid { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? OfficialTitle { get; set; }
    public string CourseId { get; set; } = string.Empty;
    public string ProdCourseId { get; set; } = string.Empty;
    public string FriendlyUrl { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }

    public short PartnerPkid { get; set; }
    /// <summary>Nullable FK — a course need not belong to a group.</summary>
    public short? CourseGroupPkid { get; set; }
    public byte PublishStatusPkid { get; set; }

    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }

    public string? Material { get; set; }
    public string? Objective { get; set; }
    public string? Target { get; set; }
    public string? Prerequisites { get; set; }
    public string? Outline { get; set; }
    public string? TowardCertOrExam { get; set; }
    public string? Note { get; set; }
    public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }

    /// <summary>Joined from Partner (原廠).</summary>
    [NotAudited]
    public string PartnerName { get; set; } = string.Empty;

    /// <summary>Joined from CourseGroup (課程群組). Null when <see cref="CourseGroupPkid"/> is null.</summary>
    [NotAudited]
    public string? CourseGroupDescription { get; set; }

    /// <summary>Joined from PublishStatus (上架狀態).</summary>
    [NotAudited]
    public string PublishStatusDescription { get; set; } = string.Empty;

    /// <summary>Number of CourseInCertification rows ("認證數"). Subquery count.</summary>
    [NotAudited]
    public int CertificationCount { get; set; }

    /// <summary>Number of CourseJobCategories rows ("職務類別數"). Subquery count.</summary>
    [NotAudited]
    public int JobCategoryCount { get; set; }

    /// <summary>N-N (CourseInCertification). Populated only on GET-by-id.</summary>
    public List<int> CertificationPkids { get; set; } = [];

    /// <summary>N-N (CourseJobCategories). Populated only on GET-by-id.</summary>
    public List<short> JobCategoryPkids { get; set; } = [];
}
