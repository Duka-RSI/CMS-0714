# Build Spec for CourseGroup
- database schema: `.\database\course.sql`

## Summary

`CourseGroup` is a minimal lookup-style master table (課程群組) that classifies
courses into groups. It carries only a single display `Description`. It has **no
foreign keys** and **no N-N relationships**, but it **is an FK target** for `Course`
(`Course.CourseGroup_pkid`, nullable) and `PartnerCourseGroup`
(`PartnerCourseGroup.CourseGroup_pkid`), so it needs a slim lookup endpoint.
This is the simplest possible Partner-pattern table (smallint IDENTITY PK, one
non-key column).

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **smallint IDENTITY** (auto-generated; hidden in add, read-only in edit) |
| Foreign Keys | None |
| Required Fields | `Description` |
| N-N Relationships | N/A |
| Primary-Foreign Links | `Course`, `PartnerCourseGroup` reference `CourseGroup_pkid` (child features not yet built — links deferred) |
| Query Filters | keyword (Description) |
| Default Sort | `pkid ASC` |

---

## Localization

### Chinese Table Name

- CourseGroup: 課程群組
- Description: 課程群組主資料（將課程分類的群組）

### Chinese Column Names

- pkid: 主代碼
- Description: 群組名稱

---

## Required Fields

Required (NOT NULL, excluding the IDENTITY PK):
- `Description` — nvarchar(100)

Optional (nullable):
- None

---

## Foreign Keys

`CourseGroup` has no foreign key columns.

**N/A**

---

## Foreign-Primary Links

`CourseGroup` has no foreign key columns.

**N/A**

---

## Primary-Foreign Links

The following tables reference `CourseGroup.pkid` as an FK target:

- **Course** (`Course.CourseGroup_pkid`, nullable) — 對應課程 → `/courses?courseGroupPkid={pkid}`
- **PartnerCourseGroup** (`PartnerCourseGroup.CourseGroup_pkid`) — 對應廠商課程群組 → `/partner-course-groups?courseGroupPkid={pkid}`

**Deferred:** neither child feature has a list route yet. Following the `Partner`
and `PublishStatus` reference (both FK targets with no built children), the
CourseGroup list/detail pages do **not** render primary-foreign link buttons in this
pass. Wire them when the child features are generated. This section documents the
intended links.

---

## N-N Relationships

`CourseGroup` participates in no junction tables. (`PartnerCourseGroup` has three
non-key columns beyond its two FKs — `DisplayOrder`, `Description`, `pkid` IDENTITY —
so it is a first-class entity, not a pure junction table, and is **not** treated as N-N.)

**N/A**

---

## Query Filters

- **keyword**: string
  - LIKE on `Description`

No FK filters (no FK columns), no bool filters (no bit columns), no date-range
filters (no date/datetime columns). The filter drawer holds a single keyword field
(mirrors the `Partner` single-filter pattern).

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/course-groups` | **New** | Slim CourseGroup list (`pkid`, `Description`) ordered by `Description ASC` — for Course/PartnerCourseGroup FK dropdowns |

`CourseGroupLookup` model (`{ pkid, Description }`) added; `LookupRepository.GetCourseGroupsAsync`,
`ILookupRepository`, and `LookupsController` GET `course-groups` endpoint added; matching
`LookupService.getCourseGroups()` + `course-group-lookup.model.ts` on the frontend.

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/course-groups` | List all |
| `POST` | `/api/course-groups/query` | Filtered query (body: `CourseGroupQuery`) |
| `GET` | `/api/course-groups/{id}` | Get by pkid (`short` route param) |
| `POST` | `/api/course-groups` | Create (pkid is IDENTITY — omitted from body; returns new pkid) |
| `PUT` | `/api/course-groups` | Update (pkid from body, immutable) |
| `DELETE` | `/api/course-groups/{id}` | Delete |
| `GET` | `/api/lookups/course-groups` | Slim lookup list (new) |

- **No 409 uniqueness check**: `pkid` is IDENTITY (auto-generated), and there is no
  UNIQUE constraint on `Description`, so `Create` inserts directly and returns
  `SELECT CAST(SCOPE_IDENTITY() AS smallint)`. Mirrors the `Partner` IDENTITY pattern,
  **not** the `PublishStatus` user-assigned-PK 409 pattern.
- No auth attributes (matches AppRole/PublishStatus/Partner).

---

## Backend Notes

### Models

```csharp
// CourseGroup.cs (response)
public class CourseGroup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}

// CourseGroupRequest.cs (write DTO — pkid used on UPDATE only, IDENTITY on INSERT)
public class CourseGroupRequest
{
    public short Pkid { get; set; }

    [Required, MaxLength(100)] public string Description { get; set; } = string.Empty;
}

// CourseGroupQuery.cs (search DTO)
public class CourseGroupQuery
{
    public string? Keyword { get; set; }
}

// CourseGroupLookup.cs (slim lookup)
public class CourseGroupLookup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}
```

### SQL — SELECT

```sql
SELECT cg.pkid, cg.Description
FROM CourseGroup cg
ORDER BY cg.pkid ASC
```

Query adds: `WHERE (@Keyword IS NULL OR cg.Description LIKE @Keyword)`.

No `nchar` columns, so no `RTRIM()` needed. No `date`/`time` columns.

### SQL — INSERT

```sql
INSERT INTO CourseGroup (Description)
VALUES (@Description);
SELECT CAST(SCOPE_IDENTITY() AS smallint);
```

`pkid` is IDENTITY — excluded from INSERT; re-read via `GetByIdAsync(newPkid)`.

### SQL — UPDATE

```sql
UPDATE CourseGroup
SET Description = @Description
WHERE pkid = @Pkid;
```

`pkid` immutable — appears only in the `WHERE`.

### Lookup SQL

```sql
SELECT pkid, Description FROM CourseGroup ORDER BY Description ASC
```

### Registration

Add to `Program.cs`: `AddScoped<ICourseGroupRepository, CourseGroupRepository>()`. Extend the
existing `ILookupRepository`/`LookupRepository`/`LookupsController` with the course-groups endpoint.

---

## Frontend Notes

### Angular model (`course-group.model.ts`)

```ts
export interface CourseGroup {
  pkid: number;
  description: string;
}
export interface CourseGroupRequest {
  pkid: number;
  description: string;
}
export interface CourseGroupQuery {
  keyword?: string | null;
}
```

Plus `course-group-lookup.model.ts`: `{ pkid: number; description: string }`.

### Route table (`app.routes.ts`)

| Path | Component | Notes |
|------|-----------|-------|
| `course-groups` | `CourseGroupList` | list |
| `course-groups/new` | `CourseGroupForm` | **before** `:id` |
| `course-groups/:id/edit` | `CourseGroupForm` | edit |
| `course-groups/:id` | `CourseGroupDetail` | detail |

### List component

- Columns: 主代碼 (pkid), 群組名稱 (description, links to detail), 操作.
- Filter drawer: single 關鍵字 input.
- Session storage: `course-group-list-filters`, `course-group-list-sort`, `course-group-list-page`.
- Default sort `pkid` ASC.
- Delete confirm: `確定要刪除主代碼 <b>${item.pkid}</b>「${item.description}」？`

### Detail component

Plain `dl` grid of all fields (mirrors `partner-detail`). No primary-foreign
link buttons in this pass (children not built).

### Form component

- Reactive Forms; no `forkJoin` needed (no lookups to load).
- `pkid`: **hidden in add mode** (IDENTITY, server-assigned); shown **disabled** in edit
  mode. Read back with `getRawValue()` for the update payload. Mirrors `Partner`.
- Fields: 群組名稱 (required, maxlength 100).
- No 409 handling needed on create (IDENTITY PK).

### Sidebar placement

Add item `課程群組 CourseGroup` (`icon: pi pi-sitemap`, `route: /course-groups`) as a
**level-3 child** of the `課程管理 Course` collapsible group, which lives under the
`功能選單` section in `app.ts` (alongside `合作廠商 Partner`).

The sidebar supports three levels: section title (L1) → item (L2) → `item.children`
(L3). Course features nest under the `課程管理 Course` L2 group rather than getting
their own L1 section — see [Partner.md](Partner.md) for the history.

### Lookup service

Add `getCourseGroups(): Observable<CourseGroupLookup[]>` → `GET /api/lookups/course-groups`.

---

## Tests

### Backend (`CMS.API.Tests/CourseGroupsControllerTests.cs`)

xUnit + Moq (strict), repository mocked, no DB. Cover: GetAll, Query (keyword passed
through), GetById found/not-found, Create → CreatedAtAction, Update existing/missing,
Delete existing/missing. (No 409 test — IDENTITY PK, no Exists check.)

### Frontend

- `course-group.service.spec.ts` — assert each method hits the right URL/verb (`getById`,
  `delete` use numeric pkid, no `encodeURIComponent`).
- `course-group-list.spec.ts`, `course-group-detail.spec.ts`, `course-group-form.spec.ts` — mount with
  a mocked service; list renders rows + filter persistence; detail loads by id;
  form add-mode (pkid hidden) creates, edit-mode disables pkid and updates.

---

## Files to create / modify

**Backend (create):** `Models/CourseGroup.cs`, `Models/CourseGroupRequest.cs`,
`Models/CourseGroupQuery.cs`, `Models/CourseGroupLookup.cs`, `Repositories/ICourseGroupRepository.cs`,
`Repositories/CourseGroupRepository.cs`, `Controllers/CourseGroupsController.cs`,
`CMS.API.Tests/CourseGroupsControllerTests.cs`.
**Backend (modify):** `Program.cs` (DI), `Repositories/ILookupRepository.cs`,
`Repositories/LookupRepository.cs`, `Controllers/LookupsController.cs` (course-groups lookup).

**Frontend (create):** `core/models/course-group.model.ts`, `core/models/course-group-lookup.model.ts`,
`core/services/course-group.service.ts` (+ `.spec.ts`), `features/course-groups/course-group-list/*`,
`features/course-groups/course-group-detail/*`, `features/course-groups/course-group-form/*` (+ `.spec.ts` each).
**Frontend (modify):** `app.routes.ts` (routes), `app.ts` (sidebar item),
`core/services/lookup.service.ts` (getCourseGroups).
