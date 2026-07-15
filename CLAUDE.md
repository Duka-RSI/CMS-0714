# CLAUDE.md

Always-loaded orientation for this repo. Detailed conventions and worked examples live
in the **reference docs** below — read the relevant one when adding or modifying a
feature; don't load them for unrelated work.

## Overview

Full-stack CMS: a .NET 9 Web API (Dapper, no EF) over a SQL Server database, plus an
Angular 20 standalone app (PrimeNG, Aura theme). Features are generated one table at a
time from the SQL schema. **AppRole** is the canonical end-to-end example; **PublishStatus**,
**Partner**, and **CourseGroup** are additional worked patterns.

## Layout

```
database/            SQL schema (source of truth: auth.sql, admin.sql, course.sql, promotion.sql)
spec/                Conventions + per-feature build specs + reference docs (see below)
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
dotnet build CMS.sln                                          # build all
dotnet run --project CMS.API --urls http://localhost:5000     # API → :5000, Swagger at /swagger
dotnet test CMS.API.Tests                                     # xUnit tests
```

Frontend (run from `src/CMS.NG/`):
```powershell
ng serve                                           # dev server → :4200
ng build                                           # production build
ng test --watch=false --browsers=ChromeHeadless    # Karma/Jasmine (set $env:CHROME_BIN to chrome.exe)
```

## Reference docs (read before feature work)

- `spec/backend-conventions.md` — Dapper repo/model/controller patterns; PK-type handling
  (string / user-assigned / IDENTITY); lookup endpoints; nchar/date; N-N; no-RowAudit.
- `spec/frontend-conventions.md` — standalone component + service + list/detail/form;
  form PK handling; bit columns; routing; sidebar; bundle budget.
- `spec/reference-features.md` — the worked features + their specific facts, deferred
  FK-link buttons, and the "adding a feature" workflow.
- `spec/code-gen.convention.md` — terse code-gen checklist.
- `spec/feature-spec.template.md` — spec sections to fill when analysing a table.

## Always-relevant facts

- **.NET SDK is pinned to 9** via `global.json` (SDK 10 is installed) — target `net9.0`.
- **Ports**: API 5000, frontend 4200 (fixed). Frontend calls the API directly (no proxy)
  via `@env/environment` `apiUrl`; both servers must run to use the app.
- **DB**: connection string (`CMS.API/appsettings.json`) targets `.\SQLEXPRESS`, database
  `CMS`, Trusted Connection. Tests do **not** hit the DB (repository is mocked).
- **Stop the API dev server before `dotnet build`/`dotnet test`** — a live `dotnet run`
  locks `CMS.API.exe` (build error MSB3027); `taskkill /PID <pid> /F`, rebuild, restart.
- **`ng test` needs `$env:CHROME_BIN`** pointing at `chrome.exe`.
- **No RowAudit infrastructure exists** despite the `/crud` skill mentioning it — don't
  add audit logging.
- **`.claude/` is local tooling** (settings, the `/crud` skill, a worktree with binaries),
  untracked — keep it out of commits; don't `git add -A` blindly.
