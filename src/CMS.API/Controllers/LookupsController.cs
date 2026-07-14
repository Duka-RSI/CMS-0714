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

    /// <summary>Slim PublishStatus list for Course/Promotion FK dropdowns.</summary>
    [HttpGet("publish-statuses")]
    public async Task<ActionResult<IEnumerable<PublishStatusLookup>>> GetPublishStatuses(CancellationToken cancellationToken)
        => Ok(await _repository.GetPublishStatusesAsync(cancellationToken));

    /// <summary>Slim Partner list for Course/Certification/PartnerCourseGroup FK dropdowns.</summary>
    [HttpGet("partners")]
    public async Task<ActionResult<IEnumerable<PartnerLookup>>> GetPartners(CancellationToken cancellationToken)
        => Ok(await _repository.GetPartnersAsync(cancellationToken));
}
