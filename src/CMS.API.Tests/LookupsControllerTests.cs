using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the lookup endpoints the FeaturedPromoItem board depends
/// on: the TrainingCenter tab strip and the PromoCode autocomplete. The repository is
/// mocked so these run without a database.
/// </summary>
public class LookupsControllerTests
{
    private readonly Mock<ILookupRepository> _repository = new(MockBehavior.Strict);
    private readonly LookupsController _controller;

    public LookupsControllerTests()
    {
        _controller = new LookupsController(_repository.Object);
    }

    private static PromotionLookup Promo(int pkid, string code) => new()
    {
        Pkid = pkid,
        PromoCode = code,
        Topic = "成為能AI協作的程式設計師",
        Description = "轉職就業養成班，三大主流語言任你選"
    };

    // ----- TrainingCenter tab strip -----

    [Fact]
    public async Task GetTrainingCenters_ReturnsOkWithEveryCentre()
    {
        var centres = new[]
        {
            new TrainingCenterLookup { Pkid = 1, Name = "台北" },
            new TrainingCenterLookup { Pkid = 2, Name = "新竹" },
            new TrainingCenterLookup { Pkid = 3, Name = "台中" }
        };
        _repository.Setup(r => r.GetTrainingCentersAsync(It.IsAny<CancellationToken>())).ReturnsAsync(centres);

        var result = await _controller.GetTrainingCenters(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<TrainingCenterLookup>>(ok.Value);
        Assert.Equal(3, payload.Count());
        Assert.Equal("台北", payload.First().Name);
        _repository.VerifyAll();
    }

    // ----- PromoCode lookup -----

    [Fact]
    public async Task GetPromotions_PassesKeywordToRepository_AndReturnsMatches()
    {
        _repository.Setup(r => r.GetPromotionsAsync("SkillTrain", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Promo(100, "20251204_SkillTrainAI") });

        var result = await _controller.GetPromotions("SkillTrain", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<PromotionLookup>>(ok.Value);
        Assert.Equal("20251204_SkillTrainAI", Assert.Single(payload).PromoCode);
        _repository.VerifyAll();
    }

    [Fact]
    public async Task GetPromotions_CarriesTopicAndDescription_SoThePickCanPrefillTheForm()
    {
        _repository.Setup(r => r.GetPromotionsAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Promo(100, "20251204_SkillTrainAI") });

        var result = await _controller.GetPromotions("20251204", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var match = Assert.Single(Assert.IsAssignableFrom<IEnumerable<PromotionLookup>>(ok.Value));
        Assert.Equal(100, match.Pkid);
        Assert.Equal("成為能AI協作的程式設計師", match.Topic);
        Assert.Equal("轉職就業養成班，三大主流語言任你選", match.Description);
    }

    [Fact]
    public async Task GetPromotions_WithNoKeyword_PassesNullThrough()
    {
        _repository.Setup(r => r.GetPromotionsAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Promo(100, "20251204_SkillTrainAI"), Promo(101, "251211_GoogleAI") });

        var result = await _controller.GetPromotions(null, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(2, Assert.IsAssignableFrom<IEnumerable<PromotionLookup>>(ok.Value).Count());
        _repository.VerifyAll();
    }

    [Fact]
    public async Task GetPromotions_WhenNothingMatches_ReturnsOkWithEmptyList()
    {
        _repository.Setup(r => r.GetPromotionsAsync("nope", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<PromotionLookup>());

        var result = await _controller.GetPromotions("nope", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Empty(Assert.IsAssignableFrom<IEnumerable<PromotionLookup>>(ok.Value));
    }
}
