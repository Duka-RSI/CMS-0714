# Course PDF Export

Feature: tick courses on the Course list, download the selected ones merged into one PDF —
each course laid out like its detail page, one course per page, in the list's own order.

## Summary

Real typeset text, not a screenshot of the page: the output is selectable, searchable, and
reflows for long outlines. Built **server-side**, because the Chinese needs a font the
browser bundle has no business carrying (see [The font](#the-font-and-why-it-is-not-cosmetic))
and the API already holds every field the detail page shows.

| | |
|------|--------|
| Endpoint | `POST /api/courses/pdf` → `CoursesController.ExportPdf` |
| Body | `CoursePdfRequest { pkids: int[] }` — max **100** (`CoursePdfRequest.MaxCourses`) |
| Read by | `ICourseRepository.GetForExportAsync` → `CourseExport` |
| Rendered by | `Pdf/CoursePdfDocument.cs` (QuestPDF), `Pdf/CourseQrCodeGenerator.cs` (QRCoder) |
| Font | `Pdf/PdfFonts.cs` — **新細明體 (PMingLiU)**, verified at startup |
| NG | `course-list` 下載 PDF button → `CourseService.exportPdf` → `FileDownloadService.save` |

Read-only: nothing is written, so **there is no RowAudit row** for an export. Reachable by any
logged-in caller, matching the Course endpoints it draws from.

## The font, and why it is not cosmetic

> ⚠️ **Do not "upgrade" the PDF to 微軟正黑體 (Microsoft JhengHei).**

It renders beautifully and then silently corrupts the text layer. Every character that also
exists in Unicode's **Kangxi Radicals** block — 大 一 二 小 人 工 月 日 目 田 力 口, i.e. some
of the most common characters there are — is written into the PDF's ToUnicode map as the
*radical* codepoint: 大 (U+5927) becomes ⼤ (U+2F24). The page looks perfect. Copying
"課程大綱" out of it yields "課程⼤綱", and Ctrl+F for 大 finds nothing — which defeats the
entire point of typesetting text instead of screenshotting the page.

Measured on the same sample, not assumed:

| Font | Text round-trips | Note |
|------|------------------|------|
| Microsoft JhengHei 微軟正黑體 | ❌ 10 characters drifted | modern sans, breaks copy/search |
| Noto Sans TC | ❌ 13 characters drifted | the usual Linux choice; worst of the set |
| **PMingLiU 新細明體** | ✅ exact | **chosen** — the standard Windows document face here, and the smallest output (12kB vs 62kB) |
| MingLiU 細明體 | ✅ exact | |
| DFKai-SB 標楷體 | ✅ exact | |
| Microsoft YaHei 微軟雅黑 | ✅ exact | but it is a *Simplified* Chinese face — wrong for this app |

The trade-off taken: 新細明體 is a serif face, so the PDF does not match the app's sans-serif
screen look. The only sans face that round-trips is a Simplified Chinese one. Correct text
beat matching the screen.

`CoursePdfDocumentTests.TheKangxiRadicalTrap_DoesNotCorruptCommonCharacters` is what holds
this: it renders a PDF, extracts the text back with PdfPig, and fails if the characters
drifted. **Verified to fail** when `PdfFonts.Family` is set to Microsoft JhengHei — a guard
that has never failed is not a guard.

`PdfFonts.Verify` logs the face at startup and warns if it is missing. QuestPDF resolves
fonts by family name and **falls back silently**, so on a host without 新細明體 — a Linux
container, say — every export would come out with blank Chinese and no error at all.

## The read side: three queries, never N+1

`GetForExportAsync(pkids)` does exactly three queries no matter how many courses are picked:

1. the courses themselves, via the list's own `SelectColumns` / `FromJoin` / `OrderBy`;
2. every selected course's certification labels;
3. every selected course's job-category labels.

Calling `GetByIdAsync` per course would be an N+1 **and** would return the N-N *pkids* rather
than the names the PDF prints. The list rows already carry every other field — `SelectColumns`
is shared between list and by-id — so the labels are the only thing the export has to fetch.

- `Certification.Title` is **`nchar(100)`**: `RTRIM` in the query, or every label drags ~60–74
  trailing spaces into the document (verified: every row is padded to 100).
- `Certification.Title` is nullable — falls back to `#pkid`, mirroring the detail page.
- Ordering is the list's `DisplayOrder, pkid`, so an export reads in the same order as the
  screen it was started from. The controller does not re-sort.

## Endpoint decisions

- **POST, not GET.** A user can tick 50 rows; that many ids do not belong in a URL. The call
  is read-only regardless.
- **Capped at 100 courses.** Each one is a rendered page and the request is synchronous — an
  unbounded selection would tie up a request thread building a document nobody waits for. The
  NG button disables past the same number, but the API's guard is the real one.
- **Duplicate pkids are removed** before the query: `IN` would not notice them, and the
  course would print twice.
- **Every selected course gone → 400**, not an empty PDF and never 401 (the NG app reads any
  401 as a session expiry). Reached when the rows are deleted between the list loading and the
  export.
- **Filename**: one course exports as `{CourseId}-{yyyyMMdd-HHmm}.pdf`, many as
  `courses-{n}-{yyyyMMdd-HHmm}.pdf`. `CourseId` is free text in the DB, so characters a
  filename or a `Content-Disposition` header cannot carry are stripped; if nothing survives,
  it falls back to the count form. The stamp is **local** time — it is read by people in this
  office, unlike RowAudit's UTC `DateTime`. **None of this reaches the browser unless CORS
  exposes the header** — see [The filename](#the-filename-only-exists-if-cors-exposes-it).

## The filename only exists if CORS exposes it

> ⚠️ **`AllowAnyHeader()` does not cover this.** It governs the *request* headers a browser may
> send. Which *response* headers script may read is a separate, opt-in list.

The app is served from :4200 and the API from :5000 with no proxy, so every call is
cross-origin. A browser hides every response header from script except a short safelist, and
`Content-Disposition` is not on it. So the CORS policy in `Program.cs` must say:

```csharp
.WithExposedHeaders("Content-Disposition")
```

Without that line the whole filename apparatus above — the stamp, the CourseId, the character
stripping, the fallback — is **dead code in a browser**. `filenameFromResponse` reads `null`,
returns its fallback, and every download arrives as `courses-{n}.pdf`. A single-course export
loses its CourseId entirely. Nothing throws, no console error, no failed request: the PDF
downloads correctly and is simply named wrong.

**This shipped.** It was found by exporting from a real browser and reading the filename back,
not by a test — `CoursesControllerPdfTests` covers every filename rule and was green
throughout, because it calls the action directly and no CORS middleware ever runs. That is the
gap `CorsPipelineTests` now closes: it drives the endpoint over real HTTP with an `Origin`
header and asserts `Access-Control-Expose-Headers`. **Verified to fail** with the line removed.

Note what a test *cannot* do here: `HttpClient` is not a browser and enforces no CORS, so it
reads every header regardless. Asserting the filename over `HttpClient` proves the server
**sent** it, never that script may **read** it — those are two assertions, and only the
`Access-Control-Expose-Headers` one guards the bug.

## Layout

One A4 page per course, then flowing on if the long text needs it (a 120-line outline is a
real case and is tested). Mirrors the detail page's four blocks: 課程資料 + QR, 認證,
職務類別, 詳細內容.

- **課程資料 is a two-pair-per-row table.** One label/value per row would push 詳細內容 onto a
  second page for every course.
- **N-N labels are `、`-separated text, not chips.** A printed page has no hover affordance to
  justify the boxes, and text reflows where chips do not.
- **The QR is the only image.** Regenerated server-side with QRCoder at ECC level M, encoding
  the same public URL the detail page's QR does — `CourseQrCodeGenerator.BuildUrl` duplicates
  `buildCourseQrUrl` from `course-qr-code.ts`, because nothing crosses the server/browser
  boundary. **A change to the public course URL has to be made in both places**; both halves
  are pinned by tests. A course whose QR fails still gets its page.
- Long text keeps its newlines: the columns store them and QuestPDF honours them.

## The frontend

- `p-table` already had `dataKey="pkid"`, so `[(selection)]` keeps a selection across paging
  and sorting. The header checkbox ticks **every row the current filter matched**, not just
  the visible page — which is the useful meaning, since the export takes the whole selection.
- The button shows the count (`下載 PDF（12）`) so it is clear the whole selection is exported.

> ⚠️ **`responseType: 'blob'` applies to the error body too.** An API that returns a tidy
> `{ message }` on a 400 hands it over as an *unparsed Blob*, so `error.error.message` is
> silently `undefined` — including for the "these rows are gone" 400. `readErrorMessage`
> (`core/utils/download.util.ts`) reads it back through `Blob.text()`. The global 5xx
> interceptor hits the same wall and falls back to its generic toast, which is why the
> component reports only 4xx and leaves 5xx alone — otherwise a 500 would stack two toasts.

`FileDownloadService` exists so components can be tested without a real download firing; the
pure helpers (`filenameFromResponse`, `readErrorMessage`) stay in `download.util.ts`.
`exportSelectedPdf()` is `async`/`firstValueFrom` rather than `subscribe` specifically so its
spec can `await` it — the blob read is a native promise that `fixture.whenStable()` does not
wait for, and the alternative was a `setTimeout` in the test.

## Licensing

QuestPDF is used under its **Community licence**, declared in `Program.cs`
(`QuestPDF.Settings.License = LicenseType.Community` — it refuses to render without one).
That tier is free while annual gross revenue stays **under 1M USD**. If that stops being
true, this is a paid dependency (Professional ≈ $699/yr) — revisit the licence line, not just
the package version.

## Tests

- `CoursePdfDocumentTests` (13) — renders and reads back. The text-is-really-text assertion,
  the Kangxi trap, line breaks surviving, every detail-page field present, empty-state text,
  null→dash, one page per course, page-position stamps, a single course fitting one page, a
  120-line outline flowing rather than truncating, the footer stamp, and the metadata title.
- `CoursesControllerPdfTests` (14) — pkid forwarding, dedup, merge, the 400 for stale rows,
  the invalid-model short-circuit, and every filename rule. Calls the action directly, so it
  proves what the action *returns* and nothing about what a browser *receives*.
- `CorsPipelineTests` (3) — the endpoint over real HTTP through the whole pipeline, from the
  browser's origin: the policy matches, `Content-Disposition` is exposed to script, and the
  header carries the stamped name. The expose assertion is **verified to fail** without
  `WithExposedHeaders`. Booted with `WebApplicationFactory`, repositories mocked, clock fixed.
- `CourseQrCodeGeneratorTests` (8) — URL format and escaping (the half that must match the NG
  app), PNG output, determinism, and that an unrenderable QR does not throw.
- `download.util.spec.ts` (12) / `file-download.service.spec.ts` (1) / `course-list.spec.ts`
  export block (9).

**Not covered by any test:** the repository SQL, as everywhere else in this codebase —
repositories are mocked at the seam. It was validated directly against the live DB instead:
the three-join course query, both label joins, and the `nchar` padding that makes the `RTRIM`
load-bearing.

Also not covered, and the reason the CORS bug survived: **nothing asserts what a real browser
does with the response.** `CorsPipelineTests` asserts the instruction the browser is given, not
the browser's obedience to it. Closing that last inch needs a browser, and the export was
smoke-tested through one — ticking rows on the list, downloading, extracting the text back with
`pdftotext` (real text, `大` = U+5927, no `nchar` padding) and reading the filename off the
blob. Worth repeating by hand when this feature changes shape.
