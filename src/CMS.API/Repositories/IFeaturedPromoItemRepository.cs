using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IFeaturedPromoItemRepository
{
    Task<IEnumerable<FeaturedPromoItem>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<FeaturedPromoItem>> QueryAsync(FeaturedPromoItemQuery query, CancellationToken cancellationToken = default);
    Task<FeaturedPromoItem?> GetByIdAsync(int pkid, CancellationToken cancellationToken = default);
    Task<FeaturedPromoItem> CreateAsync(FeaturedPromoItemRequest request, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(FeaturedPromoItemRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int pkid, CancellationToken cancellationToken = default);

    /// <summary>True when the day/centre/slot cell is already taken by another row.</summary>
    Task<bool> SlotTakenAsync(FeaturedPromoItemRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Move a row to another slot on the same day/centre, swapping with the occupying row
    /// if there is one. False when the row does not exist.
    /// </summary>
    Task<bool> MoveSlotAsync(SlotMoveRequest request, CancellationToken cancellationToken = default);
}
