using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

/// <summary>
/// The one anonymous controller. Every other endpoint falls back to "must be logged in"
/// (see the FallbackPolicy in Program.cs) — which would make logging in impossible if this
/// controller did not opt out.
/// </summary>
[ApiController]
[Route("api/Auth")]
[AllowAnonymous]
public class AuthController : ControllerBase
{
    /// <summary>
    /// Single message for every failed login. Which check failed (unknown user, wrong
    /// password, disabled account) is deliberately not disclosed — telling a caller
    /// "that user exists but is disabled" hands them a user-enumeration oracle.
    /// </summary>
    private const string InvalidCredentialsMessage = "使用者代碼或密碼錯誤。";

    private readonly IAuthRepository _repository;
    private readonly IJwtTokenService _tokenService;

    public AuthController(IAuthRepository repository, IJwtTokenService tokenService)
    {
        _repository = repository;
        _tokenService = tokenService;
    }

    /// <summary>
    /// Authenticate a user and issue a 24-hour access token.
    /// </summary>
    /// <response code="200">Credentials accepted; returns the profile and access token.</response>
    /// <response code="401">Any credential check failed.</response>
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var credential = await _repository.GetCredentialAsync(request.UserId, cancellationToken);

        // Three separate failures, one indistinguishable response.
        if (credential is null
            || !credential.IsActive
            || !PasswordHasher.Verify(request.Password, credential.PasswordHash))
        {
            return Unauthorized(new { message = InvalidCredentialsMessage });
        }

        string accessToken;
        try
        {
            accessToken = await _tokenService.CreateAccessTokenAsync(
                credential.UserId, credential.UserName, credential.RoleIds, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            // SysConfig 'appConfig' missing/malformed, or no usable signing secret — the
            // credentials were fine, so this is a server fault, not a 401.
            return Problem(title: "系統設定錯誤", detail: ex.Message,
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Ok(new LoginResponse
        {
            UserId = credential.UserId,
            UserName = credential.UserName,
            AccessToken = accessToken,
        });
    }
}
