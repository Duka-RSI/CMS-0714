using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the FeaturedPromoItem board covering the one-week
/// ScheduleOn filter, the TrainingCenter tab filter, add/edit/delete, the slot
/// move (+/−) endpoint and the UNIQUE-slot 409 path. The repository is mocked so
/// these run without a database. pkid is an int IDENTITY.
/// </summary>
public class FeaturedPromoItemsControllerTests
{
    private readonly Mock<IFeaturedPromoItemRepository> _repository = new(MockBehavior.Strict);
    private readonly FeaturedPromoItemsController _controller;

    // 2026-03-16 is the Monday of the week the spec's mockups show (3/16 – 3/22).
    private static readonly DateOnly Monday = new(2026, 3, 16);
    private static readonly DateOnly Sunday = new(2026, 3, 22);

    public FeaturedPromoItemsControllerTests()
    {
        _controller = new FeaturedPromoItemsController(_repository.Object);
    }

    private static FeaturedPromoItem Sample(int pkid = 1, byte slot = 1) => new()
    {
        Pkid = pkid,
        ScheduleOn = Monday,
        TrainingCenterPkid = 1,
        Slot = slot,
        PromotionPkid = 100,
        Topic = "成為能AI協作的程式設計師",
        Description = "轉職就業養成班，三大主流語言任你選",
        PromoCode = "20251204_SkillTrainAI"
    };

    private static FeaturedPromoItemRequest SampleRequest(int pkid = 0, byte slot = 1) => new()
    {
        Pkid = pkid,
        ScheduleOn = Monday,
        TrainingCenterPkid = 1,
        Slot = slot,
        PromotionPkid = 100,
        Topic = "成為能AI協作的程式設計師",
        Description = "轉職就業養成班，三大主流語言任你選"
    };

    // ----- List -----

    [Fact]
    public async Task GetAll_ReturnsOkWithAllItems()
    {
        _repository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample(1, 1), Sample(2, 2) });

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<FeaturedPromoItem>>(ok.Value);
        Assert.Equal(2, payload.Count());
    }

    // ----- One-week ScheduleOn filter -----

    [Fact]
    public async Task Query_SnapsWeekStartBackToMonday()
    {
        // The board sends whatever day it is showing; the controller must snap to Monday
        // so the repository always filters a clean Monday–Sunday span.
        var query = new FeaturedPromoItemQuery { WeekStart = new DateOnly(2026, 3, 19), TrainingCenterPkid = 1 };
        _repository.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q => q.WeekStart == Monday), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample() });

        var result = await _controller.Query(query, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Query_WhenGivenSunday_SnapsBackToTheMondayThatStartsThatWeek()
    {
        // Sunday is the END of the spec's Monday–Sunday week, not the start of a new one.
        var query = new FeaturedPromoItemQuery { WeekStart = Sunday };
        _repository.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q => q.WeekStart == Monday), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<FeaturedPromoItem>());

        await _controller.Query(query, CancellationToken.None);

        _repository.VerifyAll();
    }

    [Fact]
    public async Task Query_WhenAlreadyMonday_LeavesWeekStartUntouched()
    {
        var query = new FeaturedPromoItemQuery { WeekStart = Monday };
        _repository.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q => q.WeekStart == Monday), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<FeaturedPromoItem>());

        await _controller.Query(query, CancellationToken.None);

        _repository.VerifyAll();
    }

    [Theory]
    [InlineData(2026, 3, 16)] // Monday
    [InlineData(2026, 3, 17)] // Tuesday
    [InlineData(2026, 3, 18)] // Wednesday
    [InlineData(2026, 3, 19)] // Thursday
    [InlineData(2026, 3, 20)] // Friday
    [InlineData(2026, 3, 21)] // Saturday
    [InlineData(2026, 3, 22)] // Sunday
    public void MondayOf_MapsEveryDayOfTheWeekToTheSameMonday(int year, int month, int day)
    {
        Assert.Equal(Monday, FeaturedPromoItemQuery.MondayOf(new DateOnly(year, month, day)));
    }

    [Fact]
    public void MondayOf_MapsTheDayAfterSundayToTheNextMonday()
    {
        // 3/23 starts the following week — it must not fold back into 3/16.
        Assert.Equal(new DateOnly(2026, 3, 23), FeaturedPromoItemQuery.MondayOf(new DateOnly(2026, 3, 23)));
    }

    // ----- TrainingCenter filter -----

    [Fact]
    public async Task Query_PassesTrainingCenterPkidToRepository()
    {
        var query = new FeaturedPromoItemQuery { WeekStart = Monday, TrainingCenterPkid = 3 };
        _repository.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q => q.TrainingCenterPkid == 3), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample() });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<FeaturedPromoItem>>(ok.Value));
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Query_WithNoTrainingCenter_PassesNullThroughForAllCentres()
    {
        var query = new FeaturedPromoItemQuery { WeekStart = Monday, TrainingCenterPkid = null };
        _repository.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q => q.TrainingCenterPkid == null), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample() });

        await _controller.Query(query, CancellationToken.None);

        _repository.VerifyAll();
    }

    // ----- View -----

    [Fact]
    public async Task GetById_WhenFound_ReturnsOkWithItem()
    {
        _repository.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(Sample(1));

        var result = await _controller.GetById(1, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var item = Assert.IsType<FeaturedPromoItem>(ok.Value);
        Assert.Equal("20251204_SkillTrainAI", item.PromoCode);
    }

    [Fact]
    public async Task GetById_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((FeaturedPromoItem?)null);

        var result = await _controller.GetById(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    // ----- Add -----

    [Fact]
    public async Task Create_WhenSlotFree_ReturnsCreatedAtActionWithNewPkid()
    {
        var request = SampleRequest();
        _repository.Setup(r => r.SlotTakenAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repository.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(Sample(7));

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(FeaturedPromoItemsController.GetById), created.ActionName);
        Assert.Equal(7, created.RouteValues!["id"]);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Create_WhenSlotAlreadyTaken_ReturnsConflictAndDoesNotInsert()
    {
        // Guards IX_FeaturedPromoItem_UniqueDateLocSlot.
        var request = SampleRequest();
        _repository.Setup(r => r.SlotTakenAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result.Result);
        _repository.Verify(r => r.CreateAsync(It.IsAny<FeaturedPromoItemRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ----- Edit -----

    [Fact]
    public async Task Update_WhenExisting_ReturnsNoContent()
    {
        var request = SampleRequest(1);
        _repository.Setup(r => r.SlotTakenAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Update_WhenMissing_ReturnsNotFound()
    {
        var request = SampleRequest(99);
        _repository.Setup(r => r.SlotTakenAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repository.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Update_WhenTargetSlotHeldByAnotherRow_ReturnsConflict()
    {
        var request = SampleRequest(1);
        _repository.Setup(r => r.SlotTakenAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result);
        _repository.Verify(r => r.UpdateAsync(It.IsAny<FeaturedPromoItemRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ----- Slot move (+ / −) -----

    [Fact]
    public async Task MoveSlot_WhenRowExists_ReturnsNoContent()
    {
        var request = new SlotMoveRequest { Pkid = 1, TargetSlot = 2 };
        _repository.Setup(r => r.MoveSlotAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.MoveSlot(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task MoveSlot_WhenRowMissing_ReturnsNotFound()
    {
        var request = new SlotMoveRequest { Pkid = 99, TargetSlot = 2 };
        _repository.Setup(r => r.MoveSlotAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.MoveSlot(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    // ----- Delete -----

    [Fact]
    public async Task Delete_WhenExisting_ReturnsNoContent()
    {
        _repository.Setup(r => r.DeleteAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete(1, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task Delete_WhenMissing_ReturnsNotFound()
    {
        _repository.Setup(r => r.DeleteAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }
}
