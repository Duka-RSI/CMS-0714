using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Body for POST /api/featured-promo-items/move-slot — the board's "+" (move down, e.g.
/// 1 → 2) and "−" (move up, e.g. 2 → 1) links. If <see cref="TargetSlot"/> is already
/// taken on the same day/centre the two rows swap, which keeps the UNIQUE index over
/// (ScheduleOn, TrainingCenter_pkid, Slot) satisfied without touching a third row.
/// </summary>
public class SlotMoveRequest
{
    [Required]
    public int Pkid { get; set; }

    [Range(FeaturedPromoItemQuery.MinSlot, FeaturedPromoItemQuery.MaxSlot)]
    public byte TargetSlot { get; set; }
}
