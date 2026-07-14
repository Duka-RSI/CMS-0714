namespace CMS.API.Models;

/// <summary>
/// Search DTO for the Partner list filter drawer (POST /api/partners/query).
/// </summary>
public class PartnerQuery
{
    /// <summary>LIKE match across Name, AppKey, NameOnPartnerMenu and NameOnCourseDetailPage.</summary>
    public string? Keyword { get; set; }
}
