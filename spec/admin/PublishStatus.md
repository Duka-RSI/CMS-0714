# Build Spec for PublishStatus
- database schema: `.\database\admin.sql`

## Summary

`PublishStatus` is a small, user-maintained **lookup** table describing the
publishing lifecycle of content (draft / published / discontinued). Its primary key
`pkid` is a **user-assigned `tinyint`** (NOT an IDENTITY), so the code is entered by
hand on create and is immutable on edit. It has no foreign keys and no N-N
relationships, but it **is** an FK target for `Course.PublishStatus_pkid` and
`Promotion2.PublishStatus_pkid`, so it exposes a lookup endpoint for those features'
dropdowns.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **tinyint, user-assigned** (NOT IDENTITY) → C# `byte` |
| Foreign Keys | None |
| Required Fields | `pkid`, `Description`, `IsDraft`, `IsPublished`, `IsDiscontinued` |
| N-N Relationships | N/A |
| Primary-Foreign Links | `Course.PublishStatus_pkid`, `Promotion2.PublishStatus_pkid` reference it — but those features are not yet built, so no navigation buttons are rendered |
| Query Filters | keyword (Description); IsDraft; IsPublished; IsDiscontinued (all tri-state bool) |
| Default Sort | `pkid ASC` |

---

## Localization

### Chinese Table Name

- PublishStatus: 發布狀態
- Description: 內容發布狀態代碼表（草稿／已發布／已停用）

### Chinese Column Names

- pkid: 主代碼
- Description: 狀態說明
- IsDraft: 草稿
- IsPublished: 已發布
- IsDiscontinued: 已停用

---

## Required Fields

Required (NOT NULL):
- `pkid` (byte) — **user-assigned PK**, required in add mode, read-only in edit mode
- `Description` (string, max 50)
- `IsDraft` (bool)
- `IsPublished` (bool)
- `IsDiscontinued` (bool)

Optional (nullable): none — every column is NOT NULL.

---

## Foreign Keys

`PublishStatus` has no foreign key columns.

**N/A**

---

## Foreign-Primary Links

`PublishStatus` has no foreign key columns.

**N/A**

---

## Primary-Foreign Links

The following tables reference `PublishStatus.pkid` as an FK target:

- **Course** (`Course.PublishStatus_pkid`)
- **Promotion2** (`Promotion2.PublishStatus_pkid`)

Neither `Course` nor `Promotion` is implemented as a feature yet (their list routes
do not exist). To avoid dead links, **no navigation buttons are rendered** in the
list/detail views for now. When those features are built, add link columns following
the AppRole/sample1 pattern (`/courses?publishStatusPkid={pkid}`, etc.).

**N/A (for navigation buttons — deferred until child features exist)**

---

## N-N Relationships

`PublishStatus` participates in no junction tables.

**N/A**

---

## Query Filters

`POST /api/publish-statuses/query` accepts:

- **keyword**: string
  - LIKE on `Description` (the only string column).

- **isDraft**: bool? (tri-state — null = no filter)
  - Exact match on `IsDraft`.

- **isPublished**: bool? (tri-state)
  - Exact match on `IsPublished`.

- **isDiscontinued**: bool? (tri-state)
  - Exact match on `IsDiscontinued`.

The three booleans are surfaced in the drawer as `p-select` tri-state dropdowns
(options: 不限 / 是 / 否).

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/publish-statuses` | **New** | Slim PublishStatus list (`pkid`, `Description`) ordered by `pkid ASC`, for Course/Promotion FK dropdowns |

This feature itself needs no lookup calls (no FKs), but it **provides** the lookup
above because it is an FK target elsewhere.

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/publish-statuses` | List all |
| `POST` | `/api/publish-statuses/query` | Filtered query (body: `PublishStatusQuery`) |
| `GET` | `/api/publish-statuses/{id}` | Get by pkid (byte) |
| `POST` | `/api/publish-statuses` | Create — **409** if `pkid` already exists (user-assigned PK) |
| `PUT` | `/api/publish-statuses` | Update (pkid from body; immutable) |
| `DELETE` | `/api/publish-statuses/{id}` | Delete by pkid |
| `GET` | `/api/lookups/publish-statuses` | Slim lookup list |

No auth attributes (mirrors AppRole — none applied).

---

## Backend Notes

### Models

```csharp
// Models/PublishStatus.cs — response model
public class PublishStatus
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}

// Models/PublishStatusRequest.cs — write DTO (pkid is the user-assigned PK)
public class PublishStatusRequest
{
    public byte Pkid { get; set; }

    [Required]
    [MaxLength(50)]
    public string Description { get; set; } = string.Empty;

    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}

// Models/PublishStatusQuery.cs — search DTO
public class PublishStatusQuery
{
    public string? Keyword { get; set; }
    public bool? IsDraft { get; set; }
    public bool? IsPublished { get; set; }
    public bool? IsDiscontinued { get; set; }
}
```

Also add a slim lookup model reused by `LookupRepository`:

```csharp
// Models/PublishStatusLookup.cs
public class PublishStatusLookup
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}
```

### SQL — SELECT

No JOINs, no aliases needed (all column names map directly):

```sql
SELECT s.pkid, s.Description, s.IsDraft, s.IsPublished, s.IsDiscontinued
FROM PublishStatus s
ORDER BY s.pkid ASC
```

Query adds:
```sql
WHERE (@Keyword IS NULL OR s.Description LIKE @Keyword)
  AND (@IsDraft IS NULL OR s.IsDraft = @IsDraft)
  AND (@IsPublished IS NULL OR s.IsPublished = @IsPublished)
  AND (@IsDiscontinued IS NULL OR s.IsDiscontinued = @IsDiscontinued)
```

### SQL — INSERT

`pkid` **is written** (user-assigned, no SCOPE_IDENTITY):
```sql
INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued);
```

### SQL — UPDATE

`pkid` is the immutable key (WHERE only):
```sql
UPDATE PublishStatus
SET Description = @Description, IsDraft = @IsDraft,
    IsPublished = @IsPublished, IsDiscontinued = @IsDiscontinued
WHERE pkid = @Pkid;
```

### SQL — DELETE / EXISTS

```sql
DELETE FROM PublishStatus WHERE pkid = @Pkid;
SELECT COUNT(1) FROM PublishStatus WHERE pkid = @Pkid;   -- ExistsAsync (create guard)
```

### Special Column Notes

- **`pkid` is a user-assigned `tinyint` PK, not IDENTITY.** It is included in INSERT
  and in the request; `Create` returns `409 Conflict` if it already exists
  (mirrors AppRole's `ExistsAsync` guard on its string PK).
- No `nchar`, `date`, `time`, FK, or N-N columns → no RTRIM, no type handlers, no
  junction sync.
- **RowAudit is used** (added after this spec was first written): the repository
  calls `IRowAuditWriter` on every write, and the detail/form pages host
  `<app-row-audit-badge tableName="PublishStatus" [pkid]="…" />` — see
  `spec/admin/RowAudit.md`.

---

## Frontend Notes

### Model (`core/models/publish-status.model.ts`)

```ts
export interface PublishStatus {
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}
export interface PublishStatusRequest {
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}
export interface PublishStatusQuery {
  keyword?: string | null;
  isDraft?: boolean | null;
  isPublished?: boolean | null;
  isDiscontinued?: boolean | null;
}
```

Add to `core/models/publish-status-lookup.model.ts`:
```ts
export interface PublishStatusLookup { pkid: number; description: string; }
```

### Service (`core/services/publish-status.service.ts`)

Standard six methods against `${apiUrl}/publish-statuses`. `pkid` is numeric, so
`getById`/`delete` take a `number` (no `encodeURIComponent` needed, but the route is
`{id}` with no `:int` constraint on the API side).

Add `getPublishStatuses()` to `LookupService` → `GET /lookups/publish-statuses`.

### Routes (`app.routes.ts`)

```
publish-statuses            → PublishStatusList
publish-statuses/new        → PublishStatusForm   (BEFORE :id)
publish-statuses/:id/edit   → PublishStatusForm
publish-statuses/:id        → PublishStatusDetail
```

### List component

- Columns: 主代碼 (pkid), 狀態說明 (description), 草稿 (isDraft ✓/✗ tag),
  已發布 (isPublished), 已停用 (isDiscontinued), 操作.
- Booleans rendered as `p-tag` (是=success/info, 否=secondary).
- Filter drawer: keyword input + three tri-state `p-select` dropdowns
  (不限 / 是 / 否), each `appendTo="body"`.
- `dataKey="pkid"`, default sort `pkid ASC`.
- Session storage: `publish-status-list-filters`, `publish-status-list-sort`,
  `publish-status-list-page`.
- Delete confirm: ``確定要刪除主代碼 <b>${item.pkid}</b>「${item.description}」？``

### Detail component

- Card with 發布狀態 fields; booleans as `p-tag`. No FK/N-N sections, no
  navigation buttons (child features not built). 返回 / 編輯 toolbar.

### Form component

- Reactive form. `pkid` is a required `p-inputNumber` in **add** mode, `disable()`d
  in **edit** mode and read back with `getRawValue()` (mirrors AppRole's `roleId`).
- `description` required text input (max 50).
- Three booleans as `p-toggleswitch` (or `p-checkbox`) controls.
- No `forkJoin` lookups needed; edit mode still loads the record via `getById`.
- 409 on create → toast "主代碼「N」已存在。".

### Sidebar

Add under existing group **系統管理 Admin** in `app.ts` (and it renders via
`app.html`'s data-driven menu):
```
{ label: '發布狀態 PublishStatus', icon: 'pi pi-flag', route: '/publish-statuses' }
```

---

## Tests

### Backend (`CMS.API.Tests/PublishStatusesControllerTests.cs`)

Mock `IPublishStatusRepository` (Moq, strict). Cover:
- `GetAll` → 200 with list
- `Query` passes keyword / IsDraft through, returns filtered
- `GetById` found → 200; missing → 404
- `Create` new → 201 CreatedAtAction; existing pkid → 409 Conflict (CreateAsync never called)
- `Update` existing → 204; missing → 404
- `Delete` existing → 204; missing → 404

### Frontend

- `publish-status.service.spec.ts` — each method hits the right URL/verb;
  query body round-trips; getById/delete hit `/publish-statuses/{id}`.
- `publish-status-list.spec.ts` — loads on init, renders rows, applyFilter/clearFilter
  persist to sessionStorage, confirmDelete deletes on accept.
- `publish-status-detail.spec.ts` — loads by id, renders fields.
- `publish-status-form.spec.ts` — add mode enables pkid; edit mode disables pkid and
  keeps it in the payload; invalid form does not submit; 409 shows conflict toast.

---

## Files to Create / Modify

| Side | File | Action |
|------|------|--------|
| API | `Models/PublishStatus.cs` | create |
| API | `Models/PublishStatusRequest.cs` | create |
| API | `Models/PublishStatusQuery.cs` | create |
| API | `Models/PublishStatusLookup.cs` | create |
| API | `Repositories/IPublishStatusRepository.cs` | create |
| API | `Repositories/PublishStatusRepository.cs` | create |
| API | `Controllers/PublishStatusesController.cs` | create |
| API | `Repositories/ILookupRepository.cs` | modify (add GetPublishStatusesAsync) |
| API | `Repositories/LookupRepository.cs` | modify |
| API | `Controllers/LookupsController.cs` | modify (add publish-statuses route) |
| API | `Program.cs` | modify (register IPublishStatusRepository) |
| NG | `core/models/publish-status.model.ts` | create |
| NG | `core/models/publish-status-lookup.model.ts` | create |
| NG | `core/services/publish-status.service.ts` | create |
| NG | `core/services/lookup.service.ts` | modify |
| NG | `features/publish-statuses/publish-status-list/*` | create |
| NG | `features/publish-statuses/publish-status-detail/*` | create |
| NG | `features/publish-statuses/publish-status-form/*` | create |
| NG | `app.routes.ts` | modify |
| NG | `app.ts` | modify (sidebar entry) |
| Tests | `CMS.API.Tests/PublishStatusesControllerTests.cs` | create |
| Tests | NG `*.spec.ts` (service + 3 components) | create |
