namespace CMS.API.Models;

/// <summary>
/// Slim Promotion2 row for the FeaturedPromoItem form's PromoCode lookup. Carries Topic
/// and Description so picking a code can prefill both fields without a second round trip.
/// </summary>
public class PromotionLookup
{
    public int Pkid { get; set; }
    public string PromoCode { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
