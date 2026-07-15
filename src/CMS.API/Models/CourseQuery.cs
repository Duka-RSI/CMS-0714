namespace CMS.API.Models;

/// <summary>
/// Search DTO for the Course list filter drawer (POST /api/courses/query).
/// </summary>
public class CourseQuery
{
    /// <summary>
    /// LIKE match across Title, CourseId, ProdCourseId and OfficialTitle. Deliberately
    /// excludes the nvarchar(4000)/(max) columns — large text is slow and rarely useful
    /// as a keyword target.
    /// </summary>
    public string? Keyword { get; set; }

    public short? PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte? PublishStatusPkid { get; set; }

    /// <summary>Tri-state: null = 全部, true = 允許重聽, false = 不允許.</summary>
    public bool? CanRepeat { get; set; }

    /// <summary>Inclusive range on ScheduleOn.</summary>
    public DateOnly? ScheduleOnFrom { get; set; }
    public DateOnly? ScheduleOnTo { get; set; }

    /// <summary>Inclusive range on ScheduleOff.</summary>
    public DateOnly? ScheduleOffFrom { get; set; }
    public DateOnly? ScheduleOffTo { get; set; }
}
