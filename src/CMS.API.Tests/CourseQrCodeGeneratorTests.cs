using CMS.API.Pdf;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// The PDF's QR code. The URL format is duplicated across the stack — the Angular detail
/// page owns the same rule in <c>course-qr-code.ts</c> — so these tests pin this half of it;
/// <c>course-qr-code.spec.ts</c> pins the other.
/// </summary>
public class CourseQrCodeGeneratorTests
{
    [Fact]
    public void BuildUrl_PointsAtThePublicCoursePage()
    {
        // Must stay identical to buildCourseQrUrl() in the NG app, or the printed QR and the
        // on-screen one send a scanner to different places.
        Assert.Equal("https://www.uuu.com.tw/Course/Show/12/AZ-104", CourseQrCodeGenerator.BuildUrl(12, "AZ-104"));
    }

    [Theory]
    [InlineData("AZ 104", "AZ%20104")]
    [InlineData("AZ/104", "AZ%2F104")]
    [InlineData("雲端", "%E9%9B%B2%E7%AB%AF")]
    public void BuildUrl_EscapesTheCourseId(string courseId, string expected)
    {
        // CourseId is free text in the DB: a space or slash would otherwise break the URL.
        Assert.Equal($"https://www.uuu.com.tw/Course/Show/1/{expected}", CourseQrCodeGenerator.BuildUrl(1, courseId));
    }

    [Fact]
    public void TryRender_ProducesAPng()
    {
        var png = CourseQrCodeGenerator.TryRender(1, "AZ-104");

        Assert.NotNull(png);
        // PNG magic number — proof it is an image, not an empty buffer.
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47 }, png![..4]);
    }

    [Fact]
    public void TryRender_IsDeterministic()
    {
        // Same course, same image: an export re-run must not churn.
        Assert.Equal(CourseQrCodeGenerator.TryRender(1, "AZ-104"), CourseQrCodeGenerator.TryRender(1, "AZ-104"));
    }

    [Fact]
    public void TryRender_DiffersPerCourse()
    {
        Assert.NotEqual(CourseQrCodeGenerator.TryRender(1, "AZ-104"), CourseQrCodeGenerator.TryRender(2, "AZ-104"));
    }

    [Fact]
    public void TryRender_HandlesAnEmptyCourseId_WithoutThrowing()
    {
        // A course whose QR cannot be built must still get its page — the caller treats a
        // null as "no QR", never as a failed export.
        var png = CourseQrCodeGenerator.TryRender(1, string.Empty);

        Assert.NotNull(png);
    }
}
