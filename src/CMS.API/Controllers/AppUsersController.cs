using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/app-users")]
public class AppUsersController : ControllerBase
{
    private readonly IAppUserRepository _repository;

    public AppUsersController(IAppUserRepository repository)
    {
        _repository = repository;
    }

    /// <summary>List all users.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AppUser>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _repository.GetAllAsync(cancellationToken));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<AppUser>>> Query([FromBody] AppUserQuery query, CancellationToken cancellationToken)
        => Ok(await _repository.QueryAsync(query, cancellationToken));

    /// <summary>Get a single user by its UserId (string PK), including assigned roles.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<AppUser>> GetById(string id, CancellationToken cancellationToken)
    {
        var user = await _repository.GetByIdAsync(id, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    /// <summary>
    /// Create a new user. Returns 409 if the UserId already exists. The password is not
    /// accepted from the client — the server hashes the SysConfig default password.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<AppUser>> Create([FromBody] AppUserRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (await _repository.ExistsAsync(request.UserId, cancellationToken))
        {
            return Conflict(new { message = $"使用者代碼 '{request.UserId}' 已存在。" });
        }

        AppUser created;
        try
        {
            created = await _repository.CreateAsync(request, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            // SysConfig 'appConfig' missing/malformed — a user cannot be created without a
            // password because PasswordHash is NOT NULL.
            return Problem(title: "系統設定錯誤", detail: ex.Message,
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return CreatedAtAction(nameof(GetById), new { id = created.UserId }, created);
    }

    /// <summary>
    /// Update an existing user. UserId (PK) is taken from the body and is immutable.
    /// Never modifies the password — use the reset-password endpoint for that.
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] AppUserRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _repository.UpdateAsync(request, cancellationToken);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>Delete a user by UserId.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken cancellationToken)
    {
        var deleted = await _repository.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }

    /// <summary>Reset the user's password back to the SysConfig default password.</summary>
    [HttpPost("{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(string id, CancellationToken cancellationToken)
    {
        bool reset;
        try
        {
            reset = await _repository.ResetPasswordAsync(id, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Problem(title: "系統設定錯誤", detail: ex.Message,
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return reset ? NoContent() : NotFound();
    }
}
