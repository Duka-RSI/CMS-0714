# Build Spec for Course
- database schema: `.\database\course.sql`

## Summary

`Course` (課程) is the central table of the 課程管理 module and the most complex entity
in this codebase: 24 columns, **three outbound FKs**, **two N-N relationships**, `date`
columns, `decimal` columns, a `bit` flag, and several large free-text columns.

Its three FK parents — `Partner`, `CourseGroup`, `PublishStatus` — are all already built
and already ship lookup endpoints, so the dropdowns need no new plumbing. The two N-N
targets (`Certification`, `JobCategory`) have **no** lookup endpoints yet; both are new.

> The list also exports ticked courses as a merged PDF (`POST /api/courses/pdf`) — see
> **`spec/course/CoursePdfExport.md`**, and read it before touching the font or adding a
> field to the detail page that the export should carry too.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **int IDENTITY** (server-assigned; hidden in add, read-only in edit) |
| Foreign Keys | `Partner_pkid` → Partner (NOT NULL); `CourseGroup_pkid` → CourseGroup (**NULL**); `PublishStatus_pkid` → PublishStatus (NOT NULL) |
| Required Fields | Title, CourseId, ProdCourseId, FriendlyUrl, DisplayOrder, Partner_pkid, PublishStatus_pkid, ScheduleOn, ScheduleOff, Hour, ListPrice, LearningCredit, CanRepeat |
| N-N Relationships | `CourseInCertification` → Certification; `CourseJobCategories` → JobCategory |
| Primary-Foreign Links | CourseFAQ, CourseRelatedLink, HotCourse reference `Course.pkid` (child features not built — links deferred; **but see Delete**) |
| Query Filters | keyword; 3 FK dropdowns; CanRepeat tri-state; ScheduleOn range; ScheduleOff range |
| Default Sort | `DisplayOrder ASC, pkid DESC` |

---

## ⚠️ Delete: no child FK cascades — 409, do not silently destroy

**Every** FK pointing at `Course.pkid` is declared **without `ON DELETE CASCADE`**:

| Child table | Cascade? | Kind | On Course delete |
|---|---|---|---|
| `CourseInCertification` | ❌ none | pure junction (2 FKs, composite PK) | **delete the rows** — they are associations, not data |
| `CourseJobCategories` | ❌ none | pure junction (2 FKs, composite PK) | **delete the rows** — same |
| `CourseFAQ` | ❌ none | child **entity** (own pkid, Question/Answer) | **409 Conflict** — real content, never silently dropped |
| `CourseRelatedLink` | ❌ none | child **entity** (own pkid, LinkDefinition FK) | **409 Conflict** |
| `HotCourse` | ❌ none | child **entity** (own pkid, Enable flag) | **409 Conflict** |

So `DeleteAsync` must, inside one transaction:
1. Guard: if any `CourseFAQ` / `CourseRelatedLink` / `HotCourse` row references the course
   → return a conflict signal → controller emits **409** naming which children block it.
2. Otherwise delete the two junctions' rows, then the `Course` row.

Deleting the `Course` row without step 1 would throw `SqlException` 547 and surface as a
**500**. This mirrors the `CourseGroup` lesson (`FK_PartnerCourseGroup_CourseGroup` has no
cascade → 409, not 500). Note `Course` differs from `CourseGroup`: **nothing** cascades
here, whereas `FK_Course_CourseGroup` *does* cascade from the parent side.

---

## Localization

### Chinese Table Name

- Course: 課程
- Description: 課程主資料

### Chinese Column Names

- pkid: 主代碼
- Title: 課程名稱
- OfficialTitle: 官方名稱
- CourseId: 簡介代碼
- ProdCourseId: 科目代碼
- FriendlyUrl: 網址代稱
- DisplayOrder: 顯示順序
- Partner_pkid: 原廠
- CourseGroup_pkid: 課程群組
- PublishStatus_pkid: 上架狀態
- ScheduleOn: 上架日期
- ScheduleOff: 下架日期
- Hour: 時數
- ListPrice: 定價
- LearningCredit: 點數
- Material: 教材
- Objective: 課程目標
- Target: 適合對象
- Prerequisites: 先備知識
- Outline: 課程大綱
- TowardCertOrExam: 對應認證/考試
- Note: 備註
- OtherInfo: 其他資訊
- CanRepeat: 允許重聽

Display names for 簡介代碼 / 科目代碼 / 原廠 / 課程群組 / 上架狀態 / 上架日期 / 下架日期 /
時數 / 定價 / 點數 / 允許重聽 / 顯示順序 come from the supplied list-page hints.

---

## Required Fields

Required (NOT NULL, excluding the IDENTITY PK):
- `Title` nvarchar(200), `CourseId` varchar(50), `ProdCourseId` varchar(50),
  `FriendlyUrl` nvarchar(100), `DisplayOrder` int
- `Partner_pkid` smallint, `PublishStatus_pkid` tinyint
- `ScheduleOn` date, `ScheduleOff` date
- `Hour` smallint, `ListPrice` decimal(9,0), `LearningCredit` decimal(9,1)
- `CanRepeat` bit

Optional (nullable):
- `OfficialTitle` nvarchar(300), `CourseGroup_pkid` smallint, `Material` nvarchar(500),
  `Objective` nvarchar(4000), `Target` nvarchar(500), `Prerequisites` nvarchar(4000),
  `Outline` nvarchar(max), `TowardCertOrExam` nvarchar(max), `Note` nvarchar(4000),
  `OtherInfo` nvarchar(4000)

---

## Foreign Keys

| Column | → Table | Null? | Option label | Order by | Lookup |
|---|---|---|---|---|---|
| `Partner_pkid` | Partner.pkid | NOT NULL | `Name` | DisplayOrder, Name | `GET /api/lookups/partners` (**exists**) |
| `CourseGroup_pkid` | CourseGroup.pkid | **NULL** | `Description` | Description | `GET /api/lookups/course-groups` (**exists**) |
| `PublishStatus_pkid` | PublishStatus.pkid | NOT NULL | `Description` | pkid | `GET /api/lookups/publish-statuses` (**exists**) |

- **`CourseGroup_pkid` is nullable** → its dropdown carries a `無` (null) option and the
  SELECT uses a `LEFT JOIN`; the other two use `INNER JOIN`.
- Aliases required — the DB columns are `Partner_pkid` etc., Dapper will not match across
  the underscore: `c.Partner_pkid AS PartnerPkid` (mirrors `FeaturedPromoItemRepository`).

---

## Foreign-Primary Links

Navigation from Course → the parent's detail page:

- `Partner_pkid` → `/partners/{partnerPkid}`
- `CourseGroup_pkid` → `/course-groups/{courseGroupPkid}` — **only when not null**
- `PublishStatus_pkid` → `/publish-statuses/{publishStatusPkid}`

All three parent features have list/detail routes, so these links are **live** (unlike the
deferred child links below).

---

## Primary-Foreign Links

`CourseFAQ`, `CourseRelatedLink` and `HotCourse` reference `Course.pkid`.

**Deferred:** none of those features has a list route yet, so no nav buttons are rendered
in this pass (follows PublishStatus / Partner / CourseGroup). Intended targets when built:
`/course-faqs?coursePkid={pkid}`, `/course-related-links?coursePkid={pkid}`,
`/hot-courses?coursePkid={pkid}`.

They are **not** ignorable though — see the Delete section: they block deletion.

---

## N-N Relationships

### 1. Course ↔ Certification (`CourseInCertification`)

- Junction: `CourseInCertification` (`Course_pkid`, `Certification_pkid`; composite PK, no
  extra columns → a true junction).
- Lookup: `GET /api/lookups/certifications` (**new**).
- **`Certification.Title` is `nchar(100)` and NULLABLE** → `RTRIM(c.Title)` in the lookup
  SELECT (per backend-conventions), and the label falls back to the pkid when null.
- Request field: `CertificationPkids: List<int>`.
- Form control: `p-multiSelect` (filterable).

### 2. Course ↔ JobCategory (`CourseJobCategories`)

- Junction: `CourseJobCategories` (`Course_pkid`, `JobCategory_pkid`; composite PK).
- Lookup: `GET /api/lookups/job-categories` (**new**). `JobCategory.Description`
  nvarchar(70) NOT NULL, `pkid` smallint.
- Request field: `JobCategoryPkids: List<short>` (**smallint** — not int).
- Form control: `p-multiSelect`.

### Sync pattern (both, mirroring `AppRoleRepository.SyncUsersAsync`)

Inside the create/update transaction, per relationship:
```sql
DELETE FROM CourseInCertification WHERE Course_pkid = @Pkid;
INSERT INTO CourseInCertification (Course_pkid, Certification_pkid) VALUES (@Pkid, @CertificationPkid);
```
Read back on GET-by-id with a separate query on the same connection.

Counts (`CertificationCount`, `JobCategoryCount`) are correlated subqueries, mirroring
`AppRole.UserCount` and `CourseGroup.CourseCount`.

---

## Query Filters

- **keyword**: LIKE across `Title`, `CourseId`, `ProdCourseId`, `OfficialTitle`.
  **Deliberately excludes** `Objective`, `Prerequisites`, `Note`, `OtherInfo`
  (nvarchar(4000)) and `Outline`, `TowardCertOrExam` (nvarchar(max)) — the convention bars
  large text from keyword search (slow, rarely useful).
- **partnerPkid**: `short?` — exact match; options from the partners lookup.
- **courseGroupPkid**: `short?` — exact match; options from the course-groups lookup.
- **publishStatusPkid**: `byte?` — exact match; options from the publish-statuses lookup.
- **canRepeat**: `bool?` — tri-state (null = 全部 / true = 允許 / false = 不允許).
- **scheduleOnFrom / scheduleOnTo**: `DateOnly?` — inclusive range on `ScheduleOn`.
- **scheduleOffFrom / scheduleOffTo**: `DateOnly?` — inclusive range on `ScheduleOff`.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/partners` | **Exists** | `{ pkid, name }` |
| `GET /api/lookups/course-groups` | **Exists** | `{ pkid, description }` |
| `GET /api/lookups/publish-statuses` | **Exists** | `{ pkid, description }` |
| `GET /api/lookups/certifications` | **New** | `{ pkid, title }` — `RTRIM(Title)`, ordered by Title |
| `GET /api/lookups/job-categories` | **New** | `{ pkid, description }` — ordered by Description |

New models `CertificationLookup` (`{ int Pkid, string? Title }`) and `JobCategoryLookup`
(`{ short Pkid, string Description }`); extend `ILookupRepository` / `LookupRepository` /
`LookupsController` + `lookup.service.ts` with matching client methods.

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/courses` | List all |
| `POST` | `/api/courses/query` | Filtered query (body: `CourseQuery`) |
| `GET` | `/api/courses/{id}` | Get by pkid (`int`), includes both pkid lists |
| `POST` | `/api/courses` | Create (pkid IDENTITY — omitted from body) |
| `PUT` | `/api/courses` | Update (pkid from body, immutable) |
| `DELETE` | `/api/courses/{id}` | **409** when FAQ / RelatedLink / HotCourse rows block it |

- **No 409 on create**: `pkid` is IDENTITY and `Course` carries no UNIQUE constraint
  (`CourseId` / `ProdCourseId` / `FriendlyUrl` are all non-unique in the schema — verified).
  So no `ExistsAsync` guard; mirrors Partner/CourseGroup, not PublishStatus.
- No auth attributes (matches every other feature — no auth pipeline exists).

---

## Backend Notes

### Models

```csharp
// Course.cs (response) — FK labels flattened via JOIN (the FeaturedPromoItem pattern,
// not Dapper multi-map nav objects)
public class Course
{
    public int Pkid { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? OfficialTitle { get; set; }
    public string CourseId { get; set; } = string.Empty;
    public string ProdCourseId { get; set; } = string.Empty;
    public string FriendlyUrl { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }

    public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte PublishStatusPkid { get; set; }

    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }

    public string? Material { get; set; }
    public string? Objective { get; set; }
    public string? Target { get; set; }
    public string? Prerequisites { get; set; }
    public string? Outline { get; set; }
    public string? TowardCertOrExam { get; set; }
    public string? Note { get; set; }
    public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }

    /// <summary>Joined from Partner (原廠).</summary>
    public string PartnerName { get; set; } = string.Empty;
    /// <summary>Joined from CourseGroup (課程群組). Null when CourseGroupPkid is null.</summary>
    public string? CourseGroupDescription { get; set; }
    /// <summary>Joined from PublishStatus (上架狀態).</summary>
    public string PublishStatusDescription { get; set; } = string.Empty;

    public int CertificationCount { get; set; }
    public int JobCategoryCount { get; set; }

    /// <summary>N-N, populated only on GET-by-id.</summary>
    public List<int> CertificationPkids { get; set; } = [];
    public List<short> JobCategoryPkids { get; set; } = [];
}

// CourseRequest.cs
public class CourseRequest
{
    public int Pkid { get; set; }

    [Required, MaxLength(200)] public string Title { get; set; } = string.Empty;
    [MaxLength(300)] public string? OfficialTitle { get; set; }
    [Required, MaxLength(50)]  public string CourseId { get; set; } = string.Empty;
    [Required, MaxLength(50)]  public string ProdCourseId { get; set; } = string.Empty;
    [Required, MaxLength(100)] public string FriendlyUrl { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }

    [Required] public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }        // nullable FK
    [Required] public byte PublishStatusPkid { get; set; }

    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }

    [MaxLength(500)]  public string? Material { get; set; }
    [MaxLength(4000)] public string? Objective { get; set; }
    [MaxLength(500)]  public string? Target { get; set; }
    [MaxLength(4000)] public string? Prerequisites { get; set; }
    public string? Outline { get; set; }            // nvarchar(max) — no MaxLength
    public string? TowardCertOrExam { get; set; }   // nvarchar(max) — no MaxLength
    [MaxLength(4000)] public string? Note { get; set; }
    [MaxLength(4000)] public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }

    public List<int> CertificationPkids { get; set; } = [];
    public List<short> JobCategoryPkids { get; set; } = [];
}

// CourseQuery.cs
public class CourseQuery
{
    public string? Keyword { get; set; }
    public short? PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte? PublishStatusPkid { get; set; }
    public bool? CanRepeat { get; set; }
    public DateOnly? ScheduleOnFrom { get; set; }
    public DateOnly? ScheduleOnTo { get; set; }
    public DateOnly? ScheduleOffFrom { get; set; }
    public DateOnly? ScheduleOffTo { get; set; }
}
```

### SQL — SELECT

```sql
SELECT c.pkid, c.Title, c.OfficialTitle, c.CourseId, c.ProdCourseId, c.FriendlyUrl,
       c.DisplayOrder,
       c.Partner_pkid AS PartnerPkid, c.CourseGroup_pkid AS CourseGroupPkid,
       c.PublishStatus_pkid AS PublishStatusPkid,
       c.ScheduleOn, c.ScheduleOff, c.Hour, c.ListPrice, c.LearningCredit,
       c.Material, c.Objective, c.Target, c.Prerequisites, c.Outline,
       c.TowardCertOrExam, c.Note, c.OtherInfo, c.CanRepeat,
       p.Name AS PartnerName,
       cg.Description AS CourseGroupDescription,
       ps.Description AS PublishStatusDescription,
       (SELECT COUNT(*) FROM CourseInCertification x WHERE x.Course_pkid = c.pkid) AS CertificationCount,
       (SELECT COUNT(*) FROM CourseJobCategories j WHERE j.Course_pkid = c.pkid) AS JobCategoryCount
FROM Course c
INNER JOIN Partner p        ON p.pkid  = c.Partner_pkid
LEFT  JOIN CourseGroup cg   ON cg.pkid = c.CourseGroup_pkid   -- nullable FK
INNER JOIN PublishStatus ps ON ps.pkid = c.PublishStatus_pkid
ORDER BY c.DisplayOrder ASC, c.pkid DESC
```

`LEFT JOIN` on CourseGroup is required — an `INNER JOIN` would silently drop every course
with no group. Query adds the filter block; `Hour` is a reserved-ish word but valid
unquoted in SQL Server.

No `nchar` columns on `Course` itself → no `RTRIM` here (only in the certifications lookup).
`ScheduleOn`/`ScheduleOff` are `date` → `DateOnly`; handlers already registered globally.

### SQL — INSERT

```sql
INSERT INTO Course (Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl, DisplayOrder,
                    Partner_pkid, CourseGroup_pkid, PublishStatus_pkid, ScheduleOn, ScheduleOff,
                    Hour, ListPrice, LearningCredit, Material, Objective, Target, Prerequisites,
                    Outline, TowardCertOrExam, Note, OtherInfo, CanRepeat)
VALUES (@Title, @OfficialTitle, @CourseId, @ProdCourseId, @FriendlyUrl, @DisplayOrder,
        @PartnerPkid, @CourseGroupPkid, @PublishStatusPkid, @ScheduleOn, @ScheduleOff,
        @Hour, @ListPrice, @LearningCredit, @Material, @Objective, @Target, @Prerequisites,
        @Outline, @TowardCertOrExam, @Note, @OtherInfo, @CanRepeat);
SELECT CAST(SCOPE_IDENTITY() AS int);
```

### SQL — UPDATE

Same column list, `WHERE pkid = @Pkid`. `pkid` immutable.

### SQL — DELETE (guarded)

```sql
-- 1. blockers
SELECT (SELECT COUNT(*) FROM CourseFAQ         WHERE Course_pkid = @Pkid) AS FaqCount,
       (SELECT COUNT(*) FROM CourseRelatedLink WHERE Course_pkid = @Pkid) AS LinkCount,
       (SELECT COUNT(*) FROM HotCourse         WHERE Course_pkid = @Pkid) AS HotCount;
-- 2. if all zero:
DELETE FROM CourseInCertification WHERE Course_pkid = @Pkid;
DELETE FROM CourseJobCategories   WHERE Course_pkid = @Pkid;
DELETE FROM Course                WHERE pkid = @Pkid;
```
All inside one transaction.

### Registration

`Program.cs`: `AddScoped<ICourseRepository, CourseRepository>()`.

---

## Frontend Notes

### Angular model (`course.model.ts`)

Mirrors the C# model, camelCased. `scheduleOn` / `scheduleOff` are `string` (`YYYY-MM-DD`).

### Date handling

- `date` columns (not `datetime`) → **no `'Z'` suffix trick**; that applies to `datetime`
  only.
- Bind `p-datepicker` to a `Date` and convert with the existing helpers in
  **`core/utils/week.util.ts`** — `toIsoDate(date)` → `'YYYY-MM-DD'` and
  `fromIsoDate(value)` → local-midnight `Date`. Both use local date components on purpose;
  never `toISOString().split('T')[0]`, which shifts UTC+8 dates back a day.
- ⚠️ `feature-spec.template.md` and `sample1.spec.md` call the canonical helper
  `core/utils/date.util.ts` / `toIso()`. **No such file exists in this repo** — those are
  generic course material describing a different app. The real helper is
  `core/utils/week.util.ts` / `toIsoDate()`, added with FeaturedPromoItem. Recorded in
  `frontend-conventions.md` so the next `/crud` run is not misled.

### PrimeNG component names (v20)

`primeng@20.4`. Verified against `node_modules/primeng`: the date control is
**`p-datepicker`** (not the pre-v18 `p-calendar`) and the multiline control is
**`pTextarea`** on a `<textarea>` (not `pInputTextarea`). Course is the first feature in
this app to use either, so there is no in-repo precedent to copy.

### Route table (`app.routes.ts`)

| Path | Component | Notes |
|------|-----------|-------|
| `courses` | `CourseList` | list |
| `courses/new` | `CourseForm` | **before** `:id` |
| `courses/:id/edit` | `CourseForm` | edit |
| `courses/:id` | `CourseDetail` | detail |

### List component

Columns, in the order given by the supplied hints:

| Column | Field | Note |
|---|---|---|
| 主代碼 | pkid | |
| 顯示順序 | displayOrder | |
| 簡介代碼 | courseId | |
| 科目代碼 | prodCourseId | |
| 課程名稱 | title | links to detail |
| 原廠 | partnerName | FK label (JOIN), not the raw pkid |
| 課程群組 | courseGroupDescription | FK label; `—` when null |
| 上架狀態 | publishStatusDescription | FK label |
| 上架日期 | scheduleOn | `yyyy/MM/dd` |
| 下架日期 | scheduleOff | `yyyy/MM/dd` |
| 時數 | hour | |
| 定價 | listPrice | `number:'1.0-0'` (decimal(9,0)) |
| 點數 | learningCredit | `number:'1.1-1'` (decimal(9,1)) |
| 允許重聽 | canRepeat | `p-tag` 是/否 |
| 操作 | | 檢視/編輯/刪除 |

- Filter drawer: 關鍵字 + 原廠/課程群組/上架狀態 三個 `p-select` + 允許重聽 tri-state +
  上架日期 起訖 + 下架日期 起訖.
- Session storage: `course-list-filters`, `course-list-sort`, `course-list-page`.
- Lookups loaded via `forkJoin` on init; saved filters restored **after** they resolve.
- Default sort `displayOrder` ASC.
- Delete confirm: `確定要刪除主代碼 <b>${item.pkid}</b>「${item.title}」？`
- **409 on delete** → error toast naming the blocking children (常見問題 / 相關連結 / 熱門課程).

### Detail component

`dl` grid of every column; FK rows render the label plus a link button to the parent's
detail page (`/partners/{id}`, `/course-groups/{id}`, `/publish-statuses/{id}`);
課程群組 shows `—` and no button when null. Two chip lists for the N-N sets.
Large text (課程大綱 etc.) rendered in `<pre class="longtext">` blocks.

### Form component

- Reactive Forms; `forkJoin` over **five** lookups (partners, course-groups,
  publish-statuses, certifications, job-categories) + the record on edit.
- `pkid`: hidden in add, disabled in edit; `getRawValue()` on save.
- 原廠 / 上架狀態: required `p-select`. 課程群組: `p-select` with `[showClear]="true"`
  and a `無` empty option (nullable FK).
- 上架日期 / 下架日期: `p-datePicker` `dateFormat="yy/mm/dd"`.
- 時數: `p-inputNumber`. 定價: `p-inputNumber` `[maxFractionDigits]="0"`.
  點數: `p-inputNumber` `[minFractionDigits]="1" [maxFractionDigits]="1"`.
- 允許重聽: `p-toggleSwitch`.
- Long text: `p-textarea` (`Objective`, `Prerequisites`, `Note`, `OtherInfo`, `Outline`,
  `TowardCertOrExam`); short text: `pInputText`.
- 認證 / 職務類別: two `p-multiSelect`s (filterable, `display="chip"`).
- No 409 handling on create (IDENTITY PK, no UNIQUE).

### Sidebar placement

Add item 課程 Course → `/courses` (icon `pi pi-book`) as the **first** level-3 child of the
課程管理 Course collapsible group under 功能選單 — above 合作廠商 Partner and
課程群組 CourseGroup, since Course is the module's主表.

### Bundle budget

Course's form is the largest in the app (24 fields + 5 lookups + 2 multiselects). If
`ng build` trips the per-component-style or initial bundle budget, raise it in
`angular.json` rather than splitting the form.

---

## Tests

### Backend (`CMS.API.Tests/CoursesControllerTests.cs`)

xUnit + Moq (strict), repo mocked. Cover: GetAll; Query (every filter passed through);
GetById found/not-found; Create → CreatedAtAction; Update existing/missing;
Delete existing/missing; **Delete blocked → 409**.

### Frontend

- `course.service.spec.ts` — URL/verb per method (numeric pkid, no `encodeURIComponent`).
- `course-list.spec.ts` — rows render FK **labels** not pkids; filter persistence;
  tri-state canRepeat; date-range filters; 409-on-delete toast.
- `course-detail.spec.ts` — loads by id; renders FK labels + parent links; null
  課程群組 shows `—`.
- `course-form.spec.ts` — add mode (pkid hidden) creates; edit mode disables pkid and
  updates; nullable courseGroupPkid submits `null`; N-N pkid arrays round-trip.

---

## Files to create / modify

**Backend (create):** `Models/Course.cs`, `Models/CourseRequest.cs`, `Models/CourseQuery.cs`,
`Models/CertificationLookup.cs`, `Models/JobCategoryLookup.cs`,
`Repositories/ICourseRepository.cs`, `Repositories/CourseRepository.cs`,
`Controllers/CoursesController.cs`, `CMS.API.Tests/CoursesControllerTests.cs`.
**Backend (modify):** `Program.cs` (DI), `Repositories/ILookupRepository.cs`,
`Repositories/LookupRepository.cs`, `Controllers/LookupsController.cs`
(certifications + job-categories lookups).

**Frontend (create):** `core/models/course.model.ts`, `core/models/certification-lookup.model.ts`,
`core/models/job-category-lookup.model.ts`, `core/services/course.service.ts` (+ `.spec.ts`),
`features/courses/course-list/*`, `features/courses/course-detail/*`,
`features/courses/course-form/*` (+ `.spec.ts` each).
**Frontend (modify):** `app.routes.ts`, `app.ts` (sidebar), `core/services/lookup.service.ts`.
