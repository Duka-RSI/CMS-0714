using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Pdf;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using QuestPDF.Infrastructure;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// The PDF export endpoint: which pkids reach the repository, what comes back, and what the
/// download is called. The document's own contents are covered by
/// <see cref="CoursePdfDocumentTests"/>; here the repository is mocked, so no database is
/// touched and the PDF is rendered from in-memory models.
/// </summary>
public class CoursesControllerPdfTests
{
    static CoursesControllerPdfTests()
    {
        // Program.cs declares this at startup; QuestPDF refuses to render without it.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    private readonly Mock<ICourseRepository> _repository = new(MockBehavior.Strict);
    private readonly CoursesController _controller;
    private readonly FixedTimeProvider _time = new();

    public CoursesControllerPdfTests()
    {
        // ValidationProblem() resolves a ProblemDetailsFactory off request services; a bare
        // controller has none.
        var services = new ServiceCollection();
        services.AddSingleton<ProblemDetailsFactory, TestProblemDetailsFactory>();

        _controller = new CoursesController(_repository.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() },
            },
        };
    }

    private sealed class TestProblemDetailsFactory : ProblemDetailsFactory
    {
        public override ProblemDetails CreateProblemDetails(HttpContext httpContext,
            int? statusCode = null, string? title = null, string? type = null,
            string? detail = null, string? instance = null)
            => new() { Status = statusCode ?? StatusCodes.Status500InternalServerError, Title = title, Detail = detail };

        public override ValidationProblemDetails CreateValidationProblemDetails(HttpContext httpContext,
            ModelStateDictionary modelStateDictionary, int? statusCode = null, string? title = null,
            string? type = null, string? detail = null, string? instance = null)
            => new(modelStateDictionary) { Status = statusCode ?? StatusCodes.Status400BadRequest, Title = title, Detail = detail };
    }

    /// <summary>
    /// A clock the test drives, mirroring the one in RowAuditWriterTests. LocalTimeZone is
    /// pinned to UTC so the stamped filename is the same in any runner's timezone.
    /// </summary>
    private sealed class FixedTimeProvider : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 7, 16, 14, 30, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => Now;
        public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;
    }

    private static Course NewCourse(int pkid = 1, string title = "雲端課程", string courseId = "AZ-305") => new()
    {
        Pkid = pkid,
        Title = title,
        CourseId = courseId,
        ProdCourseId = "P-1",
        FriendlyUrl = "u",
        ScheduleOn = new DateOnly(2026, 1, 1),
        ScheduleOff = new DateOnly(2026, 12, 31),
        PartnerName = "微軟",
        PublishStatusDescription = "已上架",
    };

    private static CourseExport NewExport(Course course) => new() { Course = course };

    private void SetupExport(int[] requested, params CourseExport[] returned)
        => _repository
            .Setup(r => r.GetForExportAsync(
                It.Is<IReadOnlyCollection<int>>(p => p.SequenceEqual(requested)),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(returned);

    private Task<IActionResult> Export(params int[] pkids)
        => _controller.ExportPdf(new CoursePdfRequest { Pkids = [.. pkids] }, _time, CancellationToken.None);

    // ----- The happy path -----

    [Fact]
    public async Task ExportPdf_ReturnsAPdfFile()
    {
        SetupExport([1], NewExport(NewCourse()));

        var result = await Export(1);

        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("application/pdf", file.ContentType);
        // A real PDF, not an empty body: every PDF starts with %PDF.
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(file.FileContents[..4]));
    }

    [Fact]
    public async Task ExportPdf_ForwardsTheSelectedPkids()
    {
        SetupExport([3, 1, 2], NewExport(NewCourse(3)), NewExport(NewCourse(1)), NewExport(NewCourse(2)));

        await Export(3, 1, 2);

        // Order is not re-sorted here — the repository orders by the list's own DisplayOrder.
        _repository.Verify(r => r.GetForExportAsync(
            It.Is<IReadOnlyCollection<int>>(p => p.SequenceEqual(new[] { 3, 1, 2 })),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExportPdf_DeduplicatesPkids()
    {
        // A duplicate would print the same course twice; SQL's IN would not notice.
        SetupExport([1, 2], NewExport(NewCourse(1)), NewExport(NewCourse(2)));

        await Export(1, 2, 1, 2, 1);

        _repository.Verify(r => r.GetForExportAsync(
            It.Is<IReadOnlyCollection<int>>(p => p.SequenceEqual(new[] { 1, 2 })),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExportPdf_MergesEverySelectedCourse()
    {
        SetupExport([1, 2, 3],
            NewExport(NewCourse(1, "甲")), NewExport(NewCourse(2, "乙")), NewExport(NewCourse(3, "丙")));

        var result = await Export(1, 2, 3);

        var file = Assert.IsType<FileContentResult>(result);
        using var document = UglyToad.PdfPig.PdfDocument.Open(new MemoryStream(file.FileContents));
        Assert.Equal(3, document.NumberOfPages);
    }

    // ----- Failure paths -----

    [Fact]
    public async Task ExportPdf_WhenEverySelectedCourseIsGone_Returns400_NotAnEmptyPdf()
    {
        // Reached when the rows were deleted between the list loading and the export.
        SetupExport([9]);

        var result = await Export(9);

        // 400, never 401: the caller is authenticated and merely named stale rows, and the
        // NG app signs the user out on any 401.
        var problem = Assert.IsAssignableFrom<ObjectResult>(result);
        Assert.IsType<ValidationProblemDetails>(problem.Value);
    }

    [Fact]
    public async Task ExportPdf_WithAnInvalidModel_Returns400_AndNeverQueries()
    {
        // Strict mock with no Setup: a repository call would throw, proving we short-circuit.
        _controller.ModelState.AddModelError(nameof(CoursePdfRequest.Pkids), "請至少選擇一門課程。");

        var result = await _controller.ExportPdf(new CoursePdfRequest(), _time, CancellationToken.None);

        var problem = Assert.IsAssignableFrom<ObjectResult>(result);
        Assert.IsType<ValidationProblemDetails>(problem.Value);
        _repository.Verify(r => r.GetForExportAsync(
            It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ----- The download's name -----

    [Fact]
    public async Task ExportPdf_OfOneCourse_IsNamedAfterItsCourseId()
    {
        SetupExport([1], NewExport(NewCourse(courseId: "AZ-305")));

        var result = await Export(1);

        Assert.Equal("AZ-305-20260716-1430.pdf", Assert.IsType<FileContentResult>(result).FileDownloadName);
    }

    [Fact]
    public async Task ExportPdf_OfManyCourses_IsNamedAfterTheirCount()
    {
        SetupExport([1, 2], NewExport(NewCourse(1)), NewExport(NewCourse(2)));

        var result = await Export(1, 2);

        Assert.Equal("courses-2-20260716-1430.pdf", Assert.IsType<FileContentResult>(result).FileDownloadName);
    }

    [Theory]
    [InlineData("AZ/305", "AZ305")]
    [InlineData("AZ:305*?", "AZ305")]
    [InlineData("A\"B;C", "ABC")]
    public async Task ExportPdf_StripsWhatAFilenameCannotCarry(string courseId, string expectedStem)
    {
        // CourseId is free text in the DB; a slash or a quote would produce a name the
        // browser discards, or break the Content-Disposition header.
        SetupExport([1], NewExport(NewCourse(courseId: courseId)));

        var result = await Export(1);

        Assert.Equal($"{expectedStem}-20260716-1430.pdf", Assert.IsType<FileContentResult>(result).FileDownloadName);
    }

    [Fact]
    public async Task ExportPdf_WhenTheCourseIdIsAllPunctuation_FallsBackToTheCountName()
    {
        SetupExport([1], NewExport(NewCourse(courseId: "///")));

        var result = await Export(1);

        // Stripping left nothing to name the file after, so do not emit "-20260716-1430.pdf".
        Assert.Equal("courses-1-20260716-1430.pdf", Assert.IsType<FileContentResult>(result).FileDownloadName);
    }

    [Fact]
    public async Task ExportPdf_StampsTheFilenameFromTheInjectedClock()
    {
        _time.Now = new DateTimeOffset(2027, 1, 2, 3, 4, 0, TimeSpan.Zero);
        SetupExport([1, 2], NewExport(NewCourse(1)), NewExport(NewCourse(2)));

        var result = await Export(1, 2);

        // Two exports a minute apart must not collide in the downloads folder.
        Assert.Equal("courses-2-20270102-0304.pdf", Assert.IsType<FileContentResult>(result).FileDownloadName);
    }
}
