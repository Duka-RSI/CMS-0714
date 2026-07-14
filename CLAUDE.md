# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

Full-stack CMS. Backend is a .NET 9 Web API (Dapper, no EF) over a SQL Server
database; frontend is an Angular 20 standalone app using PrimeNG. Code is
generated feature-by-feature from the SQL schema following the conventions in
`spec/code-gen.convention.md`. Three features are implemented as reference patterns:
**AppRole** (IDENTITY surrogate + string PK, N-N), **PublishStatus** (a lookup table
with a user-assigned non-IDENTITY PK, bool columns, no FK/N-N), and **Partner** (a
plain `smallint IDENTITY` PK, no FK/N-N, but *is* an FK target — has a lookup endpoint).
Mirror whichever is closer to the new table; when in doubt, AppRole is the canonical
end-to-end example.

## Layout

```
database/            SQL schema files (source of truth: auth.sql, admin.sql, course.sql, promotion.sql)
spec/                Conventions + per-feature build specs (code-gen.convention.md, sample*.spec.md, ui-sample-*.png)
global.json          Pins the .NET SDK to 9.x (rollForward latestFeature)
src/
  CMS.sln
  CMS.API/           .NET 9 Web API (Dapper)
  CMS.API.Tests/     xUnit + Moq (controller tests, no DB)
  CMS.NG/            Angular 20 standalone + PrimeNG
```

## Commands

Backend (run from `src/`):
```powershell
dotnet build CMS.sln                              # build all
dotnet run --project CMS.API --urls http://localhost:5000   # API → :5000, Swagger at /swagger
dotnet test CMS.API.Tests                          # xUnit tests
```

Frontend (run from `src/CMS.NG/`):
```powershell
ng serve                                           # dev server → :4200
ng build                                            # production build
ng test --watch=false --browsers=ChromeHeadless    # Karma/Jasmine (set $env:CHROME_BIN to chrome.exe)
```

Both servers must be running to use the app: the frontend calls the API directly
(no proxy) via `environment.ts`.

## Backend conventions (CMS.API)

- **Dapper only, async, no EF.** Every repo call uses `CommandDefinition` with a
  `CancellationToken`. Connections come from `IDbConnectionFactory`
  (`Data/SqlConnectionFactory.cs`), one open connection per operation.
- **Per feature, three models** in `Models/`: `{Table}.cs` (response, includes
  nav objects + subquery counts), `{Table}Request.cs` (write DTO), `{Table}Query.cs`
  (search DTO). Repo interface + impl in `Repositories/`, controller in `Controllers/`.
- **Register** each repo in `Program.cs` (`AddScoped`).
- **Routes**: `/api/{table-plural-kebab}`. Standard six endpoints:
  `GET /`, `POST /query`, `GET /{id}`, `POST /`, `PUT /` (pkid/PK **in body**, no route param),
  `DELETE /{id}`. Lookups live under `/api/lookups/{plural}`.
- **String PKs**: route is `{id}` with no `:int` constraint; the Angular service
  wraps the value in `encodeURIComponent`.
- **User-assigned (non-IDENTITY) PKs** (e.g. `PublishStatus.pkid` `tinyint`): the PK
  column **is** written in the INSERT (no `SCOPE_IDENTITY()`) and is included in the
  Request model; `Create` guards with `ExistsAsync` → **409 Conflict** on a duplicate.
  UPDATE keys on it in the `WHERE` only (immutable). The controller route param binds
  to the CLR type (`byte`/`short`/`int`), no `encodeURIComponent` needed on the client.
- **Plain numeric IDENTITY PKs** (e.g. `Partner.pkid` `smallint IDENTITY`, `Course.pkid`
  `int IDENTITY`): the PK is **excluded** from the INSERT and returned via
  `SELECT CAST(SCOPE_IDENTITY() AS <type>)`; it stays in the Request only for UPDATE
  (immutable, `WHERE` only). **No `ExistsAsync`/409** on create — the DB assigns the key
  (add one only if a non-PK column has a UNIQUE constraint). Route param binds to the CLR
  type (`short` for `smallint`), no `encodeURIComponent`. This is the Partner pattern.
- **Lookup endpoint when the table is an FK target**: if other tables FK to this one,
  add a slim `GET /api/lookups/{plural}` returning `{ pkid, <label> }` (extend
  `ILookupRepository`/`LookupRepository`/`LookupsController` + `lookup.service.ts`).
  See `Partner` (target of Course/Certification/PartnerCourseGroup).
- **`nchar(n)` columns**: always `RTRIM()` in SELECTs.
- **`date`/`time` columns**: use `DateOnly`/`TimeOnly`; the Dapper type handlers
  are already registered globally in `Program.cs` (`Data/DapperTypeHandlers.cs`).
- **N-N**: delete-then-reinsert inside a transaction on save; separate query to
  read the child id list on GET-by-id. See `AppRoleRepository.SyncUsersAsync`.
- CORS allows any loopback origin; Swagger UI is at `/swagger`.

## Frontend conventions (CMS.NG)

- **Standalone components**, signals for state, `inject()` for DI. PrimeNG (Aura
  theme) for all UI controls; `provideAnimationsAsync`, `MessageService` +
  `ConfirmationService` are global in `app.config.ts`.
- **Path aliases** (`tsconfig.json`): `@env/environment`, `@app/*`. API base URL
  comes from `@env/environment` (`apiUrl`) — never hardcode; no dev proxy.
- **Feature folders**: `features/{table-plural}/{table}-list|-detail|-form/`.
  Data access in `core/services/`, models in `core/models/`.
- **List page**: sortable/paginated `p-table` + `p-drawer` filter. Persist state in
  sessionStorage under `{entity}-list-filters`, `{entity}-list-sort`,
  `{entity}-list-page`. `p-select` in the drawer uses `appendTo="body"`.
- **Form page**: Reactive Forms; `forkJoin` for parallel lookup + record load on init.
  PK handling depends on the PK type:
  - String OR **user-assigned** numeric PK: editable required control in add mode;
    `disable()`d in edit mode.
  - **IDENTITY** numeric PK (server-assigned, e.g. Partner): **hidden entirely in add
    mode**; shown `disable()`d in edit mode.
  Either way the PK is read back with `getRawValue()` for the update payload. IDENTITY
  create needs no 409 handling.
  N-N uses `p-multiselect` (`appendTo="body"`, `[maxSelectedLabels]="9999"`).
- **`bit` columns**: form control is `p-toggleswitch`; list/detail display uses `p-tag`
  (是/否, severity varies); filter drawer uses a tri-state `p-select` (options 是/否,
  `[showClear]="true"`, `appendTo="body"`) bound to a `bool | null` — null = no filter.
- **Routing**: lazy `loadComponent`. Order `.../new` **before** `.../:id`.
- **Sidebar**: data-driven nav in `app.ts`; add each feature under its group
  (e.g. AppRole lives under `系統管理 Admin`).

## Adding a feature

Mirror AppRole end to end: (1) read the table in `database/*.sql` and any
`spec/{feature}.spec.md`; (2) backend models → repository → controller, register in
`Program.cs`; (3) frontend model → service → list/detail/form, add route + sidebar
entry; (4) tests both sides (xUnit controller tests with a mocked repo; Karma specs
for the service + components). Use the `spec/feature-spec.template.md` sections to
drive the analysis.

## Gotchas / project-specific facts

- **`.NET` SDK is pinned to 9** via `global.json` even though SDK 10 is installed —
  keep targeting `net9.0`.
- **`AppRole`'s primary key is `RoleId` (nvarchar), not `pkid`.** `pkid` is an
  IDENTITY surrogate shown as `主代碼`; the FK from `AppUserRole` references `RoleId`,
  so routes/updates/deletes key on `RoleId`. It's read-only in the edit form.
- **`AppRole ↔ AppUser` is N-N** via `AppUserRole` (junction on the string keys
  `RoleId`/`UserId`). The request carries `UserIds: string[]`; `使用者數` (UserCount)
  is a correlated subquery.
- **UI sample PNGs in `spec/` are style references only** — validation follows the
  DB schema (e.g. `Description` is nullable/optional even though the mockup marks it `*`).
- **Connection string** (`CMS.API/appsettings.json`) targets `.\SQLEXPRESS`, database `CMS`,
  Trusted Connection. Tests do **not** hit the DB (repository is mocked).
- **Ports**: API 5000, frontend 4200 (both fixed in launch/serve config).
- The Angular production bundle budget was raised to 1MB/2MB because PrimeNG's Aura
  theme pushes the initial bundle to ~650kB.
- **No RowAudit infrastructure exists** despite what the `/crud` skill instructions say
  — there is no `RowAuditWriter`, audit table, or badge component. Mirror AppRole/
  PublishStatus/Partner: repositories do **no** audit logging. Do not add it.
- **Primary-Foreign link buttons are deferred until the child feature exists.** When a
  table is an FK target but the referencing feature has no list route yet, document the
  intended links in the spec but do **not** wire dead nav buttons in the list/detail
  pages (follows PublishStatus and Partner). Add them when the child feature is built.
- **Stop the running API dev server before `dotnet build`/`dotnet test`** — a live
  `dotnet run` locks `CMS.API.exe` (build error MSB3027). `taskkill /PID <pid> /F` then
  rebuild; restart the server afterward.
- **`ng test` needs `$env:CHROME_BIN`** pointing at `chrome.exe` (e.g.
  `C:\Program Files\Google\Chrome\Application\chrome.exe`).
