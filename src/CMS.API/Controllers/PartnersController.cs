using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/partners")]
public class PartnersController : ControllerBase
{
    private readonly IPartnerRepository _repository;

    public PartnersController(IPartnerRepository repository)
    {
        _repository = repository;
    }

    /// <summary>List all partners.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Partner>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _repository.GetAllAsync(cancellationToken));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<Partner>>> Query([FromBody] PartnerQuery query, CancellationToken cancellationToken)
        => Ok(await _repository.QueryAsync(query, cancellationToken));

    /// <summary>Get a single partner by its pkid.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Partner>> GetById(short id, CancellationToken cancellationToken)
    {
        var partner = await _repository.GetByIdAsync(id, cancellationToken);
        return partner is null ? NotFound() : Ok(partner);
    }

    /// <summary>Create a new partner. pkid is IDENTITY (server-assigned).</summary>
    [HttpPost]
    public async Task<ActionResult<Partner>> Create([FromBody] PartnerRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var created = await _repository.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    /// <summary>Update an existing partner. pkid is taken from the body and is immutable.</summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] PartnerRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _repository.UpdateAsync(request, cancellationToken);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>Delete a partner by pkid.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(short id, CancellationToken cancellationToken)
    {
        var deleted = await _repository.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}
