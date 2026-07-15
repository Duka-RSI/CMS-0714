using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/course-groups")]
public class CourseGroupsController : ControllerBase
{
    private readonly ICourseGroupRepository _repository;

    public CourseGroupsController(ICourseGroupRepository repository)
    {
        _repository = repository;
    }

    /// <summary>List all course groups.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<CourseGroup>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _repository.GetAllAsync(cancellationToken));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<CourseGroup>>> Query([FromBody] CourseGroupQuery query, CancellationToken cancellationToken)
        => Ok(await _repository.QueryAsync(query, cancellationToken));

    /// <summary>Get a single course group by its pkid.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<CourseGroup>> GetById(short id, CancellationToken cancellationToken)
    {
        var courseGroup = await _repository.GetByIdAsync(id, cancellationToken);
        return courseGroup is null ? NotFound() : Ok(courseGroup);
    }

    /// <summary>Create a new course group. pkid is IDENTITY (server-assigned).</summary>
    [HttpPost]
    public async Task<ActionResult<CourseGroup>> Create([FromBody] CourseGroupRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var created = await _repository.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    /// <summary>Update an existing course group. pkid is taken from the body and is immutable.</summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] CourseGroupRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _repository.UpdateAsync(request, cancellationToken);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>Delete a course group by pkid.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(short id, CancellationToken cancellationToken)
    {
        var deleted = await _repository.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}
