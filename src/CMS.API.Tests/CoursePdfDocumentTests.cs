using System.Text;
using CMS.API.Models;
using CMS.API.Pdf;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using UglyToad.PdfPig;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// The course PDF, checked by reading the document back rather than by trusting that it
/// rendered.
/// </summary>
/// <remarks>
/// The whole point of this export is that it is typeset text, not a screenshot: extracting
/// the text layer with PdfPig is what proves that, and it is the only thing that can catch
/// the font trap described in <see cref="PdfFonts"/> — where the page looks perfect and the
/// text underneath is quietly the wrong characters. These tests touch no database and no
/// host; they build a document from in-memory models.
/// </remarks>
public class CoursePdfDocumentTests
{
    static CoursePdfDocumentTests()
    {
        // Program.cs does this at startup; a test that renders without a host must too.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    private static readonly DateTime GeneratedAt = new(2026, 7, 16, 14, 30, 0);

    private static Course NewCourse(int pkid = 1, string title = "雲端架構師認證課程") => new()
    {
        Pkid = pkid,
        Title = title,
        OfficialTitle = "Azure Solutions Architect",
        CourseId = "AZ-305",
        ProdCourseId = "P-AZ-305",
        FriendlyUrl = "azure-architect",
        DisplayOrder = 10,
        PartnerPkid = 1,
        CourseGroupPkid = 2,
        PublishStatusPkid = 1,
        ScheduleOn = new DateOnly(2026, 8, 1),
        ScheduleOff = new DateOnly(2026, 12, 31),
        Hour = 35,
        ListPrice = 48000m,
        LearningCredit = 3.5m,
        Material = "原廠教材",
        Objective = "培養雲端架構設計能力",
        Target = "系統工程師",
        Prerequisites = "具備基礎網路知識",
        Outline = "第一天：架構概論\n第二天：部署與監控",
        TowardCertOrExam = "AZ-305 認證考試",
        Note = "自備筆電",
        OtherInfo = "含午餐",
        CanRepeat = true,
        PartnerName = "微軟",
        CourseGroupDescription = "雲端課程",
        PublishStatusDescription = "已上架",
    };

    private static CourseExport NewExport(Course? course = null, string[]? certs = null, string[]? jobs = null) => new()
    {
        Course = course ?? NewCourse(),
        CertificationLabels = certs ?? ["Azure 架構師認證"],
        JobCategoryLabels = jobs ?? ["資訊技術"],
    };

    private static byte[] Render(params CourseExport[] courses)
        => new CoursePdfDocument(courses, GeneratedAt).GeneratePdf();

    /// <summary>Every page's text, concatenated.</summary>
    private static string TextOf(byte[] pdf)
    {
        using var document = PdfDocument.Open(new MemoryStream(pdf));
        return string.Join("\n", document.GetPages().Select(p => p.Text));
    }

    private static int PageCountOf(byte[] pdf)
    {
        using var document = PdfDocument.Open(new MemoryStream(pdf));
        return document.NumberOfPages;
    }

    // ----- It is text, not a picture of text -----

    [Fact]
    public void TheChineseSurvivesAsExtractableText_NotAnImage()
    {
        var pdf = Render(NewExport());

        var text = TextOf(pdf);

        // If this feature ever regressed to rasterising the page, the text layer would be
        // empty and every assertion below would fail — which is the point of asserting here.
        Assert.Contains("雲端架構師認證課程", text);
        Assert.Contains("培養雲端架構設計能力", text);
    }

    [Fact]
    public void TheKangxiRadicalTrap_DoesNotCorruptCommonCharacters()
    {
        // 大 一 二 小 人 工 月 日 目 田 力 口 all exist twice in Unicode: as ideographs and as
        // Kangxi radicals. Microsoft JhengHei and Noto Sans TC write the radical codepoint
        // into ToUnicode, so copying this line out of the PDF would silently hand back the
        // wrong characters. This is the test that fails if someone changes PdfFonts.Family.
        const string Trap = "課程大綱：一二三大小上下人工月日目田力口";
        var pdf = Render(NewExport(NewCourse(title: Trap)));

        var text = TextOf(pdf);

        Assert.Contains(Trap, text);
        // Belt and braces: name the radical block explicitly, so a failure reads as the trap
        // it is rather than as a mysterious mismatch.
        Assert.DoesNotContain(text, c => c is >= '⼀' and <= '⿟');
    }

    [Fact]
    public void LongTextKeepsItsLineBreaks()
    {
        var pdf = Render(NewExport());

        var text = TextOf(pdf);

        // The outline is stored with newlines and the detail page renders it in a <pre>;
        // both halves must survive into the document.
        Assert.Contains("第一天：架構概論", text);
        Assert.Contains("第二天：部署與監控", text);
    }

    // ----- The detail page's content is all there -----

    [Fact]
    public void EveryFieldTheDetailPageShows_IsInTheDocument()
    {
        var pdf = Render(NewExport());

        var text = TextOf(pdf);

        Assert.Contains("AZ-305", text);              // 簡介代碼
        Assert.Contains("P-AZ-305", text);            // 科目代碼
        Assert.Contains("azure-architect", text);     // 網址代稱
        Assert.Contains("微軟", text);                 // 原廠
        Assert.Contains("雲端課程", text);             // 課程群組
        Assert.Contains("已上架", text);               // 上架狀態
        Assert.Contains("2026/08/01", text);          // 上架日期
        Assert.Contains("2026/12/31", text);          // 下架日期
        Assert.Contains("48,000", text);              // 定價
        Assert.Contains("3.5", text);                 // 點數
        Assert.Contains("原廠教材", text);             // 教材
        Assert.Contains("系統工程師", text);           // 適合對象
        Assert.Contains("具備基礎網路知識", text);      // 先備知識
        Assert.Contains("AZ-305 認證考試", text);      // 對應認證/考試
        Assert.Contains("自備筆電", text);             // 備註
        Assert.Contains("含午餐", text);               // 其他資訊
    }

    [Fact]
    public void CertificationAndJobCategoryLabels_AreListed()
    {
        var pdf = Render(NewExport(certs: ["Azure 架構師認證", "資安認證"], jobs: ["資訊技術", "專案管理"]));

        var text = TextOf(pdf);

        Assert.Contains("Azure 架構師認證", text);
        Assert.Contains("資安認證", text);
        Assert.Contains("資訊技術", text);
        Assert.Contains("專案管理", text);
        // Counts mirror the detail page's section headings.
        Assert.Contains("認證（2）", text);
        Assert.Contains("職務類別（2）", text);
    }

    [Fact]
    public void ACourseWithNoCertifications_SaysSoRatherThanShowingAnEmptySection()
    {
        var pdf = Render(NewExport(certs: [], jobs: []));

        var text = TextOf(pdf);

        Assert.Contains("此課程目前沒有對應任何認證。", text);
        Assert.Contains("此課程目前沒有對應任何職務類別。", text);
    }

    [Fact]
    public void NullOptionalFields_RenderAsADash_NotAsBlanks()
    {
        var course = NewCourse();
        course.OfficialTitle = null;
        course.Material = null;
        course.Objective = null;
        course.CourseGroupDescription = null;

        var pdf = Render(NewExport(course));

        // A null field must not swallow its label — the reader still needs to see it was empty.
        var text = TextOf(pdf);
        Assert.Contains("教材", text);
        Assert.Contains("課程目標", text);
        Assert.Contains("—", text);
    }

    // ----- Merging -----

    [Fact]
    public void EachSelectedCourse_GetsItsOwnPage_InTheGivenOrder()
    {
        var pdf = Render(
            NewExport(NewCourse(1, "第一門課")),
            NewExport(NewCourse(2, "第二門課")),
            NewExport(NewCourse(3, "第三門課")));

        Assert.Equal(3, PageCountOf(pdf));

        using var document = PdfDocument.Open(new MemoryStream(pdf));
        var pages = document.GetPages().ToList();
        // Order is the caller's; the document must not re-sort.
        Assert.Contains("第一門課", pages[0].Text);
        Assert.Contains("第二門課", pages[1].Text);
        Assert.Contains("第三門課", pages[2].Text);
    }

    [Fact]
    public void EveryPage_CarriesItsPositionInTheExport()
    {
        var pdf = Render(NewExport(NewCourse(1, "甲")), NewExport(NewCourse(2, "乙")));

        using var document = PdfDocument.Open(new MemoryStream(pdf));
        var pages = document.GetPages().ToList();
        // So a 20-course export cannot be mistaken for the single-course one it resembles.
        Assert.Contains("1 / 2", pages[0].Text);
        Assert.Contains("2 / 2", pages[1].Text);
    }

    [Fact]
    public void ASingleCourse_IsASinglePage()
    {
        var pdf = Render(NewExport());

        // A full detail page has to fit on one sheet, or a 20-course export doubles in length.
        Assert.Equal(1, PageCountOf(pdf));
    }

    [Fact]
    public void ACourseWithVeryLongText_FlowsOntoAnotherPage_RatherThanBeingCut()
    {
        var course = NewCourse();
        // The long-text columns are nvarchar(4000); fill one the way a real outline would.
        course.Outline = string.Join("\n", Enumerable.Range(1, 120).Select(i => $"第 {i} 章：雲端架構與部署實務"));

        var pdf = Render(NewExport(course));

        Assert.True(PageCountOf(pdf) > 1, "a 120-line outline should flow onto further pages");
        var text = TextOf(pdf);
        Assert.Contains("第 1 章：雲端架構與部署實務", text);
        // The tail matters most: truncation would silently lose the end of the outline.
        Assert.Contains("第 120 章：雲端架構與部署實務", text);
    }

    // ----- Footer -----

    [Fact]
    public void TheFooterStampsWhenItWasExported()
    {
        var pdf = Render(NewExport());

        Assert.Contains("匯出時間 2026/07/16 14:30", TextOf(pdf));
    }

    // ----- Metadata -----

    [Fact]
    public void OneCourse_TitlesTheDocumentAfterIt_AndManyAfterTheirCount()
    {
        using var single = PdfDocument.Open(new MemoryStream(Render(NewExport())));
        Assert.Equal("雲端架構師認證課程", single.Information.Title);

        using var many = PdfDocument.Open(new MemoryStream(
            Render(NewExport(NewCourse(1, "甲")), NewExport(NewCourse(2, "乙")))));
        Assert.Equal("課程資料 (2)", many.Information.Title);
    }
}
