using CMS.API.Models;
using CMS.API.Pdf;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using QuestPDF.Fluent;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/courses")]
public class CoursesController : ControllerBase
{
    private readonly ICourseRepository _repository;

    public CoursesController(ICourseRepository repository)
    {
        _repository = repository;
    }

    /// <summary>List all courses.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Course>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _repository.GetAllAsync(cancellationToken));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<Course>>> Query([FromBody] CourseQuery query, CancellationToken cancellationToken)
        => Ok(await _repository.QueryAsync(query, cancellationToken));

    /// <summary>Get a single course by pkid, including its certification and job-category ids.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<Course>> GetById(int id, CancellationToken cancellationToken)
    {
        var course = await _repository.GetByIdAsync(id, cancellationToken);
        return course is null ? NotFound() : Ok(course);
    }

    /// <summary>Create a new course. pkid is IDENTITY (server-assigned).</summary>
    [HttpPost]
    public async Task<ActionResult<Course>> Create([FromBody] CourseRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var created = await _repository.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    /// <summary>Update an existing course. pkid is taken from the body and is immutable.</summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] CourseRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _repository.UpdateAsync(request, cancellationToken);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>
    /// Delete a course by pkid. Returns 409 when CourseFAQ / CourseRelatedLink / HotCourse
    /// rows still reference it — no FK to Course cascades, and those children hold real
    /// content, so they are never destroyed implicitly.
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var result = await _repository.DeleteAsync(id, cancellationToken);

        if (result.NotFound)
        {
            return NotFound();
        }

        if (result.Blockers.Any)
        {
            var parts = new List<string>();
            if (result.Blockers.FaqCount > 0)
            {
                parts.Add($"{result.Blockers.FaqCount} 筆常見問題");
            }
            if (result.Blockers.RelatedLinkCount > 0)
            {
                parts.Add($"{result.Blockers.RelatedLinkCount} 筆相關連結");
            }
            if (result.Blockers.HotCourseCount > 0)
            {
                parts.Add($"{result.Blockers.HotCourseCount} 筆熱門課程");
            }

            return Conflict(new { message = $"該課程仍被 {string.Join("、", parts)} 引用，無法刪除。" });
        }

        return result.Deleted ? NoContent() : NotFound();
    }

    /// <summary>
    /// The selected courses merged into one PDF, one course per page, in the list's order.
    /// </summary>
    /// <remarks>
    /// Read-only: nothing is written, so there is no RowAudit row. Reachable by any logged-in
    /// caller, matching the Course endpoints it draws from.
    /// </remarks>
    [HttpPost("pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> ExportPdf(
        [FromBody] CoursePdfRequest request,
        [FromServices] TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        // Duplicate ids would print the same course twice; the SQL IN would not catch it.
        var pkids = request.Pkids.Distinct().ToList();
        var courses = await _repository.GetForExportAsync(pkids, cancellationToken);

        if (courses.Count == 0)
        {
            // Authenticated caller, wrong value -> 400, never 401 (the NG app reads 401 as a
            // session expiry). Reached when every selected course was deleted meanwhile.
            return ValidationProblem("找不到選取的課程，可能已被刪除。");
        }

        // Local time: the footer stamp is read by people in this office, not machines —
        // unlike RowAudit's DateTime, which is stored UTC and re-stamped by the client.
        var generatedAt = timeProvider.GetLocalNow().DateTime;
        var bytes = new CoursePdfDocument(courses, generatedAt).GeneratePdf();

        return File(bytes, "application/pdf", BuildFileName(courses, generatedAt));
    }

    /// <summary>
    /// A single course exports under its own CourseId; a merged one is stamped with its count
    /// and the time, so two exports never collide in the downloads folder.
    /// </summary>
    private static string BuildFileName(IReadOnlyList<CourseExport> courses, DateTime generatedAt)
    {
        var stamp = generatedAt.ToString("yyyyMMdd-HHmm");

        if (courses.Count == 1)
        {
            // CourseId is free text: strip what Windows and the Content-Disposition header
            // would each choke on rather than hand back a filename the browser discards.
            var safe = string.Concat(courses[0].Course.CourseId
                .Where(c => !Path.GetInvalidFileNameChars().Contains(c) && c != '"' && c != ';'))
                .Trim();

            if (safe.Length > 0)
            {
                return $"{safe}-{stamp}.pdf";
            }
        }

        return $"courses-{courses.Count}-{stamp}.pdf";
    }
}
