namespace CMS.API.Models;

/// <summary>
/// Search DTO for the FeaturedPromoItem board (POST /api/featured-promo-items/query).
/// The board always shows exactly one Monday–Sunday week for one training centre.
/// </summary>
public class FeaturedPromoItemQuery
{
    /// <summary>Board slots are fixed at 1–3 (see the spec's "Slot 1, 2, 3").</summary>
    public const byte MinSlot = 1;
    public const byte MaxSlot = 3;

    /// <summary>
    /// Any date inside the wanted week. The controller snaps this to the Monday of that
    /// week before it reaches the repository, so the filter is always a clean 7-day span.
    /// </summary>
    public DateOnly WeekStart { get; set; }

    /// <summary>Filters the TrainingCenter_pkid column — the board's tab strip. Null = all centres.</summary>
    public short? TrainingCenterPkid { get; set; }

    /// <summary>Snap <see cref="WeekStart"/> back to the Monday of its week.</summary>
    public void NormalizeWeekStart() => WeekStart = MondayOf(WeekStart);

    /// <summary>The Monday on or before <paramref name="date"/> (weeks run Monday–Sunday).</summary>
    public static DateOnly MondayOf(DateOnly date)
        => date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
}
