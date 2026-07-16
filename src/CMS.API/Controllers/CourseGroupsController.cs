using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

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

    /// <summary>Get a single course group by pkid.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<CourseGroup>> GetById(short id, CancellationToken cancellationToken)
    {
        var group = await _repository.GetByIdAsync(id, cancellationToken);
        return group is null ? NotFound() : Ok(group);
    }

    /// <summary>Create a new course group.</summary>
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

    /// <summary>Update an existing course group. Pkid is taken from the body.</summary>
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

    /// <summary>
    /// Delete a course group by pkid. Courses in the group are cascade-deleted (schema FK);
    /// returns 409 when PartnerCourseGroup rows still reference the group (FK without cascade).
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(short id, CancellationToken cancellationToken)
    {
        try
        {
            var deleted = await _repository.DeleteAsync(id, cancellationToken);
            return deleted ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return Conflict(new { message = "該群組仍被廠商課程群組引用，無法刪除。" });
        }
    }
}
