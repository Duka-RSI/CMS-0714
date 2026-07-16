using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/featured-promo-items")]
public class FeaturedPromoItemsController : ControllerBase
{
    private readonly IFeaturedPromoItemRepository _repository;

    public FeaturedPromoItemsController(IFeaturedPromoItemRepository repository)
    {
        _repository = repository;
    }

    /// <summary>List every featured promo item.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<FeaturedPromoItem>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _repository.GetAllAsync(cancellationToken));

    /// <summary>
    /// The board query: one Monday–Sunday week, optionally one training centre.
    /// WeekStart is snapped to Monday here so any date inside the wanted week works.
    /// </summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<FeaturedPromoItem>>> Query(
        [FromBody] FeaturedPromoItemQuery query, CancellationToken cancellationToken)
    {
        query.NormalizeWeekStart();
        return Ok(await _repository.QueryAsync(query, cancellationToken));
    }

    /// <summary>Get a single featured promo item by its pkid.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<FeaturedPromoItem>> GetById(int id, CancellationToken cancellationToken)
    {
        var item = await _repository.GetByIdAsync(id, cancellationToken);
        return item is null ? NotFound() : Ok(item);
    }

    /// <summary>Create an item. pkid is IDENTITY (server-assigned).</summary>
    [HttpPost]
    public async Task<ActionResult<FeaturedPromoItem>> Create(
        [FromBody] FeaturedPromoItemRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        // Guards the UNIQUE index over (ScheduleOn, TrainingCenter_pkid, Slot).
        if (await _repository.SlotTakenAsync(request, cancellationToken))
        {
            return Conflict(SlotTakenMessage(request));
        }

        var created = await _repository.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    /// <summary>Update an item. pkid comes from the body and is immutable.</summary>
    [HttpPut]
    public async Task<IActionResult> Update(
        [FromBody] FeaturedPromoItemRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (await _repository.SlotTakenAsync(request, cancellationToken))
        {
            return Conflict(SlotTakenMessage(request));
        }

        var updated = await _repository.UpdateAsync(request, cancellationToken);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>
    /// The board's "+" / "−" links. Moves a row to another slot on the same day and
    /// centre, swapping with the occupying row when the target slot is taken.
    /// </summary>
    [HttpPost("move-slot")]
    public async Task<IActionResult> MoveSlot(
        [FromBody] SlotMoveRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var moved = await _repository.MoveSlotAsync(request, cancellationToken);
        return moved ? NoContent() : NotFound();
    }

    /// <summary>Delete an item by pkid.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var deleted = await _repository.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }

    private static string SlotTakenMessage(FeaturedPromoItemRequest request)
        => $"{request.ScheduleOn:yyyy-MM-dd} 第 {request.Slot} 欄位已有資料。";
}
