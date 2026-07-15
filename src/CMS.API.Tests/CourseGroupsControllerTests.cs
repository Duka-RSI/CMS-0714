using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the CourseGroup feature covering list/filter, view,
/// add, edit and delete. The repository is mocked so these run without a database.
/// pkid is a smallint IDENTITY, so there is no create-conflict (409) path.
/// </summary>
public class CourseGroupsControllerTests
{
    private readonly Mock<ICourseGroupRepository> _repository = new(MockBehavior.Strict);
    private readonly CourseGroupsController _controller;

    public CourseGroupsControllerTests()
    {
        _controller = new CourseGroupsController(_repository.Object);
    }

    private static CourseGroup Sample(short pkid = 1) => new()
    {
        Pkid = pkid,
        Description = "資訊類"
    };

    private static CourseGroupRequest SampleRequest(short pkid = 0) => new()
    {
        Pkid = pkid,
        Description = "資訊類"
    };

    // ----- List -----

    [Fact]
    public async Task GetAll_ReturnsOkWithAllCourseGroups()
    {
        var courseGroups = new[] { Sample(1), Sample(2) };
        _repository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(courseGroups);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<CourseGroup>>(ok.Value);
        Assert.Equal(2, payload.Count());
    }

    // ----- Filter / query -----

    [Fact]
    public async Task Query_PassesKeywordToRepository_AndReturnsFiltered()
    {
        var query = new CourseGroupQuery { Keyword = "資訊" };
        _repository.Setup(r => r.QueryAsync(
                It.Is<CourseGroupQuery>(q => q.Keyword == "資訊"), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample(1) });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<CourseGroup>>(ok.Value);
        Assert.Single(payload);
        _repository.VerifyAll();
    }

    // ----- View -----

    [Fact]
    public async Task GetById_WhenFound_ReturnsOkWithCourseGroup()
    {
        _repository.Setup(r => r.GetByIdAsync((short)1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample(1));

        var result = await _controller.GetById(1, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var courseGroup = Assert.IsType<CourseGroup>(ok.Value);
        Assert.Equal((short)1, courseGroup.Pkid);
    }

    [Fact]
    public async Task GetById_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.GetByIdAsync((short)99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((CourseGroup?)null);

        var result = await _controller.GetById(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    // ----- Add -----

    [Fact]
    public async Task Create_ReturnsCreatedAtActionWithNewPkid()
    {
        var request = SampleRequest();
        _repository.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample(7));

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(CourseGroupsController.GetById), created.ActionName);
        Assert.Equal((short)7, created.RouteValues!["id"]);
        _repository.VerifyAll();
    }

    // ----- Edit -----

    [Fact]
    public async Task Update_WhenExisting_ReturnsNoContent()
    {
        var request = SampleRequest(1);
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Update_WhenMissing_ReturnsNotFound()
    {
        var request = SampleRequest(99);
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    // ----- Delete -----

    [Fact]
    public async Task Delete_WhenExisting_ReturnsNoContent()
    {
        _repository.Setup(r => r.DeleteAsync((short)1, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete(1, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Delete_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.DeleteAsync((short)99, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }
}
