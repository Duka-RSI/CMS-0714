using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

// 系統管理 feature: Admins only. The sidebar hides it for everyone else, but that is a UI
// affordance — this attribute is what actually enforces it.
[ApiController]
[Route("api/app-roles")]
[Authorize(Roles = RoleNames.Admin)]
public class AppRolesController : ControllerBase
{
    private readonly IAppRoleRepository _repository;

    public AppRolesController(IAppRoleRepository repository)
    {
        _repository = repository;
    }

    /// <summary>List all roles.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AppRole>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _repository.GetAllAsync(cancellationToken));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<AppRole>>> Query([FromBody] AppRoleQuery query, CancellationToken cancellationToken)
        => Ok(await _repository.QueryAsync(query, cancellationToken));

    /// <summary>Get a single role by its RoleId (string PK), including assigned users.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<AppRole>> GetById(string id, CancellationToken cancellationToken)
    {
        var role = await _repository.GetByIdAsync(id, cancellationToken);
        return role is null ? NotFound() : Ok(role);
    }

    /// <summary>Create a new role. Returns 409 if the RoleId already exists.</summary>
    [HttpPost]
    public async Task<ActionResult<AppRole>> Create([FromBody] AppRoleRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (await _repository.ExistsAsync(request.RoleId, cancellationToken))
        {
            return Conflict(new { message = $"角色代碼 '{request.RoleId}' 已存在。" });
        }

        var created = await _repository.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.RoleId }, created);
    }

    /// <summary>Update an existing role. RoleId (PK) is taken from the body and is immutable.</summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] AppRoleRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _repository.UpdateAsync(request, cancellationToken);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>Delete a role by RoleId.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken cancellationToken)
    {
        var deleted = await _repository.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}
