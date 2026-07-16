namespace CMS.API.Pdf;

/// <summary>
/// The font the course PDF is typeset in.
/// </summary>
/// <remarks>
/// <para>
/// ⚠️ <b>Do not "upgrade" this to 微軟正黑體 (Microsoft JhengHei).</b> It renders beautifully
/// and then silently corrupts the text layer: every character that also exists in Unicode's
/// Kangxi Radicals block — 大 一 二 小 人 工 月 日 目 田 力 口, i.e. some of the most common
/// characters there are — is written into the PDF's ToUnicode map as the <em>radical</em>
/// codepoint (大 U+5927 becomes ⼤ U+2F24). The page looks perfect; copying "課程大綱" out of
/// it yields "課程⼤綱", and Ctrl+F for 大 finds nothing — which defeats the point of typesetting
/// text instead of screenshotting the page. Noto Sans TC has the same defect (13 characters
/// drifted in the same sample); 新細明體 and 標楷體 round-trip byte-exactly.
/// </para>
/// <para>
/// Measured, not assumed: <c>CoursePdfDocumentTests</c> renders a PDF and extracts its text
/// back, so a regression here fails a test rather than shipping unreadable documents.
/// </para>
/// </remarks>
public static class PdfFonts
{
    /// <summary>新細明體 — ships with every Windows install and is the standard document face here.</summary>
    public const string Family = "PMingLiU";

    /// <summary>The file <see cref="Family"/> lives in, under the OS font directory.</summary>
    private const string FamilyFile = "mingliu.ttc";

    /// <summary>
    /// Warns when the host has no <see cref="Family"/> installed. QuestPDF resolves fonts by
    /// family name and falls back silently when one is missing, so on a host without it —
    /// a Linux container, say — every export would come out with blank Chinese and no error.
    /// Call once at startup: this is a heads-up for whoever deploys, not a per-request check.
    /// </summary>
    /// <returns>True when the font is present (always so on Windows).</returns>
    public static bool Verify(ILogger logger)
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Fonts), FamilyFile);

        if (File.Exists(path))
        {
            logger.LogInformation("Course PDF is typeset in {Family}.", Family);
            return true;
        }

        logger.LogWarning(
            "{Family} ({File}) is not installed on this host, so the course PDF's Chinese will " +
            "render blank. Install it, or pick another face that round-trips Traditional Chinese " +
            "— note that Microsoft JhengHei and Noto Sans TC do not (see PdfFonts).",
            Family, FamilyFile);
        return false;
    }
}
