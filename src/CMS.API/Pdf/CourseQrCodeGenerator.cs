using QRCoder;

namespace CMS.API.Pdf;

/// <summary>
/// The QR code the course PDF prints, matching the one the detail page shows.
/// </summary>
/// <remarks>
/// The Angular side owns the same two rules in
/// <c>features/courses/course-qr-code/course-qr-code.ts</c> (<c>COURSE_QR_BASE_URL</c> and
/// <c>buildCourseQrUrl</c>). They are duplicated rather than shared because the PDF is built
/// server-side and nothing crosses that boundary — so a change to the public course URL has
/// to be made in both places, and <c>CourseQrCodeGeneratorTests</c> pins the format here.
/// </remarks>
public static class CourseQrCodeGenerator
{
    /// <summary>Public course page the QR code points at. Mirrors COURSE_QR_BASE_URL in the NG app.</summary>
    public const string BaseUrl = "https://www.uuu.com.tw/Course/Show";

    /// <summary>
    /// The public course URL a QR encodes.
    /// </summary>
    /// <remarks>
    /// CourseId is escaped because it is free text in the DB: a value with a space or slash
    /// would otherwise produce a broken URL. Ordinary ids like <c>AZ-104</c> are unaffected.
    /// </remarks>
    public static string BuildUrl(int pkid, string courseId)
        => $"{BaseUrl}/{pkid}/{Uri.EscapeDataString(courseId)}";

    /// <summary>
    /// The QR for a course as PNG bytes, or null if it could not be produced — a course
    /// whose QR fails must still get its page, so callers treat this as optional.
    /// </summary>
    /// <param name="pixelsPerModule">
    /// Size of one QR "pixel". 8 keeps the printed code comfortably scannable at the ~28mm
    /// the layout gives it, without inflating the PDF.
    /// </param>
    public static byte[]? TryRender(int pkid, string courseId, int pixelsPerModule = 8)
    {
        try
        {
            // ECC level M matches the detail page's errorCorrectionLevel: 'M'.
            using var generator = new QRCodeGenerator();
            using var data = generator.CreateQrCode(BuildUrl(pkid, courseId), QRCodeGenerator.ECCLevel.M);
            using var png = new PngByteQRCode(data);
            return png.GetGraphic(pixelsPerModule);
        }
        catch
        {
            return null;
        }
    }
}
