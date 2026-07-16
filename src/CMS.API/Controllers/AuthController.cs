using System.Security.Claims;
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
/// <remarks>
/// ⚠️ Because <c>[AllowAnonymous]</c> sits on the controller, any action here that is NOT
/// meant to be public must opt back in with its own <c>[Authorize]</c> — the global
/// fallback policy will not do it for them. See <see cref="UpdateProfile"/>.
/// </remarks>
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

    /// <summary>
    /// Update the signed-in user's own display name.
    /// </summary>
    /// <remarks>
    /// The user being edited is taken from the token's "sub" claim — never from the body.
    /// <see cref="UpdateProfileRequest"/> has no UserId property at all, so a caller cannot
    /// rename another account, and no RoleIds property, so they cannot grant themselves a
    /// role. Admins who need to edit other users go through /api/app-users.
    /// </remarks>
    /// <response code="200">Updated; returns the stored (trimmed) profile.</response>
    /// <response code="400">UserName was missing, blank, or whitespace only.</response>
    /// <response code="401">No valid bearer token.</response>
    /// <response code="404">The token names a user that no longer exists.</response>
    [HttpPut("profile")]
    [Authorize] // Opts back in: the controller is [AllowAnonymous].
    [ProducesResponseType(typeof(UserProfileResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<UserProfileResponse>> UpdateProfile(
        [FromBody] UpdateProfileRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        // [Required] rejects null and "", but "   " sails through it — trim and re-check.
        var userName = request.UserName.Trim();
        if (userName.Length == 0)
        {
            ModelState.AddModelError(nameof(request.UserName), "使用者名稱不可為空白。");
            return ValidationProblem(ModelState);
        }

        var userId = User.FindFirstValue(JwtTokenService.UserIdClaimType);
        if (string.IsNullOrEmpty(userId))
        {
            // Authenticated but the token carries no subject — not something a valid token
            // issued here can do, so treat it as a bad token rather than a server fault.
            return Unauthorized(new { message = InvalidCredentialsMessage });
        }

        var updated = await _repository.UpdateUserNameAsync(userId, userName, cancellationToken);
        if (!updated)
        {
            // The token is valid but its user is gone (deleted since it was issued).
            return NotFound();
        }

        return Ok(new UserProfileResponse { UserId = userId, UserName = userName });
    }

    /// <summary>
    /// Change the signed-in user's own password.
    /// </summary>
    /// <remarks>
    /// Like <see cref="UpdateProfile"/>, the account comes from the token's "sub" claim.
    /// Nothing hashed crosses the wire in either direction: plaintext in, 204 out.
    /// </remarks>
    /// <response code="204">Password changed.</response>
    /// <response code="400">
    /// Current password wrong, new password fails the policy, or the confirmation does not
    /// match. Deliberately **not** 401 — see the comment on the current-password check.
    /// </response>
    /// <response code="401">No valid bearer token.</response>
    /// <response code="404">The token names a user that no longer exists.</response>
    [HttpPost("change-password")]
    [Authorize] // Opts back in: the controller is [AllowAnonymous].
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var userId = User.FindFirstValue(JwtTokenService.UserIdClaimType);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(new { message = InvalidCredentialsMessage });
        }

        var credential = await _repository.GetCredentialAsync(userId, cancellationToken);
        if (credential is null)
        {
            // Valid token, but its user has been deleted since it was issued.
            return NotFound();
        }

        // 1. The current password must be right, or nothing else happens.
        if (!PasswordHasher.Verify(request.CurrentPassword, credential.PasswordHash))
        {
            // 400, not 401: the caller IS authenticated — they just mistyped. A 401 here
            // would trip the client's session-expiry interceptor and log them out for a
            // typo.
            return BadRequest(new { message = "目前密碼不正確。" });
        }

        // 2. The new password must satisfy the complexity policy.
        if (!PasswordPolicy.IsCompliant(request.NewPassword))
        {
            return BadRequest(new { message = PasswordPolicy.RequirementMessage });
        }

        // 3. ...and must have been typed twice identically. Ordinal: a password comparison
        // must never apply culture rules.
        if (!string.Equals(request.NewPassword, request.ConfirmPassword, StringComparison.Ordinal))
        {
            return BadRequest(new { message = "新密碼與確認密碼不一致。" });
        }

        // 4. Store the hash and stamp PasswordUpdatedTime (the repository's SQL does the stamp).
        var updated = await _repository.UpdatePasswordAsync(
            userId, PasswordHasher.Hash(request.NewPassword), cancellationToken);

        return updated ? NoContent() : NotFound();
    }
}
