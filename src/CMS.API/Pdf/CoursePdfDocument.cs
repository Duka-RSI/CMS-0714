using CMS.API.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CMS.API.Pdf;

/// <summary>
/// The selected courses as one PDF — every course laid out like its detail page, one course
/// per page, in the list's own order.
/// </summary>
/// <remarks>
/// Real typeset text, not a screenshot of the page: the output is selectable, searchable and
/// reflows for long outlines. See <see cref="PdfFonts"/> for why the font choice is not
/// cosmetic — the wrong one silently breaks that text layer.
/// </remarks>
public sealed class CoursePdfDocument : IDocument
{
    private const string Dash = "—";

    private static readonly TextStyle LabelStyle = TextStyle.Default.FontSize(9).FontColor(Colors.Grey.Darken1);
    private static readonly TextStyle ValueStyle = TextStyle.Default.FontSize(10);
    private static readonly TextStyle SectionStyle = TextStyle.Default.FontSize(12).SemiBold().FontColor(Colors.Black);

    private readonly IReadOnlyList<CourseExport> _courses;
    private readonly DateTime _generatedAt;

    /// <param name="courses">Already ordered; the document does not re-sort them.</param>
    /// <param name="generatedAt">Stamped in the footer. Passed in so tests are deterministic.</param>
    public CoursePdfDocument(IReadOnlyList<CourseExport> courses, DateTime generatedAt)
    {
        _courses = courses;
        _generatedAt = generatedAt;
    }

    public DocumentMetadata GetMetadata() => new()
    {
        Title = _courses.Count == 1 ? _courses[0].Course.Title : $"課程資料 ({_courses.Count})",
        Author = "CMS",
        CreationDate = _generatedAt,
    };

    public void Compose(IDocumentContainer container)
    {
        foreach (var (export, index) in _courses.Select((c, i) => (c, i)))
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(1.5f, Unit.Centimetre);
                page.DefaultTextStyle(s => s.FontFamily(PdfFonts.Family).FontSize(10).LineHeight(1.35f));

                page.Header().Element(e => ComposeHeader(e, export.Course, index));
                page.Content().Element(e => ComposeContent(e, export));
                page.Footer().Element(ComposeFooter);
            });
        }
    }

    private void ComposeHeader(IContainer container, Course course, int index)
    {
        container.PaddingBottom(8).Column(column =>
        {
            column.Item().Row(row =>
            {
                row.RelativeItem().Text(course.Title).FontSize(16).Bold();
                // Position in the export, so a reader can tell a 20-course document apart
                // from the single-course one it looks like on page 1.
                row.ConstantItem(70).AlignRight().AlignBottom()
                    .Text($"{index + 1} / {_courses.Count}").FontSize(8).FontColor(Colors.Grey.Medium);
            });

            if (!string.IsNullOrWhiteSpace(course.OfficialTitle))
            {
                column.Item().Text(course.OfficialTitle).FontSize(10).FontColor(Colors.Grey.Darken1);
            }

            column.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
        });
    }

    private void ComposeContent(IContainer container, CourseExport export)
    {
        var course = export.Course;

        container.PaddingVertical(10).Column(column =>
        {
            column.Spacing(14);

            // --- 課程資料 + QR side by side: the QR is the only image in the document. ---
            column.Item().Row(row =>
            {
                row.RelativeItem().Element(e => ComposeCoreFields(e, course));

                var qr = CourseQrCodeGenerator.TryRender(course.Pkid, course.CourseId);
                if (qr is not null)
                {
                    row.ConstantItem(90).PaddingLeft(10).Column(qrColumn =>
                    {
                        qrColumn.Item().Width(80).Image(qr);
                        qrColumn.Item().PaddingTop(3).AlignCenter()
                            .Text(course.CourseId).FontSize(7).FontColor(Colors.Grey.Darken1);
                    });
                }
            });

            column.Item().Element(e => ComposeChips(e, $"認證（{export.CertificationLabels.Count}）",
                export.CertificationLabels, "此課程目前沒有對應任何認證。"));

            column.Item().Element(e => ComposeChips(e, $"職務類別（{export.JobCategoryLabels.Count}）",
                export.JobCategoryLabels, "此課程目前沒有對應任何職務類別。"));

            column.Item().Element(e => ComposeLongText(e, course));
        });
    }

    private static void ComposeCoreFields(IContainer container, Course course)
    {
        container.Column(column =>
        {
            column.Item().PaddingBottom(6).Text("課程資料").Style(SectionStyle);
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(72);
                    columns.RelativeColumn();
                    columns.ConstantColumn(72);
                    columns.RelativeColumn();
                });

                // Two label/value pairs per row: these are all short values, and one pair per
                // row would push the long-text sections onto a second page for every course.
                var fields = new (string Label, string Value)[]
                {
                    ("主代碼", course.Pkid.ToString()),
                    ("簡介代碼", course.CourseId),
                    ("科目代碼", course.ProdCourseId),
                    ("網址代稱", course.FriendlyUrl),
                    ("原廠", course.PartnerName),
                    ("課程群組", Or(course.CourseGroupDescription)),
                    ("上架狀態", course.PublishStatusDescription),
                    ("顯示順序", course.DisplayOrder.ToString()),
                    ("上架日期", FormatDate(course.ScheduleOn)),
                    ("下架日期", FormatDate(course.ScheduleOff)),
                    ("時數", course.Hour.ToString()),
                    ("定價", course.ListPrice.ToString("N0")),
                    ("點數", course.LearningCredit.ToString("N1")),
                    ("允許重聽", course.CanRepeat ? "是" : "否"),
                    ("教材", Or(course.Material)),
                    ("適合對象", Or(course.Target)),
                };

                foreach (var (label, value) in fields)
                {
                    table.Cell().Element(LabelCell).Text(label).Style(LabelStyle);
                    table.Cell().Element(ValueCell).Text(value).Style(ValueStyle);
                }
            });
        });

        static IContainer LabelCell(IContainer c) => c.PaddingVertical(2).PaddingRight(4);
        static IContainer ValueCell(IContainer c) => c.PaddingVertical(2).PaddingRight(8);
    }

    private static void ComposeChips(IContainer container, string title, IReadOnlyList<string> labels, string emptyText)
    {
        container.Column(column =>
        {
            column.Item().PaddingBottom(4).Text(title).Style(SectionStyle);

            if (labels.Count == 0)
            {
                column.Item().Text(emptyText).FontSize(9).Italic().FontColor(Colors.Grey.Medium);
                return;
            }

            // Comma-separated rather than PrimeNG-style chips: a printed page has no hover
            // affordance to justify the boxes, and wrapping text reflows where chips would not.
            column.Item().Text(string.Join("、", labels)).Style(ValueStyle);
        });
    }

    private static void ComposeLongText(IContainer container, Course course)
    {
        var blocks = new (string Label, string? Value)[]
        {
            ("課程目標", course.Objective),
            ("先備知識", course.Prerequisites),
            ("課程大綱", course.Outline),
            ("對應認證/考試", course.TowardCertOrExam),
            ("備註", course.Note),
            ("其他資訊", course.OtherInfo),
        };

        container.Column(column =>
        {
            column.Item().PaddingBottom(4).Text("詳細內容").Style(SectionStyle);

            foreach (var (label, value) in blocks)
            {
                column.Item().PaddingBottom(8).Column(block =>
                {
                    block.Item().Text(label).Style(LabelStyle);
                    // The detail page renders these in a <pre>; the source text carries its own
                    // newlines, and QuestPDF honours them, so the outline keeps its shape.
                    block.Item().Text(Or(value)).Style(ValueStyle);
                });
            }
        });
    }

    private void ComposeFooter(IContainer container)
    {
        container.PaddingTop(6).BorderTop(1).BorderColor(Colors.Grey.Lighten2).PaddingTop(4).Row(row =>
        {
            row.RelativeItem().Text($"匯出時間 {_generatedAt:yyyy/MM/dd HH:mm}")
                .FontSize(7).FontColor(Colors.Grey.Medium);
            row.RelativeItem().AlignRight().Text(text =>
            {
                text.DefaultTextStyle(s => s.FontSize(7).FontColor(Colors.Grey.Medium));
                text.CurrentPageNumber();
                text.Span(" / ");
                text.TotalPages();
            });
        });
    }

    private static string Or(string? value) => string.IsNullOrWhiteSpace(value) ? Dash : value.Trim();

    /// <summary>
    /// ScheduleOn/ScheduleOff are SQL <c>date</c> columns bound to DateOnly, so there is no
    /// timezone to get wrong here — unlike the datetime columns the NG app has to re-stamp.
    /// </summary>
    private static string FormatDate(DateOnly date) => date.ToString("yyyy/MM/dd");
}
