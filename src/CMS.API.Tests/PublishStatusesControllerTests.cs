using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the PublishStatus feature covering list/filter, view,
/// add, edit and delete. The repository is mocked so these run without a database.
/// </summary>
public class PublishStatusesControllerTests
{
    private readonly Mock<IPublishStatusRepository> _repository = new(MockBehavior.Strict);
    private readonly PublishStatusesController _controller;

    public PublishStatusesControllerTests()
    {
        _controller = new PublishStatusesController(_repository.Object);
    }

    private static PublishStatus Sample(byte pkid = 1) => new()
    {
        Pkid = pkid,
        Description = "草稿",
        IsDraft = true,
        IsPublished = false,
        IsDiscontinued = false
    };

    // ----- List -----

    [Fact]
    public async Task GetAll_ReturnsOkWithAllStatuses()
    {
        var statuses = new[] { Sample(1), Sample(2) };
        _repository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(statuses);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<PublishStatus>>(ok.Value);
        Assert.Equal(2, payload.Count());
    }

    // ----- Filter / query -----

    [Fact]
    public async Task Query_PassesKeywordToRepository_AndReturnsFiltered()
    {
        var query = new PublishStatusQuery { Keyword = "草" };
        _repository.Setup(r => r.QueryAsync(
                It.Is<PublishStatusQuery>(q => q.Keyword == "草"), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample(1) });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<PublishStatus>>(ok.Value);
        Assert.Single(payload);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Query_WithIsPublished_PassesFilterThrough()
    {
        var query = new PublishStatusQuery { IsPublished = true };
        _repository.Setup(r => r.QueryAsync(
                It.Is<PublishStatusQuery>(q => q.IsPublished == true), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample(2) });

        var result = await _controller.Query(query, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repository.VerifyAll();
    }

    // ----- View -----

    [Fact]
    public async Task GetById_WhenFound_ReturnsOkWithStatus()
    {
        _repository.Setup(r => r.GetByIdAsync((byte)1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample(1));

        var result = await _controller.GetById(1, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var status = Assert.IsType<PublishStatus>(ok.Value);
        Assert.Equal((byte)1, status.Pkid);
    }

    [Fact]
    public async Task GetById_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.GetByIdAsync((byte)99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((PublishStatus?)null);

        var result = await _controller.GetById(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    // ----- Add -----

    [Fact]
    public async Task Create_WhenNew_ReturnsCreatedAtAction()
    {
        var request = new PublishStatusRequest
        {
            Pkid = 5,
            Description = "已發布",
            IsDraft = false,
            IsPublished = true,
            IsDiscontinued = false
        };
        _repository.Setup(r => r.ExistsAsync((byte)5, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repository.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PublishStatus { Pkid = 5, Description = "已發布", IsPublished = true });

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(PublishStatusesController.GetById), created.ActionName);
        Assert.Equal((byte)5, created.RouteValues!["id"]);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Create_WhenPkidExists_ReturnsConflict()
    {
        var request = new PublishStatusRequest { Pkid = 1, Description = "Dup" };
        _repository.Setup(r => r.ExistsAsync((byte)1, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result.Result);
        _repository.Verify(r => r.CreateAsync(It.IsAny<PublishStatusRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ----- Edit -----

    [Fact]
    public async Task Update_WhenExisting_ReturnsNoContent()
    {
        var request = new PublishStatusRequest
        {
            Pkid = 1,
            Description = "草稿",
            IsDraft = true
        };
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Update_WhenMissing_ReturnsNotFound()
    {
        var request = new PublishStatusRequest { Pkid = 99, Description = "x" };
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    // ----- Delete -----

    [Fact]
    public async Task Delete_WhenExisting_ReturnsNoContent()
    {
        _repository.Setup(r => r.DeleteAsync((byte)1, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete(1, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Delete_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.DeleteAsync((byte)99, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }
}
