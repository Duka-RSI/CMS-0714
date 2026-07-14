using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the AppRole feature covering list/filter, view, add and edit.
/// The repository is mocked so these run without a database.
/// </summary>
public class AppRolesControllerTests
{
    private readonly Mock<IAppRoleRepository> _repository = new(MockBehavior.Strict);
    private readonly AppRolesController _controller;

    public AppRolesControllerTests()
    {
        _controller = new AppRolesController(_repository.Object);
    }

    private static AppRole SampleRole(string roleId = "Admin") => new()
    {
        Pkid = 1,
        RoleId = roleId,
        RoleName = "Administrator",
        PermissionLevel = 1,
        Description = "系統管理員",
        UserCount = 3,
        UserIds = ["helen", "Jenny_Tsao", "miles@uuu.com.tw"]
    };

    // ----- List -----

    [Fact]
    public async Task GetAll_ReturnsOkWithAllRoles()
    {
        var roles = new[] { SampleRole("Admin"), SampleRole("User") };
        _repository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(roles);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<AppRole>>(ok.Value);
        Assert.Equal(2, payload.Count());
    }

    // ----- Filter / query -----

    [Fact]
    public async Task Query_PassesKeywordToRepository_AndReturnsFiltered()
    {
        var query = new AppRoleQuery { Keyword = "adm" };
        _repository.Setup(r => r.QueryAsync(
                It.Is<AppRoleQuery>(q => q.Keyword == "adm"), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { SampleRole("Admin") });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<AppRole>>(ok.Value);
        Assert.Single(payload);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Query_WithPermissionLevel_PassesFilterThrough()
    {
        var query = new AppRoleQuery { PermissionLevel = 1 };
        _repository.Setup(r => r.QueryAsync(
                It.Is<AppRoleQuery>(q => q.PermissionLevel == 1), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { SampleRole("Admin") });

        var result = await _controller.Query(query, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repository.VerifyAll();
    }

    // ----- View -----

    [Fact]
    public async Task GetById_WhenFound_ReturnsOkWithRoleAndUsers()
    {
        _repository.Setup(r => r.GetByIdAsync("Admin", It.IsAny<CancellationToken>()))
            .ReturnsAsync(SampleRole("Admin"));

        var result = await _controller.GetById("Admin", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var role = Assert.IsType<AppRole>(ok.Value);
        Assert.Equal("Admin", role.RoleId);
        Assert.Equal(3, role.UserIds.Count);
    }

    [Fact]
    public async Task GetById_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.GetByIdAsync("Ghost", It.IsAny<CancellationToken>()))
            .ReturnsAsync((AppRole?)null);

        var result = await _controller.GetById("Ghost", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    // ----- Add -----

    [Fact]
    public async Task Create_WhenNew_ReturnsCreatedAtAction()
    {
        var request = new AppRoleRequest
        {
            RoleId = "Editor",
            RoleName = "Content Editor",
            PermissionLevel = 50,
            Description = "編輯",
            UserIds = ["helen"]
        };
        _repository.Setup(r => r.ExistsAsync("Editor", It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repository.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppRole { Pkid = 3, RoleId = "Editor", RoleName = "Content Editor", PermissionLevel = 50 });

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(AppRolesController.GetById), created.ActionName);
        Assert.Equal("Editor", created.RouteValues!["id"]);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Create_WhenRoleIdExists_ReturnsConflict()
    {
        var request = new AppRoleRequest { RoleId = "Admin", RoleName = "Dup" };
        _repository.Setup(r => r.ExistsAsync("Admin", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result.Result);
        _repository.Verify(r => r.CreateAsync(It.IsAny<AppRoleRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ----- Edit -----

    [Fact]
    public async Task Update_WhenExisting_ReturnsNoContent()
    {
        var request = new AppRoleRequest
        {
            RoleId = "Admin",
            RoleName = "Administrator",
            PermissionLevel = 1,
            Description = "系統管理員",
            UserIds = ["helen", "miles@uuu.com.tw"]
        };
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Update_WhenMissing_ReturnsNotFound()
    {
        var request = new AppRoleRequest { RoleId = "Ghost", RoleName = "x" };
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }
}
