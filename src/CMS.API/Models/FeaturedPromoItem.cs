namespace CMS.API.Models;

/// <summary>
/// Response model for the FeaturedPromoItem table (上稿作業). PK is <see cref="Pkid"/>
/// (int IDENTITY). FKs to TrainingCenter and Promotion2; a UNIQUE index over
/// (ScheduleOn, TrainingCenter_pkid, Slot) makes each day/centre/slot cell hold at most
/// one row. <see cref="PromoCode"/> is joined in from Promotion2 for display.
/// </summary>
public class FeaturedPromoItem
{
    public int Pkid { get; set; }
    public DateOnly ScheduleOn { get; set; }
    public short TrainingCenterPkid { get; set; }
    public byte Slot { get; set; }
    public int PromotionPkid { get; set; }
    public string Topic { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    /// <summary>Joined from Promotion2 — the code the board shows and the form edits.</summary>
    public string PromoCode { get; set; } = string.Empty;
}
