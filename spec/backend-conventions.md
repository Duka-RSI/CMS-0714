# Backend conventions (CMS.API)

Read this when adding or modifying an API feature. See `reference-features.md` for the
worked examples to mirror, and `frontend-conventions.md` for the Angular side.

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

## Primary-key handling (three variants)

- **String PKs**: route is `{id}` with no `:int` constraint; the Angular service
  wraps the value in `encodeURIComponent`. (See AppRole's `RoleId`.)
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
  type (`short` for `smallint`), no `encodeURIComponent`.

## Other backend rules

- **Lookup endpoint when the table is an FK target**: if other tables FK to this one,
  add a slim `GET /api/lookups/{plural}` returning `{ pkid, <label> }` (extend
  `ILookupRepository`/`LookupRepository`/`LookupsController` + `lookup.service.ts`).
  See `Partner` (target of Course/Certification/PartnerCourseGroup) and `CourseGroup`.
- **`nchar(n)` columns**: always `RTRIM()` in SELECTs.
- **`date`/`time` columns**: use `DateOnly`/`TimeOnly`; the Dapper type handlers
  are already registered globally in `Program.cs` (`Data/DapperTypeHandlers.cs`).
- **N-N**: delete-then-reinsert inside a transaction on save; separate query to
  read the child id list on GET-by-id. See `AppRoleRepository.SyncUsersAsync`.
- **No RowAudit** — despite the `/crud` skill's instructions, there is no
  `RowAuditWriter`, audit table, or badge component. Repositories do **no** audit
  logging. Do not add it.
- CORS allows any loopback origin; Swagger UI is at `/swagger`.
