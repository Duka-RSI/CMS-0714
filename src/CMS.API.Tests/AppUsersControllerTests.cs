using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the AppUser feature covering list/filter, view, add, edit,
/// delete and reset-password. The repository is mocked so these run without a database.
/// UserId is a user-assigned string PK, so create guards with Exists → 409.
/// </summary>
public class AppUsersControllerTests
{
    private readonly Mock<IAppUserRepository> _repository = new(MockBehavior.Strict);
    private readonly AppUsersController _controller;

    public AppUsersControllerTests()
    {
        _controller = new AppUsersController(_repository.Object);
    }

    private static AppUser Sample(string userId = "miles@uuu.com.tw") => new()
    {
        Pkid = 1,
        UserId = userId,
        UserName = "Miles",
        IsActive = true,
        PasswordUpdatedTime = null,
        RoleCount = 2,
        RoleIds = ["admin", "editor"]
    };

    private static AppUserRequest SampleRequest(string userId = "miles@uuu.com.tw") => new()
    {
        UserId = userId,
        UserName = "Miles",
        IsActive = true,
        RoleIds = ["admin", "editor"]
    };

    // ----- List -----

    [Fact]
    public async Task GetAll_ReturnsOkWithAllUsers()
    {
        var users = new[] { Sample("a@x.com"), Sample("b@x.com") };
        _repository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(users);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<AppUser>>(ok.Value);
        Assert.Equal(2, payload.Count());
    }

    // ----- Filter / query -----

    [Fact]
    public async Task Query_PassesKeywordAndIsActiveToRepository()
    {
        var query = new AppUserQuery { Keyword = "miles", IsActive = true };
        _repository.Setup(r => r.QueryAsync(
                It.Is<AppUserQuery>(q => q.Keyword == "miles" && q.IsActive == true),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample() });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<AppUser>>(ok.Value));
        _repository.VerifyAll();
    }

    // ----- View -----

    [Fact]
    public async Task GetById_WhenFound_ReturnsOkWithUserAndRoles()
    {
        _repository.Setup(r => r.GetByIdAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample());

        var result = await _controller.GetById("miles@uuu.com.tw", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var user = Assert.IsType<AppUser>(ok.Value);
        Assert.Equal("miles@uuu.com.tw", user.UserId);
        Assert.Equal(["admin", "editor"], user.RoleIds);
    }

    [Fact]
    public async Task GetById_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.GetByIdAsync("nobody", It.IsAny<CancellationToken>()))
            .ReturnsAsync((AppUser?)null);

        var result = await _controller.GetById("nobody", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    // ----- Add -----

    [Fact]
    public async Task Create_WhenNew_ReturnsCreatedAtAction()
    {
        var request = SampleRequest();
        _repository.Setup(r => r.ExistsAsync(request.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repository.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(Sample());

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(AppUsersController.GetById), created.ActionName);
        Assert.Equal("miles@uuu.com.tw", created.RouteValues!["id"]);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Create_WhenUserIdExists_ReturnsConflict()
    {
        var request = SampleRequest();
        _repository.Setup(r => r.ExistsAsync(request.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result.Result);
        // Must not attempt the insert when the key is taken.
        _repository.Verify(r => r.CreateAsync(It.IsAny<AppUserRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_WhenSysConfigIsBroken_Returns500()
    {
        var request = SampleRequest();
        _repository.Setup(r => r.ExistsAsync(request.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repository.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SysConfig 'appConfig' 未設定 'defaultPassword'。"));

        var result = await _controller.Create(request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status500InternalServerError, problem.StatusCode);
    }

    // ----- Edit -----

    [Fact]
    public async Task Update_WhenExisting_ReturnsNoContent()
    {
        var request = SampleRequest();
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Update_WhenMissing_ReturnsNotFound()
    {
        var request = SampleRequest("nobody");
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    // ----- Delete -----

    [Fact]
    public async Task Delete_WhenExisting_ReturnsNoContent()
    {
        _repository.Setup(r => r.DeleteAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete("miles@uuu.com.tw", CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Delete_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.DeleteAsync("nobody", It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete("nobody", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    // ----- Reset password -----

    [Fact]
    public async Task ResetPassword_WhenExisting_ReturnsNoContent()
    {
        _repository.Setup(r => r.ResetPasswordAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.ResetPassword("miles@uuu.com.tw", CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task ResetPassword_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.ResetPasswordAsync("nobody", It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.ResetPassword("nobody", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task ResetPassword_WhenSysConfigIsBroken_Returns500()
    {
        _repository.Setup(r => r.ResetPasswordAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SysConfig 'appConfig' 設定不存在或為空,無法取得預設密碼。"));

        var result = await _controller.ResetPassword("miles@uuu.com.tw", CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status500InternalServerError, problem.StatusCode);
    }

    // ----- Password exposure guard -----

    [Fact]
    public void AppUserModels_DoNotExposePasswordHash()
    {
        // PasswordHash must never reach the client, nor be accepted from it.
        Assert.Null(typeof(AppUser).GetProperty("PasswordHash"));
        Assert.Null(typeof(AppUserRequest).GetProperty("PasswordHash"));
        Assert.Null(typeof(AppUserRequest).GetProperty("PasswordUpdatedTime"));
    }
}
