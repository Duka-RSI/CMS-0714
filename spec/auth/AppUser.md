# Build Spec for AppUser
- database schema: `.\database\auth.sql`

## Summary

`AppUser` is the application user master table (使用者). Like `AppRole`, its real
primary key is a **string** (`UserId`), with `pkid` as an IDENTITY surrogate shown as
`主代碼`. It carries a display `UserName`, an `IsActive` flag, and two password columns
(`PasswordHash`, `PasswordUpdatedTime`) that are **backend-only** — never sent to or
accepted from the frontend. It is **N-N with AppRole** via `AppUserRole` (the mirror of
the relationship `AppRole` already implements).

`AppRole` is the closest worked example — mirror it end to end.

| Item | Detail |
|------|--------|
| Primary Key | **`UserId` nvarchar(200)** (string PK, immutable on edit). `pkid` int IDENTITY is a surrogate, display-only |
| Foreign Keys | None outbound |
| Required Fields | `UserId`, `UserName`, `IsActive` (`PasswordHash` is server-generated) |
| N-N Relationships | `AppUserRole` → `AppRole` (`RoleIds: string[]`) |
| Primary-Foreign Links | `AppUserRole` references `AppUser.UserId` (surfaced as the N-N, not a nav button) |
| Query Filters | keyword (UserId, UserName), IsActive (tri-state) |
| Default Sort | `UserId ASC` |

---

## Localization

### Chinese Table Name

- AppUser: 使用者
- Description: 系統使用者主資料

### Chinese Column Names

- pkid: 主代碼
- UserId: 使用者代碼
- UserName: 使用者名稱
- IsActive: 啟用
- PasswordHash: (不顯示 — 後端專用)
- PasswordUpdatedTime: 密碼更新時間 (唯讀顯示)

---

## Required Fields

Required (NOT NULL, excluding the IDENTITY surrogate and backend-only columns):
- `UserId` — nvarchar(200), the PK
- `UserName` — nvarchar(200)
- `IsActive` — bit (DB default 1)

Optional (nullable):
- `PasswordUpdatedTime` — datetime (read-only in the UI; never set from a request)

Backend-only (NOT in `AppUserRequest`, NOT in any Angular model):
- `PasswordHash` — nvarchar(800), NOT NULL, server-generated (see Password Handling)

---

## Foreign Keys

`AppUser` has no outbound foreign key columns.

**N/A**

---

## Foreign-Primary Links

`AppUser` has no outbound foreign key columns.

**N/A**

---

## Primary-Foreign Links

`AppUserRole.UserId` references `AppUser.UserId`. This is the junction of the AppRole
N-N and is surfaced as the 角色 multiselect / 角色數 count, **not** as a nav button.

**N/A** (no separate child list route).

---

## N-N Relationships

- **Junction**: `AppUserRole` (`UserId`, `RoleId`; plus a `pkid` IDENTITY surrogate).
- **Related entity (B)**: `AppRole`, lookup `GET /api/lookups/app-roles`.
- **List / Detail**: show 角色數 (`RoleCount`, correlated subquery) in the list;
  detail lists the assigned role names.
- **Form**: `p-multiSelect` of roles.
- **Request field**: `RoleIds: List<string>` (mirrors `AppRoleRequest.UserIds`).
- **Sync on save** (inside the transaction, same as `AppRoleRepository.SyncUsersAsync`):
  1. `DELETE FROM AppUserRole WHERE UserId = @UserId`
  2. Bulk `INSERT` the new rows.

This is the exact mirror of the `AppRole ↔ AppUser` N-N that `AppRole` already owns.

---

## Password Handling (feature-specific — read carefully)

`PasswordHash` is **never** exposed: excluded from `AppUser` (response), `AppUserRequest`,
and every Angular model/form. There is no API input for it.

- **On CREATE**: read `SysConfig.configValue` where `configKey = 'appConfig'`, parse it as
  JSON, take the `defaultPassword` property, hash it, and store the result.
- **On UPDATE**: `PasswordHash` and `PasswordUpdatedTime` are **not** in the UPDATE
  statement at all — an edit can never alter them.
- **Reset**: `POST /api/app-users/{id}/reset-password` re-hashes the SysConfig default
  password and writes it back, setting `PasswordUpdatedTime = GETUTCDATE()`.
- **`PasswordUpdatedTime` on CREATE**: left **NULL** — meaning "user still has the default
  password and has never set their own". Confirmed decision; the column is nullable.

### Hash algorithm and encoding

**Unsalted SHA-256, lower-case hex** (`Convert.ToHexString(...).ToLowerInvariant()`),
UTF-8 bytes of the plaintext.

This matches the **existing rows** in the database, which are 64-char lower-case hex
(verified against live data). Encoding matters: Base64 or upper-case hex would produce
values the existing login path cannot verify.

> ⚠️ **Security note (documented, not fixed here).** Unsalted SHA-256 is not a password
> hashing function — it is fast and unsalted, so it is vulnerable to rainbow-table and
> GPU brute-force attacks. A salted adaptive KDF (bcrypt / Argon2id / PBKDF2) is the
> correct choice. This spec deliberately keeps SHA-256 **to stay compatible with the
> existing `PasswordHash` values and login path** — changing it here would lock out every
> existing user. Migrating the scheme is a separate piece of work (hash-on-login upgrade
> or a forced reset), tracked outside this feature.
>
> Also inherent to the design: every user created with the shared default password gets an
> **identical** `PasswordHash`, which is a direct consequence of hashing a constant without
> a salt. `PasswordUpdatedTime IS NULL` is the flag for "still on the default".

### SysConfig access

New slim read-only repository (`ISysConfigRepository` / `SysConfigRepository`):
`GetAppConfigAsync()` → `SELECT configValue FROM SysConfig WHERE configKey = 'appConfig'`,
deserialized to `AppConfig` (`DefaultPassword`). Missing row / missing-or-blank
`defaultPassword` / malformed JSON → throw `InvalidOperationException`; the controller
maps it to **500** with a clear message (a user cannot be created without a password,
and `PasswordHash` is NOT NULL).

JSON is parsed case-insensitively (`PropertyNameCaseInsensitive = true`) since the stored
keys are camelCase.

> `appConfig` also holds a `symmetricSecurityKey` (JWT signing secret). Only
> `defaultPassword` is read; the model deliberately does not bind the other properties.

---

## Query Filters

- **keyword**: string — LIKE on `UserId`, `UserName`.
- **isActive**: `bool?` — tri-state: null = no filter, true = 啟用, false = 停用.

No FK filters (no outbound FKs). No date-range filter on `PasswordUpdatedTime`
(operational metadata, not a useful list filter).

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/app-users` | **Exists** | `{ userId, userName }` — used by the AppRole form |
| `GET /api/lookups/app-roles` | **New** | `{ roleId, roleName }` ordered by `RoleId ASC` — for the AppUser form's 角色 multiselect |

`AppRoleLookup` model added; `LookupRepository.GetAppRolesAsync`, `ILookupRepository`, and
`LookupsController` GET `app-roles` added; matching `LookupService.getAppRoles()` +
`app-role-lookup.model.ts` on the frontend.

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/app-users` | List all |
| `POST` | `/api/app-users/query` | Filtered query (body: `AppUserQuery`) |
| `GET` | `/api/app-users/{id}` | Get by UserId (string PK), includes `RoleIds` |
| `POST` | `/api/app-users` | Create — **409** if UserId exists; hashes the default password |
| `PUT` | `/api/app-users` | Update (UserId from body, immutable; never touches PasswordHash) |
| `DELETE` | `/api/app-users/{id}` | Delete (cascades AppUserRole rows first) |
| `POST` | `/api/app-users/{id}/reset-password` | Reset to the SysConfig default; **204**, **404** if missing |
| `GET` | `/api/lookups/app-roles` | Slim lookup list (new) |

- **409 on create**: `UserId` is a user-assigned string PK → `ExistsAsync` guard, mirroring
  `AppRolesController.Create`.
- No auth attributes (matches AppRole/PublishStatus/Partner — this codebase has no auth
  pipeline wired yet).

---

## Backend Notes

### Models

```csharp
// AppUser.cs (response) — no PasswordHash
public class AppUser
{
    public int Pkid { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime? PasswordUpdatedTime { get; set; }
    public int RoleCount { get; set; }        // subquery count
    public List<string> RoleIds { get; set; } = [];   // GET-by-id only
}

// AppUserRequest.cs (write DTO) — no PasswordHash, no PasswordUpdatedTime
public class AppUserRequest
{
    [Required, MaxLength(200)] public string UserId { get; set; } = string.Empty;
    [Required, MaxLength(200)] public string UserName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public List<string> RoleIds { get; set; } = [];
}

// AppUserQuery.cs (search DTO)
public class AppUserQuery
{
    public string? Keyword { get; set; }
    public bool? IsActive { get; set; }
}

// AppRoleLookup.cs (slim lookup)
public class AppRoleLookup
{
    public string RoleId { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
}

// AppConfig.cs (SysConfig 'appConfig' JSON — only the property we need)
public class AppConfig
{
    public string? DefaultPassword { get; set; }
}
```

### SQL — SELECT

`PasswordHash` is **never** selected.

```sql
SELECT u.pkid, u.UserId, u.UserName, u.IsActive, u.PasswordUpdatedTime,
       (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.UserId = u.UserId) AS RoleCount
FROM AppUser u
ORDER BY u.UserId ASC
```

Query adds: `WHERE (@Keyword IS NULL OR u.UserId LIKE @Keyword OR u.UserName LIKE @Keyword)
AND (@IsActive IS NULL OR u.IsActive = @IsActive)`.

GET-by-id additionally reads `SELECT RoleId FROM AppUserRole WHERE UserId = @UserId ORDER BY RoleId`.

No `nchar` columns → no `RTRIM()`. `PasswordUpdatedTime` is `datetime` → `DateTime?`
(not `DateOnly`); the frontend must append `'Z'` before parsing (Dapper returns
`Kind = Unspecified`).

### SQL — INSERT

```sql
INSERT INTO AppUser (UserId, UserName, IsActive, PasswordHash, PasswordUpdatedTime)
VALUES (@UserId, @UserName, @IsActive, @PasswordHash, NULL);
```

`UserId` is a user-assigned PK → written in the INSERT, no `SCOPE_IDENTITY()`.
`@PasswordHash` comes from hashing the SysConfig default; `PasswordUpdatedTime` is NULL.

### SQL — UPDATE

```sql
UPDATE AppUser
SET UserName = @UserName, IsActive = @IsActive
WHERE UserId = @UserId;
```

`UserId` immutable (`WHERE` only). `PasswordHash` / `PasswordUpdatedTime` deliberately absent.

### SQL — reset password

```sql
UPDATE AppUser
SET PasswordHash = @PasswordHash, PasswordUpdatedTime = GETUTCDATE()
WHERE UserId = @UserId;
```

### SQL — DELETE

```sql
DELETE FROM AppUserRole WHERE UserId = @UserId;   -- FK children first
DELETE FROM AppUser     WHERE UserId = @UserId;
```

Both inside one transaction (mirrors `AppRoleRepository.DeleteAsync`).

### N-N Sync Pattern

```sql
DELETE FROM AppUserRole WHERE UserId = @UserId;
INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId);  -- per RoleId
```

### Registration

`Program.cs`: `AddScoped<IAppUserRepository, AppUserRepository>()` and
`AddScoped<ISysConfigRepository, SysConfigRepository>()`. Extend the existing
`ILookupRepository`/`LookupRepository`/`LookupsController` with `app-roles`.

---

## Frontend Notes

### Angular model (`app-user.model.ts`)

No password field anywhere.

```ts
export interface AppUser {
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  passwordUpdatedTime: string | null;
  roleCount: number;
  roleIds: string[];
}
export interface AppUserRequest {
  userId: string;
  userName: string;
  isActive: boolean;
  roleIds: string[];
}
export interface AppUserQuery {
  keyword?: string | null;
  isActive?: boolean | null;
}
```

Plus `app-role-lookup.model.ts`: `{ roleId: string; roleName: string }`.

### Route table (`app.routes.ts`)

| Path | Component | Notes |
|------|-----------|-------|
| `app-users` | `AppUserList` | list |
| `app-users/new` | `AppUserForm` | **before** `:id` |
| `app-users/:id/edit` | `AppUserForm` | edit |
| `app-users/:id` | `AppUserDetail` | detail |

String PK → the service `encodeURIComponent`s the id in `getById` / `delete` /
`resetPassword` (UserIds are e-mail addresses, e.g. `miles@uuu.com.tw`).

### List component

- Columns: 主代碼 (pkid), 使用者代碼 (userId, links to detail), 使用者名稱 (userName),
  啟用 (isActive, tag), 角色數 (roleCount), 密碼更新時間 (passwordUpdatedTime), 操作.
- 密碼更新時間 renders `—` when null (= still on the default password).
- Filter drawer: 關鍵字 input + 啟用 tri-state select (全部 / 啟用 / 停用).
- Session storage: `app-user-list-filters`, `app-user-list-sort`, `app-user-list-page`.
- Default sort `userId` ASC.
- Delete confirm: `確定要刪除使用者代碼 <b>${item.userId}</b>「${item.userName}」？`
- **重設密碼 button** (`pi pi-key`) per row → confirm
  `確定要將使用者 <b>${item.userId}</b>「${item.userName}」的密碼重設為系統預設密碼？`
  → `resetPassword(userId)` → success toast → reload.

### Detail component

`dl` grid: 主代碼, 使用者代碼, 使用者名稱, 啟用, 密碼更新時間, 角色 (names via lookup).
No password field. Loads the app-roles lookup to render role names.

### Form component

- Reactive Forms; `forkJoin` for the app-roles lookup (+ the user on edit).
- `userId`: editable in add mode, **disabled** in edit mode (string PK, immutable).
  Read back via `getRawValue()`.
- Fields: 使用者代碼 (required, maxlength 200), 使用者名稱 (required, maxlength 200),
  啟用 (`p-toggleSwitch`, default true), 角色 (`p-multiSelect`, optional).
- **No password field at all** — on create the backend assigns the default hash.
  An add-mode hint tells the admin: 新使用者將以系統預設密碼建立。
- 409 handling on create → error toast 使用者代碼已存在。

### Sidebar placement

`系統管理 Admin` → the existing **`使用者與角色 Access`** level-2 collapsible group already
contains a disabled `使用者 AppUser` placeholder. Give that item
`route: '/app-users'` (it stops being a placeholder). No new group or section.

### Lookup service

Add `getAppRoles(): Observable<AppRoleLookup[]>` → `GET /api/lookups/app-roles`.

---

## Tests

### Backend (`CMS.API.Tests/AppUsersControllerTests.cs`)

xUnit + Moq (strict), repository mocked, no DB. Cover: GetAll, Query (keyword + isActive
passed through), GetById found/not-found, Create → CreatedAtAction, Create duplicate → 409,
Update existing/missing, Delete existing/missing, ResetPassword existing → 204 / missing → 404.

`CMS.API.Tests/PasswordHasherTests.cs` — assert the hash is 64-char lower-case hex and
matches a known SHA-256 vector (locks the encoding so a future refactor cannot silently
switch to Base64 and break logins).

Repository-level SysConfig JSON parsing (missing row / blank defaultPassword / malformed
JSON → `InvalidOperationException`) is covered via `SysConfigRepository` being mocked in the
controller tests; the parse itself is unit-tested through `AppConfig` deserialization where
it does not need a DB.

### Frontend

- `app-user.service.spec.ts` — each method hits the right URL/verb; `getById`/`delete`/
  `resetPassword` **`encodeURIComponent`** the string PK (assert `miles@uuu.com.tw` →
  `miles%40uuu.com.tw`).
- `app-user-list.spec.ts` — renders rows, filter persistence, tri-state isActive filter,
  delete confirm, **reset-password confirm calls the service**.
- `app-user-detail.spec.ts` — loads by id, renders role names, no password shown.
- `app-user-form.spec.ts` — add mode creates (userId enabled); edit mode disables userId
  and updates; asserts **no password control exists** on the form.

---

## Files to create / modify

**Backend (create):** `Models/AppUser.cs`, `Models/AppUserRequest.cs`, `Models/AppUserQuery.cs`,
`Models/AppRoleLookup.cs`, `Models/AppConfig.cs`, `Security/PasswordHasher.cs`,
`Repositories/IAppUserRepository.cs`, `Repositories/AppUserRepository.cs`,
`Repositories/ISysConfigRepository.cs`, `Repositories/SysConfigRepository.cs`,
`Controllers/AppUsersController.cs`, `CMS.API.Tests/AppUsersControllerTests.cs`,
`CMS.API.Tests/PasswordHasherTests.cs`.
**Backend (modify):** `Program.cs` (DI ×2), `Repositories/ILookupRepository.cs`,
`Repositories/LookupRepository.cs`, `Controllers/LookupsController.cs` (app-roles lookup).

**Frontend (create):** `core/models/app-user.model.ts`, `core/models/app-role-lookup.model.ts`,
`core/services/app-user.service.ts` (+ `.spec.ts`), `features/app-users/app-user-list/*`,
`features/app-users/app-user-detail/*`, `features/app-users/app-user-form/*` (+ `.spec.ts` each).
**Frontend (modify):** `app.routes.ts` (routes), `app.ts` (route on the existing
`使用者 AppUser` item), `core/services/lookup.service.ts` (getAppRoles).
