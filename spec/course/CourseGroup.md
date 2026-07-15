# Build Spec for CourseGroup
- database schema: .\database\course.sql

## Summary

`CourseGroup` is a small lookup-style entity that categorizes courses into groups
(e.g. by technology or product family). It has a single descriptive column. It is
referenced by `Course` (nullable FK, **ON DELETE CASCADE**) and by
`PartnerCourseGroup` (NOT NULL FK, no cascade). It has no outbound foreign keys
and no N-N relationships — `PartnerCourseGroup` is *not* a pure junction (it has
its own `pkid`, `DisplayOrder`, and `Description` payload columns), so it is
treated as a child entity, not an N-N link.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **smallint** IDENTITY |
| Foreign Keys | None |
| Required Fields | `Description` |
| N-N Relationships | N/A (`PartnerCourseGroup` has payload columns → child entity, not junction) |
| Primary-Foreign Links | `Course.CourseGroup_pkid` (nullable, ON DELETE CASCADE), `PartnerCourseGroup.CourseGroup_pkid` (NOT NULL) |
| Query Filters | keyword (Description) |
| Default Sort | `pkid DESC` (list); lookup dropdown orders `pkid ASC` |

---

## Localization

### Chinese Table Name

- CourseGroup: 課程群組
- Description: 課程分類群組，供課程與廠商課程群組引用

### Chinese Column Names

- pkid: 主代碼
- Description: 群組名稱

Derived (read-only, correlated subqueries):

- CourseCount: 課程數
- PartnerCourseGroupCount: 廠商群組數

---

## Required Fields

Required (NOT NULL):
- `Description` nvarchar(100) NOT NULL

Optional (nullable):
- none

---

## Foreign Keys

`CourseGroup` has no foreign key columns.

N/A

---

## Foreign-Primary Links

`CourseGroup` has no foreign key columns.

N/A

---

## Primary-Foreign Links

Two tables reference `CourseGroup.pkid`:

- **Course** (`CourseGroup_pkid`, nullable, **ON DELETE CASCADE**)
  - Column header: 對應課程
  - Button label: 查看課程 (icon: `pi pi-list`)
  - Link target: `/courses?courseGroupPkid={pkid}`
  - **Deferred**: the Course feature does not exist yet — do not render the
    navigation button until `/courses` is built. Show only the `CourseCount`
    (課程數) column for now.

- **PartnerCourseGroup** (`CourseGroup_pkid`, NOT NULL, no cascade)
  - Column header: 對應廠商群組
  - Button label: 查看廠商群組 (icon: `pi pi-list`)
  - Link target: `/partner-course-groups?courseGroupPkid={pkid}`
  - **Deferred**: the PartnerCourseGroup feature does not exist yet — show only
    the `PartnerCourseGroupCount` (廠商群組數) column for now.

> **Delete-behavior warning (surface in code comments + spec only, no extra UI):**
> deleting a CourseGroup **cascade-deletes all Courses in the group**
> (`FK_Course_CourseGroup ... ON DELETE CASCADE`). If any `PartnerCourseGroup`
> rows reference it, the DELETE fails with a FK violation instead. The controller
> should catch `SqlException` FK violations and return `409 Conflict` with a
> descriptive message; the list/detail delete confirm message must mention the
> cascade (see Frontend Notes).

---

## N-N Relationships

N/A — `PartnerCourseGroup` has exactly two FKs but also carries `pkid`,
`DisplayOrder`, and `Description`, so it is a standalone child entity managed by
its own future feature, not synced from the CourseGroup form.

---

## Query Filters

- **keyword**: string
  - LIKE on `Description` (the only string column)

No FK filters, bool filters, or date-range filters — the table has no such columns.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/course-groups` | **New** | `{ pkid, description }` list, ordered `pkid ASC` — needed by the future Course feature's FK dropdown; add it now while touching this table |

---

## API Endpoints

Standard six only:

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/course-groups` | List all (includes counts) |
| `POST` | `/api/course-groups/query` | Filtered query (body: `CourseGroupQuery`) |
| `GET` | `/api/course-groups/{id}` | Get by pkid (`{id:int}` route constraint; int PK, no encodeURIComponent needed) |
| `POST` | `/api/course-groups` | Create → 201 with created entity |
| `PUT` | `/api/course-groups` | Update (pkid **in body**, no route param) |
| `DELETE` | `/api/course-groups/{id}` | Delete → 204; **409** if referenced by PartnerCourseGroup |

No auth exceptions. No special endpoints.

---

## Backend Notes

### Models

```csharp
public class CourseGroup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
    // Correlated subquery counts (read-only):
    public int CourseCount { get; set; }
    public int PartnerCourseGroupCount { get; set; }
}

public class CourseGroupRequest
{
    public short Pkid { get; set; }              // ignored on create
    [Required, StringLength(100)]
    public string Description { get; set; } = string.Empty;
}

public class CourseGroupQuery
{
    public string? Keyword { get; set; }
}
```

`pkid` is `smallint` → C# `short` everywhere (model, request, repo method
signatures `GetByIdAsync(short id, ...)`, controller route param).

### SQL — SELECT

```sql
SELECT g.pkid, g.Description,
       (SELECT COUNT(*) FROM Course c WHERE c.CourseGroup_pkid = g.pkid) AS CourseCount,
       (SELECT COUNT(*) FROM PartnerCourseGroup p WHERE p.CourseGroup_pkid = g.pkid) AS PartnerCourseGroupCount
FROM CourseGroup g
```

- Query: append `WHERE g.Description LIKE @Keyword` (`%keyword%`) when keyword present.
- Default `ORDER BY g.pkid DESC` for list/query; lookup uses `ORDER BY pkid ASC`.
- No `nchar` columns → no `RTRIM()` needed. No date/time columns.

### SQL — INSERT

```sql
INSERT INTO CourseGroup (Description) VALUES (@Description);
SELECT CAST(SCOPE_IDENTITY() AS smallint);
```

### SQL — UPDATE

```sql
UPDATE CourseGroup SET Description = @Description WHERE pkid = @Pkid;
```

### SQL — DELETE

```sql
DELETE FROM CourseGroup WHERE pkid = @Pkid;
```

Wrap in try/catch at controller level: `SqlException` number 547 (FK violation
from `PartnerCourseGroup`) → `409 Conflict`. Note the `Course` FK cascades, so
courses in the group are silently removed by SQL Server — this is schema-defined
behavior, warned about in the delete confirmation dialog.

### Special Column Notes

- No RowAudit in this codebase — mirror AppRole exactly (no audit writer).
- No DateOnly/TimeOnly columns; type handlers already registered but unused here.

---

## Frontend Notes

### Angular Model

```ts
export interface CourseGroup {
  pkid: number;
  description: string;
  courseCount: number;
  partnerCourseGroupCount: number;
}

export interface CourseGroupRequest {
  pkid: number;
  description: string;
}

export interface CourseGroupQuery {
  keyword?: string | null;
}
```

### Routes

| Path | Component |
|------|-----------|
| `/course-groups` | course-group-list |
| `/course-groups/new` | course-group-form (**before** `:id`) |
| `/course-groups/:id` | course-group-detail |
| `/course-groups/:id/edit` | course-group-form |

Numeric PK → no `encodeURIComponent` needed in the service (plain interpolation,
matching an int-PK entity; keep the service methods symmetrical with AppRole's).

### List Component

- Columns: 主代碼 (pkid, sortable), 群組名稱 (description, sortable),
  課程數 (courseCount), 廠商群組數 (partnerCourseGroupCount), actions (view/edit/delete).
- `p-table` sortable + paginated; `p-drawer` filter with the single keyword field.
- Default sort: `pkid` descending.
- Session storage keys: `course-group-list-filters`, `course-group-list-sort`,
  `course-group-list-page`.
- No lookups needed on init (no FK columns) — no `forkJoin` required in the list.

### Delete Confirmation Message

Must mention the cascade:

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.description}」？
群組內的 ${item.courseCount} 筆課程將一併刪除。
```

On API `409` → toast error: 該群組仍被廠商課程群組引用，無法刪除。

### Form Component

- Reactive Forms; single field: 群組名稱 (`description`) — `pt-inputtext`,
  required, maxlength 100.
- No lookups → no `forkJoin` needed; edit mode loads the record only.
- pkid displayed read-only (主代碼) in edit mode; not part of the editable form
  (IDENTITY int — unlike AppRole's string PK there is nothing to disable/getRawValue).
- Sticky `p-toolbar` with 儲存 / 取消, same as AppRole form.

### Detail Component

- Card showing 主代碼, 群組名稱, 課程數, 廠商群組數.
- Toolbar: 編輯 / 刪除 / 返回列表 buttons (mirror AppRole detail).
- Child navigation buttons deferred until Course / PartnerCourseGroup features exist.

### Sidebar

Add under nav group **課程管理 Course** — the group does not exist yet in `app.ts`;
create it below 系統管理 Admin with item 課程群組 → `/course-groups`
(icon suggestion: `pi pi-tags`).

---

## Session Storage Keys

| Key | Contents |
|-----|----------|
| `course-group-list-filters` | Last query filter values (`{ keyword }`) |
| `course-group-list-sort` | `{ sortField, sortOrder }` |
| `course-group-list-page` | `{ first, rows }` |

No incoming cross-entity query params yet (Course list will later link **to**
`/course-groups`? No — links flow the other way; nothing overrides saved state).

---

## Tests

### Backend (CMS.API.Tests, xUnit + Moq — mock `ICourseGroupRepository`)

`CourseGroupsControllerTests`:
- `GetAll` → 200 with list
- `Query` with keyword → 200, repository receives the query object
- `GetById` found → 200 with entity; not found → 404
- `Create` → 201 with created entity (CreatedAtAction)
- `Update` existing → 204 (or 200 per AppRole pattern); not found → 404
- `Delete` existing → 204; not found → 404
- Required-field 400: `Description` missing/empty fails model validation

### Frontend (Karma + Jasmine)

- `course-group.service.spec.ts` — `HttpTestingController`: each method hits
  the right URL/verb (`/api/course-groups`, `/query`, `/{id}`, POST/PUT/DELETE).
- `course-group-list.spec.ts` — renders with mocked service; delete confirm fires.
- `course-group-detail.spec.ts` — renders record fields with mocked service.
- `course-group-form.spec.ts` — required `description` invalid when empty;
  save disabled/blocked until valid.

---

## Files to Create / Modify

| # | File | Action |
|---|------|--------|
| 1 | `src/CMS.API/Models/CourseGroup.cs` | create |
| 2 | `src/CMS.API/Models/CourseGroupRequest.cs` | create |
| 3 | `src/CMS.API/Models/CourseGroupQuery.cs` | create |
| 4 | `src/CMS.API/Repositories/ICourseGroupRepository.cs` | create |
| 5 | `src/CMS.API/Repositories/CourseGroupRepository.cs` | create |
| 6 | `src/CMS.API/Controllers/CourseGroupsController.cs` | create |
| 7 | `src/CMS.API/Program.cs` | modify — register repository DI |
| 8 | `src/CMS.API/Controllers/LookupsController.cs` | modify — add `GET /api/lookups/course-groups` |
| 9 | `src/CMS.API/Repositories/ILookupRepository.cs` + impl | modify — add course-groups lookup |
| 10 | `src/CMS.API.Tests/CourseGroupsControllerTests.cs` | create |
| 11 | `src/CMS.NG/src/app/core/models/course-group.model.ts` | create |
| 12 | `src/CMS.NG/src/app/core/services/course-group.service.ts` | create (+ `.spec.ts`) |
| 13 | `src/CMS.NG/src/app/features/course-groups/course-group-list/` | create (+ `.spec.ts`) |
| 14 | `src/CMS.NG/src/app/features/course-groups/course-group-detail/` | create (+ `.spec.ts`) |
| 15 | `src/CMS.NG/src/app/features/course-groups/course-group-form/` | create (+ `.spec.ts`) |
| 16 | `src/CMS.NG/src/app/app.routes.ts` | modify — lazy routes (`/new` before `/:id`) |
| 17 | `src/CMS.NG/src/app/app.ts` | modify — add 課程管理 Course nav group + 課程群組 item |
