using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the Course feature covering list/filter, view, add, edit and
/// delete. The repository is mocked so these run without a database. pkid is an int
/// IDENTITY and Course carries no UNIQUE constraint, so there is no create-conflict path —
/// but delete has one: no FK to Course cascades, so child rows block it with a 409.
/// </summary>
public class CoursesControllerTests
{
    private readonly Mock<ICourseRepository> _repository = new(MockBehavior.Strict);
    private readonly CoursesController _controller;

    public CoursesControllerTests()
    {
        _controller = new CoursesController(_repository.Object);
    }

    private static Course Sample(int pkid = 1) => new()
    {
        Pkid = pkid,
        Title = "Azure 系統管理",
        CourseId = "AZ-104",
        ProdCourseId = "P-AZ-104",
        FriendlyUrl = "az-104",
        DisplayOrder = 1,
        PartnerPkid = 5,
        CourseGroupPkid = 3,
        PublishStatusPkid = 1,
        ScheduleOn = new DateOnly(2026, 1, 1),
        ScheduleOff = new DateOnly(2036, 1, 1),
        Hour = 35,
        ListPrice = 24000m,
        LearningCredit = 3.5m,
        CanRepeat = true,
        PartnerName = "微軟",
        CourseGroupDescription = "雲端系列",
        PublishStatusDescription = "已上架",
        CertificationCount = 2,
        JobCategoryCount = 1,
        CertificationPkids = [10, 11],
        JobCategoryPkids = [7]
    };

    private static CourseRequest SampleRequest(int pkid = 0) => new()
    {
        Pkid = pkid,
        Title = "Azure 系統管理",
        CourseId = "AZ-104",
        ProdCourseId = "P-AZ-104",
        FriendlyUrl = "az-104",
        DisplayOrder = 1,
        PartnerPkid = 5,
        CourseGroupPkid = 3,
        PublishStatusPkid = 1,
        ScheduleOn = new DateOnly(2026, 1, 1),
        ScheduleOff = new DateOnly(2036, 1, 1),
        Hour = 35,
        ListPrice = 24000m,
        LearningCredit = 3.5m,
        CanRepeat = true,
        CertificationPkids = [10, 11],
        JobCategoryPkids = [7]
    };

    // ----- List -----

    [Fact]
    public async Task GetAll_ReturnsOkWithAllCourses()
    {
        _repository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample(1), Sample(2) });

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(2, Assert.IsAssignableFrom<IEnumerable<Course>>(ok.Value).Count());
    }

    [Fact]
    public async Task GetAll_CarriesJoinedFkLabels()
    {
        _repository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample(1) });

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var course = Assert.IsAssignableFrom<IEnumerable<Course>>(ok.Value).Single();
        // The list shows partner.name / courseGroup.description / publishStatus.description,
        // not the raw pkids.
        Assert.Equal("微軟", course.PartnerName);
        Assert.Equal("雲端系列", course.CourseGroupDescription);
        Assert.Equal("已上架", course.PublishStatusDescription);
    }

    // ----- Filter / query -----

    [Fact]
    public async Task Query_PassesEveryFilterToRepository()
    {
        var query = new CourseQuery
        {
            Keyword = "azure",
            PartnerPkid = 5,
            CourseGroupPkid = 3,
            PublishStatusPkid = 1,
            CanRepeat = true,
            ScheduleOnFrom = new DateOnly(2026, 1, 1),
            ScheduleOnTo = new DateOnly(2026, 12, 31),
            ScheduleOffFrom = new DateOnly(2030, 1, 1),
            ScheduleOffTo = new DateOnly(2040, 12, 31)
        };
        _repository.Setup(r => r.QueryAsync(
                It.Is<CourseQuery>(q =>
                    q.Keyword == "azure" && q.PartnerPkid == 5 && q.CourseGroupPkid == 3 &&
                    q.PublishStatusPkid == 1 && q.CanRepeat == true &&
                    q.ScheduleOnFrom == new DateOnly(2026, 1, 1) &&
                    q.ScheduleOnTo == new DateOnly(2026, 12, 31) &&
                    q.ScheduleOffFrom == new DateOnly(2030, 1, 1) &&
                    q.ScheduleOffTo == new DateOnly(2040, 12, 31)),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample(1) });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<Course>>(ok.Value));
        _repository.VerifyAll();
    }

    // ----- View -----

    [Fact]
    public async Task GetById_WhenFound_ReturnsOkWithNnPkidLists()
    {
        _repository.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(Sample(1));

        var result = await _controller.GetById(1, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var course = Assert.IsType<Course>(ok.Value);
        Assert.Equal(new List<int> { 10, 11 }, course.CertificationPkids);
        Assert.Equal(new List<short> { 7 }, course.JobCategoryPkids);
    }

    [Fact]
    public async Task GetById_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((Course?)null);

        var result = await _controller.GetById(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    // ----- Add -----

    [Fact]
    public async Task Create_ReturnsCreatedAtActionWithNewPkid()
    {
        var request = SampleRequest();
        _repository.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(Sample(7));

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(CoursesController.GetById), created.ActionName);
        Assert.Equal(7, created.RouteValues!["id"]);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Create_AcceptsNullCourseGroup()
    {
        // CourseGroup_pkid is the one nullable FK — a course need not belong to a group.
        var request = SampleRequest();
        request.CourseGroupPkid = null;
        _repository.Setup(r => r.CreateAsync(It.Is<CourseRequest>(c => c.CourseGroupPkid == null),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample(8));

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<CreatedAtActionResult>(result.Result);
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
    public async Task Delete_WhenUnblocked_ReturnsNoContent()
    {
        _repository.Setup(r => r.DeleteAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CourseDeleteResult(Deleted: true, NotFound: false, default));

        var result = await _controller.Delete(1, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Delete_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.DeleteAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CourseDeleteResult(Deleted: false, NotFound: true, default));

        var result = await _controller.Delete(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_WhenChildRowsBlock_ReturnsConflictNamingEachChild()
    {
        // No FK to Course cascades — FAQ/link/hot-course rows must block rather than be
        // destroyed, and the message has to say which ones.
        _repository.Setup(r => r.DeleteAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CourseDeleteResult(
                Deleted: false, NotFound: false,
                new CourseDeleteBlockers(FaqCount: 3, RelatedLinkCount: 0, HotCourseCount: 2)));

        var result = await _controller.Delete(1, CancellationToken.None);

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        var message = conflict.Value!.GetType().GetProperty("message")!.GetValue(conflict.Value) as string;
        Assert.Contains("3 筆常見問題", message);
        Assert.Contains("2 筆熱門課程", message);
        // Zero-count children are omitted from the message.
        Assert.DoesNotContain("相關連結", message);
    }

    [Fact]
    public void CourseDeleteBlockers_AnyIsFalseOnlyWhenAllZero()
    {
        Assert.False(new CourseDeleteBlockers(0, 0, 0).Any);
        Assert.True(new CourseDeleteBlockers(1, 0, 0).Any);
        Assert.True(new CourseDeleteBlockers(0, 1, 0).Any);
        Assert.True(new CourseDeleteBlockers(0, 0, 1).Any);
    }
}
