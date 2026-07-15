using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

// 系統管理 feature: Admins only. Note this restricts the *maintenance* CRUD only — the
// non-admin Course/FeaturedPromoItem forms read statuses via /api/lookups/publish-statuses,
// which stays open to any logged-in user.
[ApiController]
[Route("api/publish-statuses")]
[Authorize(Roles = RoleNames.Admin)]
public class PublishStatusesController : ControllerBase
{
    private readonly IPublishStatusRepository _repository;

    public PublishStatusesController(IPublishStatusRepository repository)
    {
        _repository = repository;
    }

    /// <summary>List all publish statuses.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<PublishStatus>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _repository.GetAllAsync(cancellationToken));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<PublishStatus>>> Query([FromBody] PublishStatusQuery query, CancellationToken cancellationToken)
        => Ok(await _repository.QueryAsync(query, cancellationToken));

    /// <summary>Get a single publish status by its pkid.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<PublishStatus>> GetById(byte id, CancellationToken cancellationToken)
    {
        var status = await _repository.GetByIdAsync(id, cancellationToken);
        return status is null ? NotFound() : Ok(status);
    }

    /// <summary>Create a new publish status. Returns 409 if the pkid already exists.</summary>
    [HttpPost]
    public async Task<ActionResult<PublishStatus>> Create([FromBody] PublishStatusRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (await _repository.ExistsAsync(request.Pkid, cancellationToken))
        {
            return Conflict(new { message = $"主代碼 '{request.Pkid}' 已存在。" });
        }

        var created = await _repository.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    /// <summary>Update an existing publish status. pkid is taken from the body and is immutable.</summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] PublishStatusRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _repository.UpdateAsync(request, cancellationToken);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>Delete a publish status by pkid.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(byte id, CancellationToken cancellationToken)
    {
        var deleted = await _repository.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}
