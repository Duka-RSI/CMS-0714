using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating a FeaturedPromoItem. <see cref="Pkid"/> is an int
/// IDENTITY — server-assigned on create (ignored in the INSERT) and immutable on update.
/// The client resolves a PromoCode to <see cref="PromotionPkid"/> via
/// GET /api/lookups/promotions before saving.
/// </summary>
public class FeaturedPromoItemRequest
{
    public int Pkid { get; set; }

    [Required]
    public DateOnly ScheduleOn { get; set; }

    [Required]
    public short TrainingCenterPkid { get; set; }

    /// <summary>Board slots are fixed at 1–3.</summary>
    [Range(FeaturedPromoItemQuery.MinSlot, FeaturedPromoItemQuery.MaxSlot)]
    public byte Slot { get; set; }

    [Required]
    public int PromotionPkid { get; set; }

    [Required]
    [MaxLength(100)]
    public string Topic { get; set; } = string.Empty;

    [Required]
    [MaxLength(300)]
    public string Description { get; set; } = string.Empty;
}
