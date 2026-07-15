using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/lookups")]
public class LookupsController : ControllerBase
{
    private readonly ILookupRepository _repository;

    public LookupsController(ILookupRepository repository)
    {
        _repository = repository;
    }

    /// <summary>Slim AppUser list for the AppRole "使用者" multiselect.</summary>
    [HttpGet("app-users")]
    public async Task<ActionResult<IEnumerable<AppUserLookup>>> GetAppUsers(CancellationToken cancellationToken)
        => Ok(await _repository.GetAppUsersAsync(cancellationToken));

    /// <summary>Slim AppRole list for the AppUser "角色" multiselect.</summary>
    [HttpGet("app-roles")]
    public async Task<ActionResult<IEnumerable<AppRoleLookup>>> GetAppRoles(CancellationToken cancellationToken)
        => Ok(await _repository.GetAppRolesAsync(cancellationToken));

    /// <summary>Slim PublishStatus list for Course/Promotion FK dropdowns.</summary>
    [HttpGet("publish-statuses")]
    public async Task<ActionResult<IEnumerable<PublishStatusLookup>>> GetPublishStatuses(CancellationToken cancellationToken)
        => Ok(await _repository.GetPublishStatusesAsync(cancellationToken));

    /// <summary>Slim Partner list for Course/Certification/PartnerCourseGroup FK dropdowns.</summary>
    [HttpGet("partners")]
    public async Task<ActionResult<IEnumerable<PartnerLookup>>> GetPartners(CancellationToken cancellationToken)
        => Ok(await _repository.GetPartnersAsync(cancellationToken));

    /// <summary>Slim CourseGroup list for Course/PartnerCourseGroup FK dropdowns.</summary>
    [HttpGet("course-groups")]
    public async Task<ActionResult<IEnumerable<CourseGroupLookup>>> GetCourseGroups(CancellationToken cancellationToken)
        => Ok(await _repository.GetCourseGroupsAsync(cancellationToken));

    /// <summary>Slim TrainingCenter list for the FeaturedPromoItem board's tab strip.</summary>
    [HttpGet("training-centers")]
    public async Task<ActionResult<IEnumerable<TrainingCenterLookup>>> GetTrainingCenters(CancellationToken cancellationToken)
        => Ok(await _repository.GetTrainingCentersAsync(cancellationToken));

    /// <summary>
    /// Promotion2 rows matching a PromoCode fragment — backs the FeaturedPromoItem form's
    /// PromoCode autocomplete. Carries Topic/Description so picking a code can prefill them.
    /// </summary>
    [HttpGet("promotions")]
    public async Task<ActionResult<IEnumerable<PromotionLookup>>> GetPromotions(
        [FromQuery] string? keyword, CancellationToken cancellationToken)
        => Ok(await _repository.GetPromotionsAsync(keyword, cancellationToken));
}
