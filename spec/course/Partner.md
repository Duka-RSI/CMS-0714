# Build Spec for Partner
- database schema: `.\database\course.sql`

## Summary

`Partner` is a lookup-style master table listing the training partners (合作廠商)
whose courses appear in the CMS. It carries a display `Name`, an `AppKey` code, two
context-specific display names (partner menu / course-detail page), a `DisplayOrder`,
and an optional logo `ImageFilename`. It has **no foreign keys** and **no N-N
relationships**, but it **is an FK target** for `Course`, `Certification`, and
`PartnerCourseGroup` (all reference `Partner_pkid`), so it needs a slim lookup endpoint.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **smallint IDENTITY** (auto-generated; hidden in add, read-only in edit) |
| Foreign Keys | None |
| Required Fields | `Name`, `AppKey`, `NameOnPartnerMenu`, `NameOnCourseDetailPage`, `DisplayOrder` |
| N-N Relationships | N/A |
| Primary-Foreign Links | `Course`, `Certification`, `PartnerCourseGroup` reference `Partner_pkid` (child features not yet built — links deferred) |
| Query Filters | keyword (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage) |
| Default Sort | `DisplayOrder ASC, pkid ASC` |

---

## Localization

### Chinese Table Name

- Partner: 合作廠商
- Description: 合作廠商主資料

### Chinese Column Names

- pkid: 主代碼
- Name: 名稱
- AppKey: 關鍵字
- NameOnPartnerMenu: 廠商選單顯示名稱
- NameOnCourseDetailPage: 課程詳細頁顯示名稱
- DisplayOrder: 顯示順序
- ImageFilename: 圖片檔名

---

## Required Fields

Required (NOT NULL, excluding the IDENTITY PK):
- `Name` — nvarchar(50)
- `AppKey` — varchar(10)
- `NameOnPartnerMenu` — nvarchar(200)
- `NameOnCourseDetailPage` — nvarchar(50)
- `DisplayOrder` — int

Optional (nullable):
- `ImageFilename` — varchar(50)

---

## Foreign Keys

`Partner` has no foreign key columns.

**N/A**

---

## Foreign-Primary Links

`Partner` has no foreign key columns.

**N/A**

---

## Primary-Foreign Links

The following tables reference `Partner.pkid` as an FK target:

- **Course** (`Course.Partner_pkid`) — 對應課程 → `/courses?partnerPkid={pkid}`
- **Certification** (`Certification.Partner_pkid`) — 對應認證 → `/certifications?partnerPkid={pkid}`
- **PartnerCourseGroup** (`PartnerCourseGroup.Partner_pkid`) — 對應廠商課程群組 → `/partner-course-groups?partnerPkid={pkid}`

**Deferred:** none of these child features have list routes yet. Following the
`PublishStatus` reference (also an FK target with no built children), the Partner
list/detail pages do **not** render primary-foreign link buttons in this pass. Wire
them when the child features are generated. This section documents the intended links.

---

## N-N Relationships

`Partner` participates in no junction tables.

**N/A**

---

## Query Filters

- **keyword**: string
  - LIKE on `Name`, `AppKey`, `NameOnPartnerMenu`, `NameOnCourseDetailPage`

No FK filters (no FK columns), no bool filters (no bit columns), no date-range
filters (no date/datetime columns). The filter drawer holds a single keyword field
(mirrors the `SkillTrain` single-filter pattern).

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/partners` | **New** | Slim Partner list (`pkid`, `Name`) ordered by `DisplayOrder ASC, Name ASC` — for Course/Certification/PartnerCourseGroup FK dropdowns |

`PartnerLookup` model (`{ pkid, Name }`) added; `LookupRepository.GetPartnersAsync`,
`ILookupRepository`, and `LookupsController` GET `partners` endpoint added; matching
`LookupService.getPartners()` + `partner-lookup.model.ts` on the frontend.

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/partners` | List all |
| `POST` | `/api/partners/query` | Filtered query (body: `PartnerQuery`) |
| `GET` | `/api/partners/{id}` | Get by pkid (`short` route param) |
| `POST` | `/api/partners` | Create (pkid is IDENTITY — omitted from body; returns new pkid) |
| `PUT` | `/api/partners` | Update (pkid from body, immutable) |
| `DELETE` | `/api/partners/{id}` | Delete |
| `GET` | `/api/lookups/partners` | Slim lookup list (new) |

- **No 409 uniqueness check**: `pkid` is IDENTITY (auto-generated), and there is no
  UNIQUE constraint on `AppKey` in the schema, so `Create` inserts directly and returns
  `SELECT CAST(SCOPE_IDENTITY() AS smallint)`. Mirrors the `Course` IDENTITY pattern,
  **not** the `PublishStatus` user-assigned-PK 409 pattern.
- No auth attributes (matches AppRole/PublishStatus).

---

## Backend Notes

### Models

```csharp
// Partner.cs (response)
public class Partner
{
    public short Pkid { get; set; }
    public string Name { get; set; } = string.Empty;
    public string AppKey { get; set; } = string.Empty;
    public string NameOnPartnerMenu { get; set; } = string.Empty;
    public string NameOnCourseDetailPage { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public string? ImageFilename { get; set; }
}

// PartnerRequest.cs (write DTO — pkid used on UPDATE only, IDENTITY on INSERT)
public class PartnerRequest
{
    public short Pkid { get; set; }

    [Required, MaxLength(50)]  public string Name { get; set; } = string.Empty;
    [Required, MaxLength(10)]  public string AppKey { get; set; } = string.Empty;
    [Required, MaxLength(200)] public string NameOnPartnerMenu { get; set; } = string.Empty;
    [Required, MaxLength(50)]  public string NameOnCourseDetailPage { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    [MaxLength(50)] public string? ImageFilename { get; set; }
}

// PartnerQuery.cs (search DTO)
public class PartnerQuery
{
    public string? Keyword { get; set; }
}

// PartnerLookup.cs (slim lookup)
public class PartnerLookup
{
    public short Pkid { get; set; }
    public string Name { get; set; } = string.Empty;
}
```

### SQL — SELECT

```sql
SELECT p.pkid, p.Name, p.AppKey, p.NameOnPartnerMenu, p.NameOnCourseDetailPage,
       p.DisplayOrder, p.ImageFilename
FROM Partner p
ORDER BY p.DisplayOrder ASC, p.pkid ASC
```

Query adds: `WHERE (@Keyword IS NULL OR p.Name LIKE @Keyword OR p.AppKey LIKE @Keyword
OR p.NameOnPartnerMenu LIKE @Keyword OR p.NameOnCourseDetailPage LIKE @Keyword)`.

No `nchar` columns, so no `RTRIM()` needed. No `date`/`time` columns.

### SQL — INSERT

```sql
INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
SELECT CAST(SCOPE_IDENTITY() AS smallint);
```

`pkid` is IDENTITY — excluded from INSERT; re-read via `GetByIdAsync(newPkid)`.

### SQL — UPDATE

```sql
UPDATE Partner
SET Name = @Name, AppKey = @AppKey, NameOnPartnerMenu = @NameOnPartnerMenu,
    NameOnCourseDetailPage = @NameOnCourseDetailPage, DisplayOrder = @DisplayOrder,
    ImageFilename = @ImageFilename
WHERE pkid = @Pkid;
```

`pkid` immutable — appears only in the `WHERE`.

### Lookup SQL

```sql
SELECT pkid, Name FROM Partner ORDER BY DisplayOrder ASC, Name ASC
```

### Registration

Add to `Program.cs`: `AddScoped<IPartnerRepository, PartnerRepository>()`. Extend the
existing `ILookupRepository`/`LookupRepository`/`LookupsController` with the partners endpoint.

---

## Frontend Notes

### Angular model (`partner.model.ts`)

```ts
export interface Partner {
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}
export interface PartnerRequest {
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}
export interface PartnerQuery {
  keyword?: string | null;
}
```

Plus `partner-lookup.model.ts`: `{ pkid: number; name: string }`.

### Route table (`app.routes.ts`)

| Path | Component | Notes |
|------|-----------|-------|
| `partners` | `PartnerList` | list |
| `partners/new` | `PartnerForm` | **before** `:id` |
| `partners/:id/edit` | `PartnerForm` | edit |
| `partners/:id` | `PartnerDetail` | detail |

### List component

- Columns: 主代碼 (pkid), 名稱 (name, links to detail), 關鍵字 (appKey),
  顯示順序 (displayOrder), 圖片檔名 (imageFilename), 操作.
- Filter drawer: single 關鍵字 input.
- Session storage: `partner-list-filters`, `partner-list-sort`, `partner-list-page`.
- Default sort `displayOrder` ASC.
- Delete confirm: `確定要刪除主代碼 <b>${item.pkid}</b>「${item.name}」？`

### Detail component

Plain `dl` grid of all fields (mirrors `publish-status-detail`). No primary-foreign
link buttons in this pass (children not built).

### Form component

- Reactive Forms; no `forkJoin` needed (no lookups to load).
- `pkid`: **hidden in add mode** (IDENTITY, server-assigned); shown **disabled** in edit
  mode. Read back with `getRawValue()` for the update payload. This differs from
  `PublishStatus` (user-assigned PK, editable in add) — Partner mirrors the `Course`
  IDENTITY behavior.
- Fields: 名稱 (required, maxlength 50), 關鍵字 (required, maxlength 10),
  廠商選單顯示名稱 (required, maxlength 200), 課程詳細頁顯示名稱 (required, maxlength 50),
  顯示順序 (required, `p-inputNumber`), 圖片檔名 (optional, maxlength 50).
- No 409 handling needed on create (IDENTITY PK).

### Sidebar placement

Add item `合作廠商 Partner` (`icon: pi pi-building`, `route: /partners`) as a
**level-3 child** of the `課程管理 Course` collapsible group under the `功能選單`
section in `app.ts`.

**Superseded:** this originally created a separate top-level `課程管理 Course` section,
because the two-level sidebar of the time could not hang links off the disabled
`課程管理 Course` placeholder under `功能選單`. The sidebar now supports three levels
(section → item → `item.children`), so the placeholder became a collapsible group and
the duplicate section was removed. New course features go under that group as L3 links.

### Lookup service

Add `getPartners(): Observable<PartnerLookup[]>` → `GET /api/lookups/partners`.

---

## Tests

### Backend (`CMS.API.Tests/PartnersControllerTests.cs`)

xUnit + Moq (strict), repository mocked, no DB. Cover: GetAll, Query (keyword passed
through), GetById found/not-found, Create → CreatedAtAction, Update existing/missing,
Delete existing/missing. (No 409 test — IDENTITY PK, no Exists check.)

### Frontend

- `partner.service.spec.ts` — assert each method hits the right URL/verb (`getById`,
  `delete` use numeric pkid, no `encodeURIComponent`).
- `partner-list.spec.ts`, `partner-detail.spec.ts`, `partner-form.spec.ts` — mount with
  a mocked service; list renders rows + filter persistence; detail loads by id;
  form add-mode (pkid hidden) creates, edit-mode disables pkid and updates.

---

## Files to create / modify

**Backend (create):** `Models/Partner.cs`, `Models/PartnerRequest.cs`,
`Models/PartnerQuery.cs`, `Models/PartnerLookup.cs`, `Repositories/IPartnerRepository.cs`,
`Repositories/PartnerRepository.cs`, `Controllers/PartnersController.cs`,
`CMS.API.Tests/PartnersControllerTests.cs`.
**Backend (modify):** `Program.cs` (DI), `Repositories/ILookupRepository.cs`,
`Repositories/LookupRepository.cs`, `Controllers/LookupsController.cs` (partners lookup).

**Frontend (create):** `core/models/partner.model.ts`, `core/models/partner-lookup.model.ts`,
`core/services/partner.service.ts` (+ `.spec.ts`), `features/partners/partner-list/*`,
`features/partners/partner-detail/*`, `features/partners/partner-form/*` (+ `.spec.ts` each).
**Frontend (modify):** `app.routes.ts` (routes), `app.ts` (sidebar section),
`core/services/lookup.service.ts` (getPartners).
</content>
</invoke>
