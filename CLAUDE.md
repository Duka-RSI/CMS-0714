# CLAUDE.md

Always-loaded orientation for this repo. Detailed conventions and worked examples live
in `spec/` (see Reference docs) — read the relevant one before feature work; skip them
for unrelated tasks.

## Working agreements

- **Reply to the user in Traditional Chinese (繁體中文).** Code, identifiers, commit
  messages and docs stay in English.
- **Never switch ports.** API is 5000, frontend is 4200 — always. If a port is occupied
  (usually a stale dev server), identify the process (`netstat -ano`, then confirm it is
  `node` / `CMS.API` before killing), kill it, and start on the original port. Do not
  add alternate-port launch configs and do not let tooling auto-pick a port.
- **Record new conventions and decisions in CLAUDE.md** as they are made — put the
  detail in the matching `spec/*.md` doc and keep a pointer or gotcha here.

## Stack & layout

Full-stack CMS: .NET 9 Web API (Dapper, no EF) over SQL Server, plus an Angular 20
standalone app (PrimeNG, Aura theme). Features are generated one table at a time from
the SQL schema; **AppRole** is the canonical end-to-end example (PublishStatus, Partner
and CourseGroup are further worked patterns).

```
database/           SQL schema — source of truth (auth.sql, admin.sql, course.sql, promotion.sql)
spec/               Conventions, per-feature build specs, reference docs
src/CMS.API/        .NET 9 Web API (Dapper); solution file: src/CMS.sln
src/CMS.API.Tests/  xUnit + Moq controller tests (repository mocked — never hits the DB)
src/CMS.NG/         Angular 20 standalone + PrimeNG
```

## Commands

Backend (from `src/`):
```powershell
dotnet build CMS.sln
dotnet run --project CMS.API --urls http://localhost:5000   # Swagger at /swagger
dotnet test CMS.API.Tests
```

Frontend (from `src/CMS.NG/`):
```powershell
ng serve                                           # dev server → :4200
ng build
ng test --watch=false --browsers=ChromeHeadless    # needs $env:CHROME_BIN → chrome.exe
```

## Reference docs (read before feature work)

- `spec/backend-conventions.md` — Dapper repo/model/controller patterns; PK types
  (string / user-assigned / IDENTITY); lookup endpoints; nchar/date; N-N; no-RowAudit.
- `spec/frontend-conventions.md` — standalone component + service + list/detail/form;
  form PK handling; bit columns; in-place list editing (Course list is the worked
  example); routing; sidebar; bundle budget.
- `spec/reference-features.md` — worked features + their quirks; deferred FK-link
  buttons; the "adding a feature" workflow.
- `spec/code-gen.convention.md` — terse code-gen checklist.
- `spec/feature-spec.template.md` — spec sections to fill when analysing a table.

## Gotchas

- **.NET SDK pinned to 9** via `global.json` (SDK 10 is installed) — target `net9.0`.
- **Ports fixed**: API 5000, frontend 4200. No proxy — the frontend calls the API via
  `@env/environment` `apiUrl`, so both servers must run to use the app. If a port is
  taken, kill the occupant and reuse it (see Working agreements) — never switch ports.
- **DB**: `.\SQLEXPRESS`, database `CMS`, Trusted Connection (`CMS.API/appsettings.json`).
- **Stop the API dev server before `dotnet build`/`dotnet test`** — a live `dotnet run`
  locks `CMS.API.exe` (MSB3027); `taskkill /PID <pid> /F`, rebuild, restart.
- **No RowAudit infrastructure exists** despite the `/crud` skill mentioning it — don't
  add audit logging.
- **Update endpoints sync N-N sets from the request** — never build a PUT from a list
  row (its N-N pkid arrays are empty; they load on GET-by-id only). Fetch the full
  record, merge, then PUT — otherwise the links are silently wiped.
- **`.claude/` is untracked local tooling** — keep it out of commits; never `git add -A`
  blindly.
